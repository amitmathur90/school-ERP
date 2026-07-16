const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { authenticate, authorizeRoles, MODULES, effectivePermissions } = require("../authMiddleware");

const router = express.Router();

function toSafe(row) {
  return {
    id: row.id, username: row.username, name: row.name, role: row.role, status: row.status,
    permissions: row.permissions ? JSON.parse(row.permissions) : null,
  };
}

// All routes here are Super Admin only — this is exactly the "cannot be
// restricted, has complete control" tier from the hierarchy. Regular Admins
// cannot reach any of this, even though they can create other staff via
// /api/teachers.
router.use(authenticate, authorizeRoles("super_admin"));

// GET /api/admins — list all admin-tier accounts (Super Admin + Admin).
router.get("/", async (req, res) => {
  const rows = await db.all("SELECT * FROM admins ORDER BY role, name");
  res.json(rows.map(toSafe));
});

// POST /api/admins — create a new Admin account. Only ever creates role
// "admin" — Super Admin accounts aren't created through the app (there's
// intentionally no UI path to mint more of them casually).
router.post("/", async (req, res) => {
  const { username, name, password, permissions } = req.body;
  if (!username || !name || !password) return res.status(400).json({ error: "username, name and password are required." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (permissions !== undefined && permissions !== null && (!Array.isArray(permissions) || permissions.some((p) => !MODULES.includes(p)))) {
    return res.status(400).json({ error: `permissions must be null (unrestricted) or an array of: ${MODULES.join(", ")}` });
  }

  const exists = await db.get("SELECT id FROM admins WHERE username = ?", [username]);
  if (exists) return res.status(409).json({ error: "An admin with this username already exists." });

  const id = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const hash = await bcrypt.hash(password, 10);
  await db.run(
    "INSERT INTO admins (id, username, password_hash, name, role, status, permissions) VALUES (?, ?, ?, ?, 'admin', 'active', ?)",
    [id, username, hash, name, permissions ? JSON.stringify(permissions) : null]
  );
  const row = await db.get("SELECT * FROM admins WHERE id = ?", [id]);
  res.status(201).json(toSafe(row));
});

// PATCH /api/admins/:id — edit name/status. Cannot touch role (there's no
// path to promote/demote to or from Super Admin through the app).
router.patch("/:id", async (req, res) => {
  const target = await db.get("SELECT * FROM admins WHERE id = ?", [req.params.id]);
  if (!target) return res.status(404).json({ error: "Admin not found." });
  if (target.role === "super_admin") return res.status(403).json({ error: "Super Admin accounts cannot be modified here." });

  const { name, status } = req.body;
  const sets = [], values = [];
  if (name !== undefined) { sets.push("name = ?"); values.push(name); }
  if (status !== undefined) { sets.push("status = ?"); values.push(status === "inactive" ? "inactive" : "active"); }
  if (sets.length) await db.run(`UPDATE admins SET ${sets.join(", ")} WHERE id = ?`, [...values, req.params.id]);

  const row = await db.get("SELECT * FROM admins WHERE id = ?", [req.params.id]);
  res.json(toSafe(row));
});

// PATCH /api/admins/:id/permissions  { permissions: ["fees","students",...] | null }
// This is the actual "Assign Permissions" feature — restricts (or, with
// null, un-restricts) exactly what an Admin can do.
router.patch("/:id/permissions", async (req, res) => {
  const target = await db.get("SELECT * FROM admins WHERE id = ?", [req.params.id]);
  if (!target) return res.status(404).json({ error: "Admin not found." });
  if (target.role === "super_admin") return res.status(403).json({ error: "Super Admin cannot be restricted." });

  const { permissions } = req.body;
  if (permissions !== null && (!Array.isArray(permissions) || permissions.some((p) => !MODULES.includes(p)))) {
    return res.status(400).json({ error: `permissions must be null (unrestricted) or an array of: ${MODULES.join(", ")}` });
  }
  await db.run("UPDATE admins SET permissions = ? WHERE id = ?", [permissions ? JSON.stringify(permissions) : null, req.params.id]);
  const row = await db.get("SELECT * FROM admins WHERE id = ?", [req.params.id]);
  res.json(toSafe(row));
});

// POST /api/admins/:id/reset-password  { newPassword }
router.post("/:id/reset-password", async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters." });
  const target = await db.get("SELECT * FROM admins WHERE id = ?", [req.params.id]);
  if (!target) return res.status(404).json({ error: "Admin not found." });
  const hash = await bcrypt.hash(newPassword, 10);
  await db.run("UPDATE admins SET password_hash = ? WHERE id = ?", [hash, req.params.id]);
  res.json({ ok: true });
});

// DELETE /api/admins/:id — cannot delete Super Admin, and cannot delete yourself.
router.delete("/:id", async (req, res) => {
  const target = await db.get("SELECT * FROM admins WHERE id = ?", [req.params.id]);
  if (!target) return res.status(404).json({ error: "Admin not found." });
  if (target.role === "super_admin") return res.status(403).json({ error: "Super Admin accounts cannot be deleted." });
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You cannot delete your own account." });
  await db.run("DELETE FROM admins WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
