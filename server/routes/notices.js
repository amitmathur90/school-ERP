const express = require("express");
const db = require("../db");
const { rowToCamel, camelToSnakeParams, NOTICE_FIELDS } = require("../fieldMap");

const router = express.Router();

router.get("/", async (req, res) => {
  const rows = await db.all("SELECT * FROM notices ORDER BY date DESC");
  res.json(rows.map((r) => rowToCamel(r, NOTICE_FIELDS)));
});

router.post("/", async (req, res) => {
  const body = { ...req.body, id: req.body.id || `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, date: req.body.date || new Date().toISOString() };
  const { columns, placeholders, values } = camelToSnakeParams(body, NOTICE_FIELDS);
  await db.run(`INSERT INTO notices (${columns.join(",")}) VALUES (${placeholders.join(",")})`, values);
  const row = await db.get("SELECT * FROM notices WHERE id = ?", [body.id]);
  res.status(201).json(rowToCamel(row, NOTICE_FIELDS));
});

router.delete("/:id", async (req, res) => {
  await db.run("DELETE FROM notices WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
