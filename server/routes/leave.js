const express = require("express");
const db = require("../db");
const { authenticate, authorizeRoles } = require("../authMiddleware");

const router = express.Router();

function uid(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function toCamel(r) {
  return {
    id: r.id, teacherId: r.teacher_id, leaveType: r.leave_type,
    startDate: r.start_date, endDate: r.end_date, reason: r.reason, status: r.status,
    appliedAt: r.applied_at, decidedBy: r.decided_by, decidedAt: r.decided_at, decisionNote: r.decision_note,
  };
}

// GET /api/leave?teacherId=xxx — any signed-in staff member can see leave
// requests. Frontend filters to "my requests" for regular staff, and shows
// everyone's for HR/Admin/Super Admin.
router.get("/", authenticate, async (req, res) => {
  const { teacherId } = req.query;
  const rows = teacherId
    ? await db.all("SELECT * FROM leave_requests WHERE teacher_id = ? ORDER BY applied_at DESC", [teacherId])
    : await db.all("SELECT * FROM leave_requests ORDER BY applied_at DESC");
  res.json(rows.map(toCamel));
});

// POST /api/leave — any signed-in staff member applies for their own leave.
// Body: { teacherId, leaveType, startDate, endDate, reason }
router.post("/", authenticate, async (req, res) => {
  const { teacherId, leaveType, startDate, endDate, reason } = req.body;
  if (!teacherId || !startDate || !endDate) return res.status(400).json({ error: "teacherId, startDate and endDate are required." });
  if (new Date(endDate) < new Date(startDate)) return res.status(400).json({ error: "End date can't be before the start date." });
  // Staff can only apply for their own leave — not on behalf of someone else
  // (HR/Admin still see and decide on everyone's requests, just don't file them).
  if (req.user.role !== "super_admin" && req.user.role !== "admin" && req.user.id !== teacherId) {
    return res.status(403).json({ error: "You can only apply for your own leave." });
  }
  const id = uid("leave");
  await db.run(
    "INSERT INTO leave_requests (id, teacher_id, leave_type, start_date, end_date, reason, status, applied_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
    [id, teacherId, leaveType || "General", startDate, endDate, reason || "", new Date().toISOString()]
  );
  const row = await db.get("SELECT * FROM leave_requests WHERE id = ?", [id]);
  res.status(201).json(toCamel(row));
});

// PATCH /api/leave/:id  { status: 'approved'|'rejected', decisionNote }
// HR, Admin, and Super Admin can decide on leave requests.
router.patch("/:id", authenticate, authorizeRoles("super_admin", "admin", "hr"), async (req, res) => {
  const { status, decisionNote } = req.body;
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "status must be 'approved' or 'rejected'." });
  const existing = await db.get("SELECT id FROM leave_requests WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Leave request not found." });
  await db.run(
    "UPDATE leave_requests SET status = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?",
    [status, req.user.name, new Date().toISOString(), decisionNote || "", req.params.id]
  );
  const row = await db.get("SELECT * FROM leave_requests WHERE id = ?", [req.params.id]);
  res.json(toCamel(row));
});

module.exports = router;
