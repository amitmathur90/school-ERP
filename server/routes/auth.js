const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { signToken, effectivePermissions, authenticate } = require("../authMiddleware");

const router = express.Router();

// POST /api/auth/login  { role, id, password }
// role (the bucket the login form was submitted from): 'admin' | 'teacher' | 'student'
// id: username (admin) or email (teacher/student)
//
// The RESPONSE's role is the user's actual business role, which may be more
// specific than the bucket they logged in through — e.g. logging in via the
// "Staff" tab can come back as role: "hod", "hr", "accounts",
// "exam_incharge", or "faculty" depending on what that account actually is.
// The frontend uses this returned role (not the tab clicked) to decide
// which dashboard to show.
router.post("/login", async (req, res) => {
  const { role, id, password } = req.body;
  if (!role || !id || !password) return res.status(400).json({ error: "role, id and password are required" });

  try {
    if (role === "admin") {
      const row = await db.get("SELECT * FROM admins WHERE username = ?", [id]);
      if (!row || !(await bcrypt.compare(password, row.password_hash))) {
        return res.status(401).json({ error: "Invalid administrator credentials." });
      }
      if (row.status === "inactive") return res.status(403).json({ error: "This account has been deactivated. Contact the Super Admin." });
      const user = { id: row.id, name: row.name, role: row.role, permissions: row.permissions ? JSON.parse(row.permissions) : null };
      const token = signToken(user);
      return res.json({ token, role: user.role, id: row.id, name: row.name, permissions: effectivePermissions(user) });
    }

    if (role === "teacher") {
      const row = await db.get("SELECT * FROM teachers WHERE email = ?", [id.toLowerCase()]);
      if (!row || !(await bcrypt.compare(password, row.password_hash))) {
        return res.status(401).json({ error: "No staff account found with that email, or the password is incorrect." });
      }
      if (row.status === "inactive") return res.status(403).json({ error: "This account has been deactivated. Contact the administration office." });
      const user = { id: row.id, name: row.name, role: row.role, department: row.department, permissions: row.permissions ? JSON.parse(row.permissions) : null };
      const token = signToken(user);
      return res.json({ token, role: user.role, id: row.id, name: row.name, department: row.department, permissions: effectivePermissions(user) });
    }

    if (role === "student") {
      const row = await db.get("SELECT * FROM students WHERE email = ?", [id.toLowerCase()]);
      if (!row || !(await bcrypt.compare(password, row.password_hash))) {
        return res.status(401).json({ error: "No application found with that email, or the password is incorrect." });
      }
      const token = signToken({ id: row.id, name: row.name, role: "student" });
      return res.json({ token, role: "student", id: row.id, name: row.name, status: row.status });
    }

    return res.status(400).json({ error: "Unknown role." });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: "Something went wrong signing in. Please try again." });
  }
});

// POST /api/auth/change-password  { role, id, currentPassword, newPassword }
// role here is the actual business role — anything other than 'student' or
// 'admin'/'super_admin' is looked up in the teachers table.
router.post("/change-password", async (req, res) => {
  const { role, id, currentPassword, newPassword } = req.body;
  if (!role || !id || !currentPassword || !newPassword) return res.status(400).json({ error: "Missing fields." });
  if (newPassword.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters." });

  try {
    const table = role === "student" ? "students" : role === "admin" || role === "super_admin" ? "admins" : "teachers";
    const row = await db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!row) return res.status(404).json({ error: "Account not found." });
    if (!(await bcrypt.compare(currentPassword, row.password_hash))) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db.run(`UPDATE ${table} SET password_hash = ? WHERE id = ?`, [hash, id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("Change-password error:", e);
    res.status(500).json({ error: "Something went wrong changing the password. Please try again." });
  }
});

// GET /api/auth/me — lets the frontend re-validate a stored token on page
// load/refresh and get fresh permissions (e.g. if Super Admin changed them
// since the token was issued).
router.get("/me", authenticate, (req, res) => {
  res.json(req.user);
});

module.exports = router;
