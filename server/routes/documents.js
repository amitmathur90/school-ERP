const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const { rowToCamel, DOCUMENT_FIELDS } = require("../fieldMap");
const { authenticate, authorizeRoles } = require("../authMiddleware");

const router = express.Router();

function uid(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

// All uploaded documents live under server/uploads/students/<studentId>/ —
// a real folder per student on disk, as asked for (not just a blob in the
// database). The database only stores the file's metadata + where to find it.
const UPLOAD_ROOT = path.join(__dirname, "..", "uploads", "students");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const studentId = req.body.studentId;
    if (!studentId) return cb(new Error("studentId is required"));
    const dir = path.join(UPLOAD_ROOT, studentId);
    fs.mkdirSync(dir, { recursive: true }); // creates the student's folder the first time they upload anything
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const ALLOWED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB, matching the reference form
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error("Only JPG, JPEG, PNG, and GIF files are allowed."));
    }
    cb(null, true);
  },
});

// GET /api/documents -> flat array of metadata (no file content), frontend groups by studentId
router.get("/", authenticate, async (req, res) => {
  const { studentId } = req.query;
  const rows = studentId
    ? await db.all("SELECT * FROM documents WHERE student_id = ? ORDER BY sno", [studentId])
    : await db.all("SELECT * FROM documents ORDER BY student_id, sno");
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
    if (!student) {
      fs.unlink(req.file.path, () => {}); // don't leave an orphaned file if the student doesn't exist
      return res.status(404).json({ error: "Student not found." });
    }

    const id = uid("doc");
    // Store the path relative to the uploads root — keeps the DB portable if
    // the server ever moves to a different machine/folder.
    const relativePath = path.relative(UPLOAD_ROOT, req.file.path);
    await db.run(
      `INSERT INTO documents (id, student_id, sno, document_type, original_photocopy, document_no, file_name, file_path, file_size, mime_type, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, studentId, Number(sno) || 1, documentType || "", originalPhotocopy || "", documentNo || "",
        req.file.originalname, relativePath, req.file.size, req.file.mimetype, new Date().toISOString()]
    );

    const row = await db.get("SELECT * FROM documents WHERE id = ?", [id]);
    res.status(201).json(rowToCamel(row, DOCUMENT_FIELDS));
  });
});

// GET /api/documents/:id/file — streams the actual file (for viewing/downloading)
router.get("/:id/file", authenticate, async (req, res) => {
  const doc = await db.get("SELECT * FROM documents WHERE id = ?", [req.params.id]);
  if (!doc) return res.status(404).json({ error: "Document not found." });
  const fullPath = path.join(UPLOAD_ROOT, doc.file_path);
  if (!fullPath.startsWith(UPLOAD_ROOT)) return res.status(400).json({ error: "Invalid file path." }); // guards against a malformed/tampered path escaping the uploads folder
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "File is missing from disk." });
  res.sendFile(fullPath);
});

// DELETE /api/documents/:id — removes both the database row and the file on disk
router.delete("/:id", authenticate, authorizeRoles("super_admin", "admin"), async (req, res) => {
  const doc = await db.get("SELECT * FROM documents WHERE id = ?", [req.params.id]);
  if (!doc) return res.status(404).json({ error: "Document not found." });
  const fullPath = path.join(UPLOAD_ROOT, doc.file_path);
  fs.unlink(fullPath, () => {}); // best-effort; don't fail the request if the file's already gone
  await db.run("DELETE FROM documents WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
