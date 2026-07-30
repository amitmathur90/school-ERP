// mailer.js — actually delivers the emails this app composes and logs to
// the `emails` table. Configure via .env: SMTP_USER + SMTP_PASS (a Gmail
// address + an App Password, not your normal Gmail password — see README).
// If those aren't set, sendMail() just logs a warning and skips delivery;
// the rest of the app keeps working exactly as before (email still visible
// in the in-app Emails log, just not delivered to the real inbox).

const nodemailer = require("nodemailer");

let transporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
} else {
  console.warn("SMTP_USER/SMTP_PASS not set in .env — emails will be logged in-app but not actually delivered. See server/README.md.");
}

/** Fire-and-forget: never throws, so a mail-provider hiccup can't break the request that triggered it. */
async function sendMail({ to, subject, text }) {
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || "Greenwood Public School"}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
    });
  } catch (e) {
    console.error(`Failed to send email to ${to}:`, e.message);
  }
}

module.exports = { sendMail };
