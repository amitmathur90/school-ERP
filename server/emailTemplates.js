const COLLEGE_NAME = "Sir Pratap Vidhi Mahavidyalaya";
const COLLEGE_EMAIL = "info.spmjodh@gmail.com";
const COLLEGE_PHONES = ["(+91) 6378800229", "(+91) 9414145735", "(+91) 9460155558"];
const EMAIL_FOOTER =
  `For all future requests, you can reach us through the following channels:\n` +
  `Email: ${COLLEGE_EMAIL}, Contact No.: ${COLLEGE_PHONES.join(" / ")}`;

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// NOTE: this only composes and stores email text in the `emails` table — it
// does not actually send email. Wire this to a real provider (SendGrid,
// Resend, SMTP, etc.) in sendRegistrationEmail/sendFeeReceiptEmail below if
// you want real delivery.
function composeRegistrationEmail(student, plainPassword) {
  return {
    subject: `Registration Successful — ${COLLEGE_NAME}`,
    body:
`Dear ${student.name},

Thank you for applying to ${COLLEGE_NAME}. Your registration has been completed successfully and your application is now under review by our admissions office.

Your student portal login details are below:
Username: ${student.email}
Password: ${plainPassword}

Please keep these credentials safe. You can sign in any time to track your admission status, view your submitted application, and update your contact details.

${EMAIL_FOOTER}`,
  };
}

function composeFeeReceiptEmail(student, txn) {
  return {
    subject: `Fee Payment Receipt — ${COLLEGE_NAME}`,
    body:
`Dear ${student.name},

We have received your fee payment. Details are below:

Amount Received: ₹${Number(txn.total_amount).toLocaleString("en-IN")}
Payment Type: ${txn.payment_type}
Payment Mode: ${txn.payment_mode}${txn.payment_mode === "EMI" ? `\nInstallment Amount: ₹${Number(txn.installment_amount || 0).toLocaleString("en-IN")}` : ""}
Date: ${fmtDate(txn.date)}
Recorded By: ${txn.recorded_by_name}

Thank you for your prompt payment.

${EMAIL_FOOTER}`,
  };
}

module.exports = { composeRegistrationEmail, composeFeeReceiptEmail };
