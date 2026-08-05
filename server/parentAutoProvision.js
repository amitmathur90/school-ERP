// parentAutoProvision.js — auto-creates (or links to) a parent login when a
// student finalizes their admission form, using the father's details already
// collected in Step 3 (Family Details): father_email becomes the username,
// father_phone becomes the initial password. Called from
// routes/students.js's finalize route.
//
// This is deliberately best-effort: a student's own admission submission
// must never fail or be blocked because something went wrong provisioning
// their parent's account. Callers wrap this in try/catch and only log on
// failure.
const db = require("./db");
const bcrypt = require("bcryptjs");
const { composeParentWelcomeEmail } = require("./emailTemplates");
const { sendMail } = require("./mailer");

function uid(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

/**
 * @param {object} student  the finalized student record (camelCase, as returned by getStudent())
 * @returns {Promise<string|null>} the parent id that now owns this student, or null if nothing was created/linked
 */
async function autoProvisionParentFromAdmission(student) {
  const email = (student.fatherEmail || "").toLowerCase().trim();
  const phone = (student.fatherPhone || "").trim();
  if (!email || !phone) return null; // nothing usable was provided — Admin can still add a parent manually later

  // A sibling may already have created this same parent login on an earlier
  // admission — just add this student to their existing account rather than
  // creating a second one or touching their password.
  const existingParent = await db.get("SELECT id FROM parents WHERE email = ?", [email]);
  if (existingParent) {
    await db.run(
      "INSERT INTO parent_students (id, parent_id, student_id, relation) VALUES (?, ?, ?, 'father') ON CONFLICT (parent_id, student_id) DO NOTHING",
      [uid("ps"), existingParent.id, student.id]
    );
    return existingParent.id;
  }

  // Don't silently create a parent login on top of an email that already
  // belongs to a teacher or student account — that's a real identity
  // collision for Admin to resolve by hand via the Parents screen, not
  // something to paper over automatically.
  const clash = await db.get(
    "SELECT id FROM teachers WHERE email = ? UNION SELECT id FROM students WHERE email = ?",
    [email, email]
  );
  if (clash) return null;

  const name = [student.fatherFirstMiddle, student.fatherLastName].filter(Boolean).join(" ").trim() || `${student.name}'s Parent`;
  const id = uid("par");
  const hash = await bcrypt.hash(phone, 10);
  await db.run(
    "INSERT INTO parents (id, name, email, password_hash, phone, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?)",
    [id, name, email, hash, phone, new Date().toISOString()]
  );
  await db.run(
    "INSERT INTO parent_students (id, parent_id, student_id, relation) VALUES (?, ?, ?, 'father')",
    [uid("ps"), id, student.id]
  );

  const { subject, body } = composeParentWelcomeEmail({ name, email }, phone, student.name);
  await db.run(
    "INSERT INTO emails (id, to_email, subject, body, date) VALUES (?, ?, ?, ?, ?)",
    [uid("mail"), email, subject, body, new Date().toISOString()]
  );
  sendMail({ to: email, subject, text: body });

  return id;
}

module.exports = { autoProvisionParentFromAdmission };
