const express = require("express");
const db = require("../db");
const { rowToCamel, GRADE_FIELDS } = require("../fieldMap");

const router = express.Router();

router.get("/", async (req, res) => {
  const rows = await db.all("SELECT * FROM grades");
  res.json(rows.map((r) => rowToCamel(r, GRADE_FIELDS)));
});

// POST /api/grades  { studentId, subject, examType, semester, marks, maxMarks }
router.post("/", async (req, res) => {
  const { studentId, subject, examType, semester, marks, maxMarks } = req.body;
  if (!studentId || !subject || marks === undefined) return res.status(400).json({ error: "studentId, subject and marks are required." });
  const id = `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await db.run(
    `INSERT INTO grades (id, student_id, subject, exam_type, semester, marks, max_marks) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, studentId, subject, examType || "", Number(semester) || 1, Number(marks), Number(maxMarks) || 100]
  );
  const row = await db.get("SELECT * FROM grades WHERE id = ?", [id]);
  res.status(201).json(rowToCamel(row, GRADE_FIELDS));
});

router.delete("/:id", async (req, res) => {
  await db.run("DELETE FROM grades WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
