const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const { rowToCamel, DOCUMENT_FIELDS } = require("../fieldMap");
const { authenticate, authorizeRoles } = require("../authMiddleware");

const router = express.Router();

function uid(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

// Uploaded documents are stored as bytes in the `documents.file_data` column
// (Postgres BYTEA) instead of on local disk. Render's free web service wipes
// its local filesystem on every deploy/restart, which made disk-stored files
// disappear (DB metadata survived, but the actual file was gone — "File is
// missing from disk" for admin). Storing the bytes in Postgres, the one
// piece of storage that's actually persistent here, fixes that; it's the
// same pattern already used for student/teacher photos (photo_data).
//
// UPLOAD_ROOT is kept only so any files uploaded before this change (still
// referenced by file_path on old rows, if they happen to survive on the
// currently-running instance) keep working until re-uploaded.
const UPLOAD_ROOT = path.join(__dirname, "..", "uploads", "students");

const ALLOWED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB, matching the reference form
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error("Only JPG, JPEG, PNG, and GIF files are allowed."));
    }
    cb(null, true);
  },
});

// Explicit column list — deliberately excludes file_data. This route is
// fetched in bulk for every logged-in user (loadAll on the frontend), so
// pulling every document's full binary content here would be a major,
// unnecessary performance regression. Only GET /:id/file needs file_data.
const METADATA_COLUMNS = "id, student_id, sno, document_type, original_photocopy, document_no, file_name, file_path, file_size, mime_type, uploaded_at";

// GET /api/documents -> flat array of metadata (no file content), frontend groups by studentId
router.get("/", authenticate, async (req, res) => {
  const { studentId } = req.query;
  const rows = studentId
    ? await db.all(`SELECT ${METADATA_COLUMNS} FROM documents WHERE student_id = ? ORDER BY sno`, [studentId])
    : await db.all(`SELECT ${METADATA_COLUMNS} FROM documents ORDER BY student_id, sno`);
  res.json(rows.map((r) => rowToCamel(r, DOCUMENT_FIELDS)));
});

// POST /api/documents/upload  (multipart/form-data)
// Fields: studentId, sno, documentType, originalPhotocopy, documentNo, file
router.post("/upload", (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed." });
    if (!req.file) return res.status(400).json({ error: "No file was uploaded." });

    const { studentId, sno, documentType, originalPhotocopy, documentNo } = req.body;
    const student = await db.get("SELECT id FROM students WHERE id = ?", [studentId]);
    if (!student) return res.status(404).json({ error: "Student not found." });

    const id = uid("doc");
    await db.run(
      `INSERT INTO documents (id, student_id, sno, document_type, original_photocopy, document_no, file_name, file_data, file_size, mime_type, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, studentId, Number(sno) || 1, documentType || "", originalPhotocopy || "", documentNo || "",
        req.file.originalname, req.file.buffer, req.file.size, req.file.mimetype, new Date().toISOString()]
    );

    const row = await db.get(`SELECT ${METADATA_COLUMNS} FROM documents WHERE id = ?`, [id]);
    res.status(201).json(rowToCamel(row, DOCUMENT_FIELDS));
  });
});

// GET /api/documents/:id/file — streams the actual file (for viewing/downloading)
router.get("/:id/file", authenticate, async (req, res) => {
  const doc = await db.get("SELECT file_data, file_path, mime_type FROM documents WHERE id = ?", [req.params.id]);
  if (!doc) return res.status(404).json({ error: "Document not found." });

  if (doc.file_data) {
    res.set("Content-Type", doc.mime_type || "application/octet-stream");
    return res.send(doc.file_data);
  }

  // Legacy row uploaded before file_data existed — fall back to disk in case
  // it happens to still be there on the currently-running instance.
  if (doc.file_path) {
    const fullPath = path.join(UPLOAD_ROOT, doc.file_path);
    if (fullPath.startsWith(UPLOAD_ROOT) && fs.existsSync(fullPath)) return res.sendFile(fullPath);
  }
  res.status(404).json({ error: "File is missing. Please re-upload this document." });
});

// DELETE /api/documents/:id — removes the database row (and any legacy on-disk file)
router.delete("/:id", authenticate, authorizeRoles("super_admin", "admin"), async (req, res) => {
  const doc = await db.get("SELECT file_path FROM documents WHERE id = ?", [req.params.id]);
  if (!doc) return res.status(404).json({ error: "Document not found." });
  if (doc.file_path) {
    const fullPath = path.join(UPLOAD_ROOT, doc.file_path);
    fs.unlink(fullPath, () => {}); // best-effort; don't fail the request if the file's already gone
  }
  await db.run("DELETE FROM documents WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
