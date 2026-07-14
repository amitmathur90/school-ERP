const express = require("express");
const db = require("../db");

const router = express.Router();

function rowToFee(r) {
  const plan = r.plan_total_amount != null ? {
    totalAmount: r.plan_total_amount,
    tenureMonths: r.plan_tenure_months,
    installmentAmount: r.plan_installment,
    emisPaid: r.plan_emis_paid,
  } : null;
  return {
    studentId: r.student_id, totalFee: r.total_fee, paid: r.paid, dueDate: r.due_date, plan,
    extraFields: r.extra_fields ? JSON.parse(r.extra_fields) : null,
  };
}

// GET /api/fees -> flat array [{ studentId, totalFee, paid, dueDate, plan }]
router.get("/", async (req, res) => {
  const rows = await db.all("SELECT * FROM fees");
  res.json(rows.map(rowToFee));
});

// PATCH /api/fees/:studentId  { paid, dueDate }
router.patch("/:studentId", async (req, res) => {
  const { studentId } = req.params;
  const { paid, dueDate } = req.body;
  const existing = await db.get("SELECT * FROM fees WHERE student_id = ?", [studentId]);
  if (!existing) {
    await db.run("INSERT INTO fees (student_id, total_fee, paid, due_date) VALUES (?, 0, ?, ?)", [studentId, Number(paid) || 0, dueDate || null]);
  } else {
    await db.run("UPDATE fees SET paid = ?, due_date = COALESCE(?, due_date) WHERE student_id = ?", [Number(paid) || 0, dueDate || null, studentId]);
  }
  const row = await db.get("SELECT * FROM fees WHERE student_id = ?", [studentId]);
  res.json(rowToFee(row));
});

// POST /api/fees/bulk-delete  { studentIds: [...] }  — clears fee tracking, keeps the student
router.post("/bulk-delete", async (req, res) => {
  const { studentIds } = req.body;
  if (!Array.isArray(studentIds) || studentIds.length === 0) return res.status(400).json({ error: "studentIds array required." });
  const placeholders = studentIds.map(() => "?").join(",");
  await db.run(`DELETE FROM fees WHERE student_id IN (${placeholders})`, studentIds);
  res.json({ ok: true, deleted: studentIds.length });
});

module.exports = router;
