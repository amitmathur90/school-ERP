const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { camelToSnakeSet, camelToSnakeParams, STUDENT_FIELDS } = require("../fieldMap");
const { mapRow, STUDENT_ALIAS_MAP, FEE_ALIAS_MAP } = require("../csvImport");
const { composeRegistrationEmail } = require("../emailTemplates");

const router = express.Router();

function uid(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function resolveCourseId(mapped, extra, courses) {
  const raw = mapped.courseName || extra["course"] || extra["Course"];
  if (!raw) return null;
  const val = String(raw).trim().toLowerCase();
  const match = courses.find((c) => c.name.toLowerCase() === val || c.code.toLowerCase() === val);
  return match ? match.id : null;
}

async function generateRollNo(course) {
  const countRow = await db.get("SELECT COUNT(*) AS n FROM students WHERE status = 'approved' AND course_id = ?", [course?.id || null]);
  return `${course?.code || "STU"}-${new Date().getFullYear()}-${String(countRow.n + 1).padStart(3, "0")}`;
}

const VALID_STATUSES = ["draft", "pending", "approved", "rejected"];
function normalizeStatus(value, fallback) {
  const v = String(value || "").trim().toLowerCase();
  return VALID_STATUSES.includes(v) ? v : fallback;
}

// POST /api/import/students
// Body: { rows: [ { <any CSV header>: <value>, ... }, ... ] }
// Admin only (enforce whatever auth/role check your deployment uses at the gateway/session level).
router.post("/students", async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: "rows array required." });

  const courses = await db.all("SELECT * FROM courses");
  const recognizedColumns = new Set();
  const extraColumns = new Set();
  const errors = [];
  const newLogins = []; // { name, email, password } for every brand-new student — this is the only time the plaintext password is ever visible, so surface it now
  let created = 0, updated = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // +1 for header row, +1 for 1-indexing
    try {
      const { mapped, extra } = mapRow(rows[i], STUDENT_ALIAS_MAP);
      Object.keys(mapped).forEach((k) => recognizedColumns.add(k));
      Object.keys(extra).forEach((k) => extraColumns.add(k));

      const courseId = resolveCourseId(mapped, extra, courses);
      if (courseId) mapped.courseId = courseId;
      else if (mapped.courseName) extra["Course"] = mapped.courseName; // couldn't resolve — keep it visible, don't lose it
      delete mapped.courseName;

      const email = (mapped.email || "").toLowerCase();
      if (!email) { errors.push(`Row ${rowNum}: no email column found — skipped.`); continue; }
      if (!mapped.name && (mapped.firstName || mapped.lastName)) {
        mapped.name = [mapped.firstName, mapped.middleName, mapped.lastName].filter(Boolean).join(" ");
      }

      const extraJson = Object.keys(extra).length ? JSON.stringify(extra) : null;
      const existing = await db.get("SELECT id FROM students WHERE email = ?", [email]);

      if (existing) {
        const patch = { ...mapped, email };
        delete patch.password; // never bulk-overwrite a password via CSV
        if (patch.status !== undefined) patch.status = normalizeStatus(patch.status, undefined);
        if (patch.status === undefined) delete patch.status; // don't wipe an existing status if the CSV value was invalid/unrecognized
        const { sets, values } = camelToSnakeSet(patch, STUDENT_FIELDS);
        // Always reconcile extra_fields to match what THIS import run found — not just
        // when there happen to be new unrecognized columns. Otherwise, re-importing
        // after a fix to the field-recognition logic (like this one) would correctly
        // populate the proper columns but leave the old, now-duplicate data sitting
        // in extra_fields, showing up twice.
        sets.push("extra_fields = ?"); values.push(extraJson);
        if (sets.length) await db.run(`UPDATE students SET ${sets.join(", ")} WHERE id = ?`, [...values, existing.id]);
        updated++;
      } else {
        const id = uid("s");
        const status = normalizeStatus(mapped.status, "approved");
        const plainPassword = mapped.password || Math.random().toString(36).slice(2, 10);
        const hash = await bcrypt.hash(String(plainPassword), 10);
        const course = mapped.courseId ? courses.find((c) => c.id === mapped.courseId) : null;

        const withDefaults = { ...mapped, email, status, createdAt: new Date().toISOString() };
        if (status === "approved") {
          withDefaults.rollNo = withDefaults.rollNo || await generateRollNo(course);
          withDefaults.appliedAt = withDefaults.appliedAt || new Date().toISOString();
          withDefaults.savedUpTo = 5;
        }
        delete withDefaults.password;

        const { columns, values } = camelToSnakeParams(withDefaults, STUDENT_FIELDS);
        const allColumns = ["id", "password_hash", ...columns];
        const allValues = [id, hash, ...values];
        if (extraJson) { allColumns.push("extra_fields"); allValues.push(extraJson); }
        await db.run(`INSERT INTO students (${allColumns.join(",")}) VALUES (${allColumns.map(() => "?").join(",")})`, allValues);

        // Mirror what happens when a student is approved the normal way: give them a fee record too.
        if (status === "approved") {
          const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          await db.run("INSERT INTO fees (student_id, total_fee, paid, due_date) VALUES (?, ?, 0, ?)", [id, course?.fee || 0, dueDate]);
        }

        // Log a registration email (same as the normal signup flow) so there's a durable, lookup-able record of the credentials.
        const { subject, body } = composeRegistrationEmail({ name: withDefaults.name || email, email }, plainPassword);
        await db.run(
          "INSERT INTO emails (id, to_email, subject, body, date) VALUES (?, ?, ?, ?, ?)",
          [uid("mail"), email, subject, body, new Date().toISOString()]
        );

        newLogins.push({ name: withDefaults.name || "(no name given)", email, password: plainPassword });
        created++;
      }
    } catch (e) {
      errors.push(`Row ${rowNum}: ${e.message}`);
    }
  }

  res.json({
    created, updated, errors, newLogins,
    recognizedColumns: Array.from(recognizedColumns),
    extraColumns: Array.from(extraColumns),
  });
});

// POST /api/import/fees
// Body: { rows: [ { <any CSV header>: <value>, ... }, ... ] }
// Matches each row to an existing student by email or roll number.
router.post("/fees", async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: "rows array required." });

  const recognizedColumns = new Set();
  const extraColumns = new Set();
  const errors = [];
  let created = 0, updated = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    try {
      const { mapped, extra } = mapRow(rows[i], FEE_ALIAS_MAP);
      Object.keys(mapped).forEach((k) => recognizedColumns.add(k));
      Object.keys(extra).forEach((k) => extraColumns.add(k));

      const email = (mapped.email || "").toLowerCase();
      const rollNo = mapped.rollNo || "";
      let student = null;
      if (email) student = await db.get("SELECT id FROM students WHERE email = ?", [email]);
      if (!student && rollNo) student = await db.get("SELECT id FROM students WHERE roll_no = ?", [rollNo]);
      if (!student) { errors.push(`Row ${rowNum}: no matching student found (checked email and roll no.) — skipped.`); continue; }

      const extraJson = Object.keys(extra).length ? JSON.stringify(extra) : null;
      const existing = await db.get("SELECT * FROM fees WHERE student_id = ?", [student.id]);
      const totalFee = mapped.totalFee !== undefined ? Number(mapped.totalFee) : existing?.total_fee ?? 0;
      const paid = mapped.paid !== undefined ? Number(mapped.paid) : existing?.paid ?? 0;
      const dueDate = mapped.dueDate || existing?.due_date || null;

      if (existing) {
        await db.run(
          "UPDATE fees SET total_fee = ?, paid = ?, due_date = ?, extra_fields = COALESCE(?, extra_fields) WHERE student_id = ?",
          [totalFee, paid, dueDate, extraJson, student.id]
        );
        updated++;
      } else {
        await db.run(
          "INSERT INTO fees (student_id, total_fee, paid, due_date, extra_fields) VALUES (?, ?, ?, ?, ?)",
          [student.id, totalFee, paid, dueDate, extraJson]
        );
        created++;
      }
    } catch (e) {
      errors.push(`Row ${rowNum}: ${e.message}`);
    }
  }

  res.json({
    created, updated, errors,
    recognizedColumns: Array.from(recognizedColumns),
    extraColumns: Array.from(extraColumns),
  });
});

module.exports = router;
