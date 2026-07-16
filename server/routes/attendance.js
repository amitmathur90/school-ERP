const express = require("express");
const db = require("../db");
const { authenticate, authorizeRoles } = require("../authMiddleware");

const router = express.Router();

// GET /api/attendance -> flat array [{ studentId, date, subject, status }]
router.get("/", authenticate, async (req, res) => {
  const rows = await db.all("SELECT student_id, date, subject, status FROM attendance");
  res.json(rows.map((r) => ({ studentId: r.student_id, date: r.date, subject: r.subject, status: r.status })));
});

// POST /api/attendance/mark  { courseId, date, subject, marks: { [studentId]: 'Present'|'Absent' } }
router.post("/mark", authenticate, authorizeRoles("super_admin", "admin", "hod", "faculty"), async (req, res) => {
  const { date, subject, marks } = req.body;
  if (!date || !marks) return res.status(400).json({ error: "date and marks are required." });

  const entries = Object.entries(marks);
  for (const [studentId, status] of entries) {
    await db.run(
      `INSERT INTO attendance (student_id, date, subject, status)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (student_id, date, subject) DO UPDATE SET status = EXCLUDED.status`,
      [studentId, date, subject || "", status]
    );
  }
  res.json({ ok: true, count: entries.length });
});

module.exports = router;
