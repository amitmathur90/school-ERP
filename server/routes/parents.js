// routes/parents.js — Parent portal: read-only visibility into a linked
// child's (or children's) attendance, grades, fees, and library activity.
//
// Parent accounts are created by Admin/Super Admin (same as staff — no
// self-registration) and linked to one or more existing students via
// parent_students, since siblings should share one login. Unlike the
// student/attendance/grades/fees list endpoints elsewhere in this app
// (which return the whole table to any signed-in role and rely on the
// frontend to filter), every child-scoped route here checks parent_students
// server-side before returning anything — parents are a lower-trust,
// non-staff audience, so ownership is enforced at the API, not just hidden
// in the UI.
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const {
  rowToCamel, camelToSnakeSet, PARENT_FIELDS, GRADE_FIELDS, TRANSACTION_FIELDS,
} = require("../fieldMap");
const { authenticate, authorizeRoles, requireModule } = require("../authMiddleware");

const router = express.Router();

function uid(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function rowToFee(r) {
  if (!r) return null;
  const plan = r.plan_total_amount != null ? {
    totalAmount: r.plan_total_amount,
    tenureMonths: r.plan_tenure_months,
    installmentAmount: r.plan_installment,
    emisPaid: r.plan_emis_paid,
  } : null;
  return {
    studentId: r.student_id, totalFee: r.total_fee, paid: r.paid,
    admissionFeePaid: r.admission_fee_paid || 0, dueDate: r.due_date, plan,
  };
}

/** Blocks a parent from reaching a child's data unless parent_students links them. */
async function requireOwnChild(req, res, next) {
  const link = await db.get(
    "SELECT id FROM parent_students WHERE parent_id = ? AND student_id = ?",
    [req.user.id, req.params.studentId]
  );
  if (!link) return res.status(403).json({ error: "You can only view your own children's records." });
  next();
}

/* ============================== ADMIN: MANAGE PARENT ACCOUNTS ============================== */

// GET /api/parents — every parent account, with their linked children's names for display.
router.get("/", authenticate, authorizeRoles("super_admin", "admin"), requireModule("parents"), async (req, res) => {
  const rows = await db.all("SELECT * FROM parents ORDER BY created_at DESC NULLS LAST");
  const links = await db.all(
    `SELECT ps.parent_id, ps.student_id, s.name AS student_name, s.roll_no
     FROM parent_students ps JOIN students s ON s.id = ps.student_id`
  );
  const byParent = {};
  for (const l of links) {
    (byParent[l.parent_id] ||= []).push({ studentId: l.student_id, studentName: l.student_name, rollNo: l.roll_no });
  }
  res.json(rows.map((r) => ({ ...rowToCamel(r, PARENT_FIELDS), children: byParent[r.id] || [] })));
});

// POST /api/parents  { name, email, phone, password, studentIds: [...] }
router.post("/", authenticate, authorizeRoles("super_admin", "admin"), requireModule("parents"), async (req, res) => {
  try {
    const { name, email, phone, password, studentIds } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Name is required." });
    if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
    const emailLower = (email || "").toLowerCase().trim();
    if (!emailLower) return res.status(400).json({ error: "Email is required." });
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: "Select at least one child to link this parent to." });
    }

    const exists = await db.get(
      "SELECT id FROM parents WHERE email = ? UNION SELECT id FROM teachers WHERE email = ? UNION SELECT id FROM students WHERE email = ?",
      [emailLower, emailLower, emailLower]
    );
    if (exists) return res.status(409).json({ error: "An account with this email already exists." });

    const id = uid("par");
    const hash = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();

    await db.transaction(async (tx) => {
      await tx.run(
        "INSERT INTO parents (id, name, email, password_hash, phone, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?)",
        [id, name.trim(), emailLower, hash, phone || null, createdAt]
      );
      for (const studentId of studentIds) {
        const student = await tx.get("SELECT id FROM students WHERE id = ?", [studentId]);
        if (!student) throw Object.assign(new Error("One of the selected students no longer exists."), { status: 400 });
        await tx.run(
          "INSERT INTO parent_students (id, parent_id, student_id) VALUES (?, ?, ?) ON CONFLICT (parent_id, student_id) DO NOTHING",
          [uid("ps"), id, studentId]
        );
      }
    });

    const row = await db.get("SELECT * FROM parents WHERE id = ?", [id]);
    res.status(201).json({ ...rowToCamel(row, PARENT_FIELDS), children: [] });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error("Create parent error:", e);
    res.status(500).json({ error: "Something went wrong creating this parent account. Please try again." });
  }
});

// PATCH /api/parents/:id  { name, phone, status, password, studentIds }
// studentIds, if provided, REPLACES the full set of linked children (same
// "replace all rows" shape as the admission wizard's Academic Details step).
router.patch("/:id", authenticate, authorizeRoles("super_admin", "admin"), requireModule("parents"), async (req, res) => {
  const { id } = req.params;
  const { studentIds, password, ...rest } = req.body;
  const existing = await db.get("SELECT id FROM parents WHERE id = ?", [id]);
  if (!existing) return res.status(404).json({ error: "Parent account not found." });

  const { sets, values } = camelToSnakeSet(rest, PARENT_FIELDS);
  if (sets.length) await db.run(`UPDATE parents SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);

  if (password) {
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
    const hash = await bcrypt.hash(password, 10);
    await db.run("UPDATE parents SET password_hash = ? WHERE id = ?", [hash, id]);
  }

  if (Array.isArray(studentIds)) {
    await db.transaction(async (tx) => {
      await tx.run("DELETE FROM parent_students WHERE parent_id = ?", [id]);
      for (const studentId of studentIds) {
        await tx.run("INSERT INTO parent_students (id, parent_id, student_id) VALUES (?, ?, ?)", [uid("ps"), id, studentId]);
      }
    });
  }

  const row = await db.get("SELECT * FROM parents WHERE id = ?", [id]);
  const links = await db.all(
    `SELECT s.id AS student_id, s.name AS student_name, s.roll_no FROM parent_students ps
     JOIN students s ON s.id = ps.student_id WHERE ps.parent_id = ?`,
    [id]
  );
  res.json({
    ...rowToCamel(row, PARENT_FIELDS),
    children: links.map((l) => ({ studentId: l.student_id, studentName: l.student_name, rollNo: l.roll_no })),
  });
});

router.delete("/:id", authenticate, authorizeRoles("super_admin", "admin"), requireModule("parents"), async (req, res) => {
  await db.run("DELETE FROM parents WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

/* ============================== PARENT SELF-SERVICE ============================== */

// GET /api/parents/me/children — the signed-in parent's own linked children.
router.get("/me/children", authenticate, authorizeRoles("parent"), async (req, res) => {
  const rows = await db.all(
    `SELECT s.id, s.name, s.roll_no, s.photo_data, s.status, s.course_id, s.gender, s.dob,
            c.name AS course_name, c.course_group AS class_group, ps.relation
     FROM parent_students ps
     JOIN students s ON s.id = ps.student_id
     LEFT JOIN courses c ON c.id = s.course_id
     WHERE ps.parent_id = ?
     ORDER BY s.name`,
    [req.user.id]
  );
  res.json(rows.map((r) => ({
    id: r.id, name: r.name, rollNo: r.roll_no, photoData: r.photo_data, status: r.status,
    courseId: r.course_id, courseName: r.course_name, classGroup: r.class_group,
    gender: r.gender, dob: r.dob, relation: r.relation,
  })));
});

// GET /api/parents/me/children/:studentId/attendance
router.get("/me/children/:studentId/attendance", authenticate, authorizeRoles("parent"), requireOwnChild, async (req, res) => {
  const rows = await db.all(
    "SELECT date, subject, status FROM attendance WHERE student_id = ? ORDER BY date DESC",
    [req.params.studentId]
  );
  res.json(rows);
});

// GET /api/parents/me/children/:studentId/grades
router.get("/me/children/:studentId/grades", authenticate, authorizeRoles("parent"), requireOwnChild, async (req, res) => {
  const rows = await db.all(
    "SELECT * FROM grades WHERE student_id = ? ORDER BY semester DESC, id DESC",
    [req.params.studentId]
  );
  res.json(rows.map((r) => rowToCamel(r, GRADE_FIELDS)));
});

// GET /api/parents/me/children/:studentId/fees — balance/due date + full payment history.
router.get("/me/children/:studentId/fees", authenticate, authorizeRoles("parent"), requireOwnChild, async (req, res) => {
  const feeRow = await db.get("SELECT * FROM fees WHERE student_id = ?", [req.params.studentId]);
  const txRows = await db.all("SELECT * FROM transactions WHERE student_id = ? ORDER BY date DESC", [req.params.studentId]);
  res.json({
    fee: rowToFee(feeRow),
    transactions: txRows.map((r) => {
      const out = rowToCamel(r, TRANSACTION_FIELDS);
      out.additionalFees = r.additional_fees ? JSON.parse(r.additional_fees) : [];
      return out;
    }),
  });
});

// GET /api/parents/me/children/:studentId/library — current + past loans, and reading log.
router.get("/me/children/:studentId/library", authenticate, authorizeRoles("parent"), requireOwnChild, async (req, res) => {
  const loanRows = await db.all(
    `SELECT bl.*, bt.title, bt.authors, bc.accession_no
     FROM book_loans bl
     JOIN book_copies bc ON bc.id = bl.copy_id
     JOIN book_titles bt ON bt.id = bc.title_id
     WHERE bl.borrower_type = 'student' AND bl.borrower_id = ?
     ORDER BY bl.issued_at DESC`,
    [req.params.studentId]
  );
  const readRow = await db.get(
    "SELECT COUNT(*) AS n FROM book_loans WHERE borrower_type = 'student' AND borrower_id = ? AND returned_at IS NOT NULL AND counts_toward_program = true",
    [req.params.studentId]
  );
  const count = Number(readRow.n);
  const MILESTONES = [5, 10, 20, 50, 100];
  res.json({
    loans: loanRows.map((r) => ({
      id: r.id, title: r.title, authors: r.authors, accessionNo: r.accession_no,
      issuedAt: r.issued_at, dueDate: r.due_date, returnedAt: r.returned_at, renewedCount: r.renewed_count,
      fineAmount: Number(r.fine_amount), fineStatus: r.fine_status,
    })),
    readingLog: {
      booksRead: count,
      milestonesReached: MILESTONES.filter((m) => count >= m),
      nextMilestone: MILESTONES.find((m) => count < m) || null,
    },
  });
});

module.exports = router;
