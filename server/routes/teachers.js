const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { rowToCamel, camelToSnakeParams, camelToSnakeSet, TEACHER_FIELDS } = require("../fieldMap");

const router = express.Router();

const VALID_ROLES = ["hr", "accounts", "exam_incharge", "hod", "faculty"];

async function generateEmployeeId() {
  const year = new Date().getFullYear();
  const countRow = await db.get("SELECT COUNT(*) AS n FROM teachers");
  return `EMP-${year}-${String(countRow.n + 1).padStart(3, "0")}`;
}

router.get("/", async (req, res) => {
  const rows = await db.all("SELECT * FROM teachers ORDER BY id DESC");
  res.json(rows.map((r) => rowToCamel(r, TEACHER_FIELDS)));
});

// POST /api/teachers — creates a staff member (Faculty, HOD, HR, Accounts,
// or Examination Incharge — the `role` field determines which). Employee ID
// is generated automatically, never supplied by the client.
router.post("/", async (req, res) => {
  const { password, employeeId, ...rest } = req.body; // employeeId is always server-generated, ignore any client value
  if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (!rest.name || !rest.name.trim()) return res.status(400).json({ error: "Name is required." });
  const role = VALID_ROLES.includes(rest.role) ? rest.role : "faculty";

  const email = (rest.email || "").toLowerCase();
  if (!email) return res.status(400).json({ error: "Email is required." });
  const exists = await db.get(
    "SELECT id FROM teachers WHERE email = ? UNION SELECT id FROM students WHERE email = ?",
    [email, email]
  );
  if (exists) return res.status(409).json({ error: "An account with this email already exists." });

  const id = rest.id || `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const hash = await bcrypt.hash(password, 10);
  const empId = await generateEmployeeId();

  const withDefaults = { ...rest, email, role, status: rest.status || "active", employeeId: empId };
  const { columns, values } = camelToSnakeParams(withDefaults, TEACHER_FIELDS);
  const allColumns = ["id", "password_hash", ...columns];
  const allValues = [id, hash, ...values];
  await db.run(`INSERT INTO teachers (${allColumns.join(",")}) VALUES (${allColumns.map(() => "?").join(",")})`, allValues);

  const row = await db.get("SELECT * FROM teachers WHERE id = ?", [id]);
  res.status(201).json(rowToCamel(row, TEACHER_FIELDS));
});

// PATCH /api/teachers/:id — edit an existing staff member (not password; use a dedicated reset for that).
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { password, employeeId, ...rest } = req.body; // never let a PATCH change employeeId or bulk-set password
  if (rest.role && !VALID_ROLES.includes(rest.role)) return res.status(400).json({ error: "Invalid role." });
  const existing = await db.get("SELECT id FROM teachers WHERE id = ?", [id]);
  if (!existing) return res.status(404).json({ error: "Staff member not found." });

  const { sets, values } = camelToSnakeSet(rest, TEACHER_FIELDS);
  if (sets.length) await db.run(`UPDATE teachers SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
  const row = await db.get("SELECT * FROM teachers WHERE id = ?", [id]);
  res.json(rowToCamel(row, TEACHER_FIELDS));
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
