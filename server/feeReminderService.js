// feeReminderService.js — automatically reminds students about upcoming
// fee due dates when there's still a balance owing (a partial or zero
// payment against their total fee).
//
// Runs on server startup and then on a recurring interval (wired up in
// server.js). Each qualifying student gets:
//   1. A dashboard notification (inserted into `messages`, same mechanism
//      as any admin-sent notice — shows up in their Notifications page).
//   2. A reminder email (inserted into `emails`, same simulated-email
//      pattern as every other email in this app).
//
// To avoid re-sending the same reminder every single day as the due date
// approaches, each fee record tracks `last_reminder_at` and only sends
// again after REMINDER_COOLOFF_DAYS have passed since the last one.

const db = require("./db");
const { composeFeeDueReminderEmail } = require("./emailTemplates");
const { sendMail } = require("./mailer");

const REMINDER_WINDOW_DAYS = 30;   // "due within 1 month"
const REMINDER_COOLOFF_DAYS = 7;   // don't re-notify the same student more than once a week

function uid(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

async function checkAndSendFeeDueReminders() {
  const windowEnd = new Date(Date.now() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const coolOffCutoff = new Date(Date.now() - REMINDER_COOLOFF_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const candidates = await db.all(
    `SELECT f.*, s.name AS student_name, s.email AS student_email, s.status AS student_status
     FROM fees f
     JOIN students s ON s.id = f.student_id
     WHERE f.due_date IS NOT NULL
       AND f.due_date <= ?
       AND f.paid < f.total_fee
       AND f.total_fee > 0
       AND s.status = 'approved'
       AND (f.last_reminder_at IS NULL OR f.last_reminder_at <= ?)`,
    [windowEnd, coolOffCutoff]
  );

  let sent = 0;
  for (const fee of candidates) {
    try {
      const student = { name: fee.student_name, email: fee.student_email };
      const balance = Number(fee.total_fee) - Number(fee.paid);
      const dueDateStr = new Date(fee.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

      // Dashboard notification
      await db.run(
        "INSERT INTO messages (id, to_student_id, from_name, from_role, text, date) VALUES (?, ?, ?, ?, ?, ?)",
        [
          uid("msg"), fee.student_id, "Accounts Office", "admin",
          `Reminder: ₹${balance.toLocaleString("en-IN")} is due by ${dueDateStr}. Please complete your payment to avoid any inconvenience.`,
          new Date().toISOString(),
        ]
      );

      // Reminder email
      const { subject, body } = composeFeeDueReminderEmail(student, fee);
      await db.run(
        "INSERT INTO emails (id, to_email, subject, body, date) VALUES (?, ?, ?, ?, ?)",
        [uid("mail"), student.email, subject, body, new Date().toISOString()]
      );
      sendMail({ to: student.email, subject, text: body });

      await db.run("UPDATE fees SET last_reminder_at = ? WHERE student_id = ?", [new Date().toISOString(), fee.student_id]);
      sent++;
    } catch (e) {
      console.error(`Fee reminder failed for student ${fee.student_id}:`, e.message);
    }
  }

  if (sent > 0) console.log(`Fee due reminders: sent ${sent}.`);
  return sent;
}

module.exports = { checkAndSendFeeDueReminders };
