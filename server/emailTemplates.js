const COLLEGE_NAME = "Sir Pratap Vidhi Mahavidyalaya";
const COLLEGE_EMAIL = "info.spmjodh@gmail.com";
const COLLEGE_PHONES = ["(+91) 6378800229", "(+91) 9414145735", "(+91) 9460155558"];
const EMAIL_FOOTER =
  `For all future requests, you can reach us through the following channels:\n` +
  `Email: ${COLLEGE_EMAIL}, Contact No.: ${COLLEGE_PHONES.join(" / ")}`;

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Each compose* function below just builds the subject/body — every caller
// also inserts a row into the `emails` table (an in-app, durable log) and
// passes the same subject/body to mailer.js's sendMail() for real delivery.
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

Receipt / Transaction ID: ${txn.id}
Amount Received: ₹${Number(txn.total_amount).toLocaleString("en-IN")}
Payment Type: ${txn.payment_type}
Payment Mode: ${txn.payment_mode}${txn.payment_mode === "EMI" ? `\nInstallment Amount: ₹${Number(txn.installment_amount || 0).toLocaleString("en-IN")}` : ""}
Date: ${fmtDate(txn.date)}
Recorded By: ${txn.recorded_by_name}
${txn.gateway ? `Payment Gateway: ${txn.gateway.charAt(0).toUpperCase() + txn.gateway.slice(1)}\nGateway Payment ID: ${txn.gateway_payment_id}` : ""}

Please keep this Transaction ID for your records — you can also view and print this receipt anytime from your Fees & Payments page.

Thank you for your prompt payment.

${EMAIL_FOOTER}`,
  };
}

function composeFeeDueReminderEmail(student, fee) {
  const balance = Number(fee.total_fee) - Number(fee.paid);
  return {
    subject: `Fee Due Reminder — ${COLLEGE_NAME}`,
    body:
`Dear ${student.name},

This is a reminder that a fee payment is due soon on your account.

Amount Due: ₹${balance.toLocaleString("en-IN")}
Due Date: ${fmtDate(fee.due_date)}
Amount Paid So Far: ₹${Number(fee.paid).toLocaleString("en-IN")}
Total Fee: ₹${Number(fee.total_fee).toLocaleString("en-IN")}

Please complete your payment before the due date to avoid any inconvenience. You can pay online from your Fees & Payments page, or visit the accounts office.

${EMAIL_FOOTER}`,
  };
}

function composeTempPasswordEmail(student, tempPassword) {
  return {
    subject: `Your Password Has Been Reset — ${COLLEGE_NAME}`,
    body:
`Dear ${student.name},

An administrator has reset your student portal password. Your new temporary login details are below:

Username: ${student.email}
Temporary Password: ${tempPassword}

Please sign in with this temporary password and change it right away from Edit Profile > Change Password.

If you didn't request this change, please contact the accounts/admissions office immediately.

${EMAIL_FOOTER}`,
  };
}

function composeRejectionEmail(student, reason) {
  return {
    subject: `Update on Your Admission Application — ${COLLEGE_NAME}`,
    body:
`Dear ${student.name},

Thank you for your interest in ${COLLEGE_NAME}. After reviewing your application, we regret to inform you that we are unable to offer you admission at this time.

Reason: ${reason && reason.trim() ? reason.trim() : "Not specified by the admissions office."}

If you have any questions about this decision or would like to discuss your application further, please reach out to us using the contact details below.

${EMAIL_FOOTER}`,
  };
}

module.exports = { composeRegistrationEmail, composeFeeReceiptEmail, composeFeeDueReminderEmail, composeTempPasswordEmail, composeRejectionEmail };
