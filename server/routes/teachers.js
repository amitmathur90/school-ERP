const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { rowToCamel, TEACHER_FIELDS } = require("../fieldMap");

const router = express.Router();

router.get("/", async (req, res) => {
  const rows = await db.all("SELECT * FROM teachers");
  res.json(rows.map((r) => rowToCamel(r, TEACHER_FIELDS)));
});

router.post("/", async (req, res) => {
  const { password, ...rest } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  const email = (rest.email || "").toLowerCase();
  const exists = await db.get("SELECT id FROM teachers WHERE email = ?", [email]);
  if (exists) return res.status(409).json({ error: "An account with this email already exists." });

  const id = rest.id || `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const hash = await bcrypt.hash(password, 10);
  await db.run(
    `INSERT INTO teachers (id, name, email, password_hash, subject, department, phone) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, rest.name, email, hash, rest.subject || "", rest.department || "", rest.phone || ""]
  );

  const row = await db.get("SELECT * FROM teachers WHERE id = ?", [id]);
  res.status(201).json(rowToCamel(row, TEACHER_FIELDS));
});

router.delete("/:id", async (req, res) => {
  await db.run("DELETE FROM teachers WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// POST /api/teachers/bulk-delete  { ids: [...] }
router.post("/bulk-delete", async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids array required." });
  const placeholders = ids.map(() => "?").join(",");
  await db.run(`DELETE FROM teachers WHERE id IN (${placeholders})`, ids);
  res.json({ ok: true, deleted: ids.length });
});

module.exports = router;
