const express = require("express");
const db = require("../db");
const { rowToCamel, camelToSnakeParams, COURSE_FIELDS } = require("../fieldMap");
const { authenticate, authorizeRoles, requireModule } = require("../authMiddleware");

const router = express.Router();

// GET is intentionally public — a prospective student picks a course during
// the admission wizard before they have any account or token at all.
router.get("/", async (req, res) => {
  const rows = await db.all("SELECT * FROM courses");
  res.json(rows.map((r) => rowToCamel(r, COURSE_FIELDS)));
});

router.post("/", authenticate, authorizeRoles("super_admin", "admin"), requireModule("courses"), async (req, res) => {
  const body = { ...req.body, id: req.body.id || `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
  const { columns, placeholders, values } = camelToSnakeParams(body, COURSE_FIELDS);
  await db.run(`INSERT INTO courses (${columns.join(",")}) VALUES (${placeholders.join(",")})`, values);
  const row = await db.get("SELECT * FROM courses WHERE id = ?", [body.id]);
  res.status(201).json(rowToCamel(row, COURSE_FIELDS));
});

router.delete("/:id", authenticate, authorizeRoles("super_admin", "admin"), requireModule("courses"), async (req, res) => {
  await db.run("DELETE FROM courses WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
