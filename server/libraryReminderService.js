// libraryReminderService.js — due-soon and overdue reminders for library
// loans (PRD 4.6). Mirrors feeReminderService.js's shape: runs at startup and
// on a recurring interval (wired up in server.js), tracks last_reminder_at
// per loan so the same loan isn't re-notified every single run.
//
// Recipients: the borrower's own email, plus — for student borrowers — both
// parent emails already on file from admission (father_email/mother_email),
// since a young student isn't the one checking their inbox (PRD: "a 7-year-old
// isn't checking email; their parent is"). This app has no separate parent
// login/account, so email is how parent visibility is delivered in v1 (see
// the note at the top of gps-library-management-prd.md about there being no
// existing parent-account system to plug into).

const db = require("./db");
const { composeLibraryDueSoonEmail, composeLibraryOverdueEmail } = require("./emailTemplates");
const { sendMail } = require("./mailer");

const DUE_SOON_WINDOW_DAYS = 3;
const REMINDER_COOLOFF_DAYS = 3; // shorter than fees' 7 — loan periods are much shorter than fee due cycles

function uid(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

async function notify(loan, kind) {
  const recipients = [];
  let dashboardStudentId = null;

  if (loan.borrower_type === "student") {
    const s = await db.get("SELECT name, email, father_email, mother_email FROM students WHERE id = ?", [loan.borrower_id]);
    if (!s) return;
    if (s.email) recipients.push({ email: s.email, name: s.name });
    if (s.father_email) recipients.push({ email: s.father_email, name: s.name });
    if (s.mother_email) recipients.push({ email: s.mother_email, name: s.name });
    dashboardStudentId = loan.borrower_id;
  } else {
    const t = await db.get("SELECT name, email FROM teachers WHERE id = ?", [loan.borrower_id]);
    if (!t || !t.email) return;
    recipients.push({ email: t.email, name: t.name });
  }
  if (recipients.length === 0) return;

  const compose = kind === "overdue" ? composeLibraryOverdueEmail : composeLibraryDueSoonEmail;
  const borrowerName = recipients[0].name;
  const { subject, body } = compose(borrowerName, loan);

  for (const r of recipients) {
    await db.run("INSERT INTO emails (id, to_email, subject, body, date) VALUES (?, ?, ?, ?, ?)", [uid("mail"), r.email, subject, body, new Date().toISOString()]);
    sendMail({ to: r.email, subject, text: body });
  }

  if (dashboardStudentId) {
    const text = kind === "overdue"
      ? `"${loan.title}" was due on ${new Date(loan.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} and is now overdue. Please return it to the library.`
      : `"${loan.title}" is due back at the library on ${new Date(loan.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}.`;
    await db.run(
      "INSERT INTO messages (id, to_student_id, from_name, from_role, text, date) VALUES (?, ?, ?, ?, ?, ?)",
      [uid("msg"), dashboardStudentId, "Library", "admin", text, new Date().toISOString()]
    );
  }
}

async function checkAndSendLibraryReminders() {
  const windowEnd = new Date(Date.now() + DUE_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const coolOffCutoff = new Date(Date.now() - REMINDER_COOLOFF_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const dueSoon = await db.all(
    `SELECT bl.*, bt.title, bc.accession_no FROM book_loans bl
     JOIN book_copies bc ON bc.id = bl.copy_id JOIN book_titles bt ON bt.id = bc.title_id
     WHERE bl.returned_at IS NULL AND bl.due_date >= ? AND bl.due_date <= ?
       AND (bl.last_reminder_at IS NULL OR bl.last_reminder_at <= ?)`,
    [today, windowEnd, coolOffCutoff]
  );
  const overdue = await db.all(
    `SELECT bl.*, bt.title, bc.accession_no FROM book_loans bl
     JOIN book_copies bc ON bc.id = bl.copy_id JOIN book_titles bt ON bt.id = bc.title_id
     WHERE bl.returned_at IS NULL AND bl.due_date < ?
       AND (bl.last_reminder_at IS NULL OR bl.last_reminder_at <= ?)`,
    [today, coolOffCutoff]
  );

  let sent = 0;
  for (const loan of dueSoon) {
    try { await notify(loan, "dueSoon"); await db.run("UPDATE book_loans SET last_reminder_at = ? WHERE id = ?", [new Date().toISOString(), loan.id]); sent++; }
    catch (e) { console.error(`Library due-soon reminder failed for loan ${loan.id}:`, e.message); }
  }
  for (const loan of overdue) {
    try { await notify(loan, "overdue"); await db.run("UPDATE book_loans SET last_reminder_at = ? WHERE id = ?", [new Date().toISOString(), loan.id]); sent++; }
    catch (e) { console.error(`Library overdue reminder failed for loan ${loan.id}:`, e.message); }
  }

  if (sent > 0) console.log(`Library due/overdue reminders: sent ${sent}.`);
  return sent;
}

module.exports = { checkAndSendLibraryReminders };
