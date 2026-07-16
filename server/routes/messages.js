const express = require("express");
const db = require("../db");
const { rowToCamel, camelToSnakeParams, MESSAGE_FIELDS } = require("../fieldMap");
const { authenticate } = require("../authMiddleware");

const router = express.Router();

router.get("/", authenticate, async (req, res) => {
  const rows = await db.all("SELECT * FROM messages ORDER BY date DESC");
  res.json(rows.map((r) => rowToCamel(r, MESSAGE_FIELDS)));
});

router.post("/", authenticate, async (req, res) => {
  const body = { ...req.body, id: req.body.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, date: req.body.date || new Date().toISOString() };
  const { columns, placeholders, values } = camelToSnakeParams(body, MESSAGE_FIELDS);
  await db.run(`INSERT INTO messages (${columns.join(",")}) VALUES (${placeholders.join(",")})`, values);
  const row = await db.get("SELECT * FROM messages WHERE id = ?", [body.id]);
  res.status(201).json(rowToCamel(row, MESSAGE_FIELDS));
});

// PATCH /api/messages/mark-all-read  { studentId } — a student marks all of
// their own notifications read (called when they open the Notifications page).
router.patch("/mark-all-read", authenticate, async (req, res) => {
  const studentId = req.user.role === "student" ? req.user.id : req.body.studentId;
  if (!studentId) return res.status(400).json({ error: "studentId is required." });
  if (req.user.role === "student" && req.user.id !== studentId) {
    return res.status(403).json({ error: "You can only mark your own notifications as read." });
  }
  await db.run("UPDATE messages SET is_read = true WHERE to_student_id = ? AND is_read = false", [studentId]);
  res.json({ ok: true });
});

module.exports = router;
