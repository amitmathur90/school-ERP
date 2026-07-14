const express = require("express");
const db = require("../db");
const { rowToCamel, ACADEMIC_FIELDS } = require("../fieldMap");

const router = express.Router();

function uid(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

// GET /api/academic-details -> flat array, frontend groups by studentId
router.get("/", async (req, res) => {
  const rows = await db.all("SELECT * FROM academic_details ORDER BY student_id, sno");
  res.json(rows.map((r) => rowToCamel(r, ACADEMIC_FIELDS)));
});

// POST /api/academic-details/sync
// Body: { studentId, rows: [{ name, board, passingYear, grade, subject }, ...] }
// Replaces ALL academic detail rows for this student with the given list —
// matches how the admission wizard's editable table works (add/remove rows
// freely, then "Save Step" persists the current full set in one call).
router.post("/sync", async (req, res) => {
  const { studentId, rows } = req.body;
  if (!studentId) return res.status(400).json({ error: "studentId is required." });
  if (!Array.isArray(rows)) return res.status(400).json({ error: "rows array is required." });

  const student = await db.get("SELECT id FROM students WHERE id = ?", [studentId]);
  if (!student) return res.status(404).json({ error: "Student not found." });

  await db.run("DELETE FROM academic_details WHERE student_id = ?", [studentId]);
  const created = [];
  let sno = 1;
  for (const row of rows) {
    if (!row.name && !row.board && !row.subject) continue; // skip fully-blank rows
    const id = uid("acad");
    await db.run(
      "INSERT INTO academic_details (id, student_id, sno, name, board, passing_year, grade, subject) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, studentId, sno, row.name || "", row.board || "", row.passingYear || "", row.grade || "", row.subject || ""]
    );
    created.push({ id, studentId, sno, name: row.name || "", board: row.board || "", passingYear: row.passingYear || "", grade: row.grade || "", subject: row.subject || "" });
    sno++;
  }
  res.json({ rows: created });
});

// DELETE /api/academic-details/:id — ad-hoc single-row delete (admin use)
router.delete("/:id", async (req, res) => {
  await db.run("DELETE FROM academic_details WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
