const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");

const router = express.Router();

// POST /api/auth/login  { role, id, password }
// role: 'admin' | 'teacher' | 'student'
// id: username (admin) or email (teacher/student)
router.post("/login", async (req, res) => {
  const { role, id, password } = req.body;
  if (!role || !id || !password) return res.status(400).json({ error: "role, id and password are required" });

  try {
    if (role === "admin") {
      const row = await db.get("SELECT * FROM admins WHERE username = ?", [id]);
      if (!row || !(await bcrypt.compare(password, row.password_hash))) {
        return res.status(401).json({ error: "Invalid administrator credentials." });
      }
      return res.json({ role: "admin", id: row.id, name: row.name });
    }

    if (role === "teacher") {
      const row = await db.get("SELECT * FROM teachers WHERE email = ?", [id.toLowerCase()]);
      if (!row || !(await bcrypt.compare(password, row.password_hash))) {
        return res.status(401).json({ error: "No faculty account found with that email, or the password is incorrect." });
      }
      return res.json({ role: "teacher", id: row.id, name: row.name });
    }

    if (role === "student") {
      const row = await db.get("SELECT * FROM students WHERE email = ?", [id.toLowerCase()]);
      if (!row || !(await bcrypt.compare(password, row.password_hash))) {
        return res.status(401).json({ error: "No application found with that email, or the password is incorrect." });
      }
      return res.json({ role: "student", id: row.id, name: row.name, status: row.status });
    }

    return res.status(400).json({ error: "Unknown role." });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: "Something went wrong signing in. Please try again." });
  }
});

// POST /api/auth/change-password  { role: 'student', id, currentPassword, newPassword }
router.post("/change-password", async (req, res) => {
  const { role, id, currentPassword, newPassword } = req.body;
  if (!role || !id || !currentPassword || !newPassword) return res.status(400).json({ error: "Missing fields." });
  if (newPassword.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters." });

  try {
    const table = role === "teacher" ? "teachers" : "students";
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

module.exports = router;
