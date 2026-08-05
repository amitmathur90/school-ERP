const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { rowToCamel, camelToSnakeSet, camelToSnakeParams, STUDENT_FIELDS } = require("../fieldMap");
const { composeRegistrationEmail, composeTempPasswordEmail, composeRejectionEmail } = require("../emailTemplates");
const { sendMail } = require("../mailer");
const { autoProvisionParentFromAdmission } = require("../parentAutoProvision");
const { authenticate, authorizeRoles, requireModule } = require("../authMiddleware");

const router = express.Router();

function uid(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function withComputedName(fields) {
  if (fields.name || (!fields.firstName && !fields.lastName)) return fields;
  const name = [fields.firstName, fields.middleName, fields.lastName].filter(Boolean).join(" ");
  return { ...fields, name: name || fields.name };
}

async function getStudent(id) {
  const row = await db.get("SELECT * FROM students WHERE id = ?", [id]);
  if (!row) return null;
  const student = rowToCamel(row, STUDENT_FIELDS);
  student.extraFields = row.extra_fields ? JSON.parse(row.extra_fields) : null;
  return student;
}

router.get("/", authenticate, async (req, res) => {
  let rows = await db.all("SELECT * FROM students ORDER BY created_at DESC NULLS LAST");
  if (req.user.role === "hod" && req.user.department) {
    const deptCourseIds = new Set((await db.all("SELECT id FROM courses WHERE department = ?", [req.user.department])).map((c) => c.id));
    rows = rows.filter((r) => deptCourseIds.has(r.course_id));
  }
  res.json(rows.map((r) => {
    const student = rowToCamel(r, STUDENT_FIELDS);
    student.extraFields = r.extra_fields ? JSON.parse(r.extra_fields) : null;
    return student;
  }));
});

// POST /api/students/draft  — create or update a draft/in-progress application.
// Body: { draftId (optional), step, ...all form fields including plaintext `password` on first save }
router.post("/draft", async (req, res) => {
  const { draftId, step, password, ...fields } = req.body;

  if (draftId) {
    const existing = await db.get("SELECT saved_up_to FROM students WHERE id = ?", [draftId]);
    if (!existing) return res.status(404).json({ error: "Draft not found." });
    const savedUpTo = Math.max(existing.saved_up_to || 0, Number(step) || 0);
    const { sets, values } = camelToSnakeSet(withComputedName({ ...fields, savedUpTo }), STUDENT_FIELDS);
    if (sets.length) {
      await db.run(`UPDATE students SET ${sets.join(", ")} WHERE id = ?`, [...values, draftId]);
    }
    return res.json({ id: draftId });
  }

  // First save: create a brand-new draft. Requires email + password.
  const email = (fields.email || "").toLowerCase();
  if (!email || !password) return res.status(400).json({ error: "Email and password are required to start an application." });
  const clash = await db.get("SELECT id FROM students WHERE email = ? UNION SELECT id FROM teachers WHERE email = ?", [email, email]);
  if (clash) return res.status(409).json({ error: "An account with this email already exists." });

  const id = uid("s");
  const hash = await bcrypt.hash(password, 10);
  const withDefaults = withComputedName({ ...fields, email, status: "draft", savedUpTo: Number(step) || 1, createdAt: new Date().toISOString() });
  const { columns, values } = camelToSnakeParams(withDefaults, STUDENT_FIELDS);
  const allColumns = ["id", "password_hash", ...columns];
  const allValues = [id, hash, ...values];
  await db.run(`INSERT INTO students (${allColumns.join(",")}) VALUES (${allColumns.map(() => "?").join(",")})`, allValues);
  res.status(201).json({ id });
});

// POST /api/students/:id/finalize — submit the completed application.
// Body: all final-step fields + the plaintext password (needed once, to email it).
router.post("/:id/finalize", async (req, res) => {
  const { id } = req.params;
  const { password, ...fields } = req.body;
  const existing = await db.get("SELECT * FROM students WHERE id = ?", [id]);
  if (!existing) return res.status(404).json({ error: "Application not found." });

  const patch = withComputedName({ ...fields, status: "pending", savedUpTo: 5, appliedAt: new Date().toISOString() });
  const { sets, values } = camelToSnakeSet(patch, STUDENT_FIELDS);
  if (sets.length) await db.run(`UPDATE students SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);

  const student = await getStudent(id);
  const plainPassword = password || "(the password you set when starting your application)";
  const { subject, body } = composeRegistrationEmail(student, plainPassword);
  await db.run(
    "INSERT INTO emails (id, to_email, subject, body, date) VALUES (?, ?, ?, ?, ?)",
    [uid("mail"), student.email, subject, body, new Date().toISOString()]
  );
  sendMail({ to: student.email, subject, text: body });

  // Best-effort: auto-create (or link to an existing) parent login from the
  // father's details entered in Family Details. Must never fail the
  // student's own submission if something goes wrong here.
  autoProvisionParentFromAdmission(student).catch((e) => console.error("Parent auto-provision failed:", e));

  res.json(student);
});

// PATCH /api/students/:id — generic edit (admin quick-edit, student self-service, etc.)
router.patch("/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const existing = await db.get("SELECT id FROM students WHERE id = ?", [id]);
  if (!existing) return res.status(404).json({ error: "Student not found." });
  const { sets, values } = camelToSnakeSet(req.body, STUDENT_FIELDS);
  if (sets.length) await db.run(`UPDATE students SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
  res.json(await getStudent(id));
});

// PATCH /api/students/:id/approve
router.patch("/:id/approve", authenticate, authorizeRoles("super_admin", "admin"), requireModule("admissions"), async (req, res) => {
  const { id } = req.params;
  try {
    const found = await db.transaction(async (tx) => {
      const student = await tx.get("SELECT * FROM students WHERE id = ?", [id]);
      if (!student) return false;
      const course = student.course_id ? await tx.get("SELECT * FROM courses WHERE id = ?", [student.course_id]) : null;
      const code = course?.code || "STU";
      const prefix = `${code}-${new Date().getFullYear()}-`;

      // Concurrent approvals under the same roll-number prefix (e.g. one from
      // the desktop app, one from mobile, both acting on stale "still
      // pending" data) need to serialize so they can't both compute the same
      // next number. Lock on the prefix itself, not just course_id — that
      // also protects against two courses ever sharing a code.
      await tx.run("SELECT pg_advisory_xact_lock(hashtext(?)::bigint)", [prefix]);

      // Base the next number on the highest sequence number ever issued
      // under this prefix rather than a COUNT of currently-approved rows in
      // this course. A student's course can be reassigned (or the record
      // otherwise edited) after approval without its roll_no being
      // recomputed, which silently shrinks that count — the "next" number
      // COUNT+1 produces can then land on one that's already taken by
      // someone else, so every retry deterministically fails the same way
      // instead of the collision being a rare, self-resolving accident.
      const existing = await tx.all("SELECT roll_no FROM students WHERE roll_no LIKE ?", [`${prefix}%`]);
      const maxSeq = existing.reduce((max, r) => {
        const n = Number(r.roll_no.slice(prefix.length));
        return Number.isFinite(n) && n > max ? n : max;
      }, 0);
      const rollNo = `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;

      await tx.run("UPDATE students SET status = 'approved', roll_no = ? WHERE id = ?", [rollNo, id]);

      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const existingFee = await tx.get("SELECT student_id FROM fees WHERE student_id = ?", [id]);
      if (existingFee) {
        await tx.run("UPDATE fees SET total_fee = ?, due_date = ? WHERE student_id = ?", [course?.fee || 0, dueDate, id]);
      } else {
        await tx.run("INSERT INTO fees (student_id, total_fee, paid, due_date) VALUES (?, ?, 0, ?)", [id, course?.fee || 0, dueDate]);
      }
      return true;
    });

    if (!found) return res.status(404).json({ error: "Student not found." });
    res.json(await getStudent(id));
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({ error: "Roll number assignment collided with another approval happening at the same moment. Please try approving again." });
    }
    console.error("Approve error:", e);
    res.status(500).json({ error: "Something went wrong approving this student. Please try again." });
  }
});

// PATCH /api/students/:id/reject  { reason }
router.patch("/:id/reject", authenticate, authorizeRoles("super_admin", "admin"), requireModule("admissions"), async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const existing = await db.get("SELECT id FROM students WHERE id = ?", [id]);
  if (!existing) return res.status(404).json({ error: "Student not found." });
  await db.run("UPDATE students SET status = 'rejected', reject_reason = ? WHERE id = ?", [reason || "", id]);

  const student = await getStudent(id);
  const { subject, body } = composeRejectionEmail(student, reason);
  await db.run(
    "INSERT INTO emails (id, to_email, subject, body, date) VALUES (?, ?, ?, ?, ?)",
    [uid("mail"), student.email, subject, body, new Date().toISOString()]
  );
  sendMail({ to: student.email, subject, text: body });

  res.json(student);
});

// PATCH /api/students/:id/reset-password — admin generates a new temporary
// password for a student (e.g. they've forgotten it / lost email access
// during signup) and emails it to their registered address.
router.patch("/:id/reset-password", authenticate, authorizeRoles("super_admin", "admin"), requireModule("students"), async (req, res) => {
  const { id } = req.params;
  const student = await getStudent(id);
  if (!student) return res.status(404).json({ error: "Student not found." });

  const tempPassword = Math.random().toString(36).slice(2, 10);
  const hash = await bcrypt.hash(tempPassword, 10);
  await db.run("UPDATE students SET password_hash = ? WHERE id = ?", [hash, id]);

  const { subject, body } = composeTempPasswordEmail(student, tempPassword);
  await db.run(
    "INSERT INTO emails (id, to_email, subject, body, date) VALUES (?, ?, ?, ?, ?)",
    [uid("mail"), student.email, subject, body, new Date().toISOString()]
  );
  sendMail({ to: student.email, subject, text: body });

  res.json({ ok: true, email: student.email, tempPassword });
});

// POST /api/students/bulk-delete  { ids: [...] }
router.post("/bulk-delete", authenticate, authorizeRoles("super_admin", "admin"), requireModule("students"), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids array required." });
  const placeholders = ids.map(() => "?").join(",");
  await db.run(`DELETE FROM students WHERE id IN (${placeholders})`, ids);
  res.json({ ok: true, deleted: ids.length });
});

module.exports = router;
