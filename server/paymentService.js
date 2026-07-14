// paymentService.js — the one place that actually writes a fee payment to
// the database. Both the manual entry route (routes/transactions.js, used
// by admin/faculty for cash/offline payments) and the gateway-verified
// route (routes/payments.js, used after Razorpay confirms an online
// payment) call this same function, so there's exactly one code path that
// touches money — no duplicated logic to accidentally let drift apart.

const db = require("./db");
const { rowToCamel, TRANSACTION_FIELDS } = require("./fieldMap");
const { composeFeeReceiptEmail } = require("./emailTemplates");

function uid(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

/**
 * Records a fee payment and updates the student's fee balance atomically.
 *
 * @param {object} params
 * @param {string} params.studentId
 * @param {number} params.feeAmount
 * @param {Array}  params.additionalFees  [{label, amount}, ...]
 * @param {number} params.totalAmount     the amount actually charged/received
 * @param {string} params.paymentType     'Cash' | 'Online'
 * @param {string} params.paymentMode     'Single' | 'EMI'
 * @param {number} [params.planTotalAmount]
 * @param {number} [params.tenureMonths]
 * @param {string} params.recordedByName
 * @param {string} params.recordedByRole  'admin' | 'teacher' | 'student' (self-service online payment)
 * @param {string} [params.gateway]       e.g. 'razorpay' — omitted for manual/cash entries
 * @param {string} [params.gatewayPaymentId]
 * @param {string} [params.gatewayOrderId]
 * @returns {Promise<{transaction: object, student: object}>}
 */
async function recordPayment(params) {
  const {
    studentId, feeAmount, additionalFees, totalAmount, paymentType, paymentMode,
    planTotalAmount, tenureMonths, recordedByName, recordedByRole,
    gateway, gatewayPaymentId, gatewayOrderId,
  } = params;

  if (!studentId || !totalAmount) {
    const err = new Error("studentId and totalAmount are required.");
    err.status = 400;
    throw err;
  }

  const { txnRow, student } = await db.transaction(async (tx) => {
    const student = await tx.get("SELECT * FROM students WHERE id = ?", [studentId]);
    if (!student) {
      const err = new Error("Student not found.");
      err.status = 404;
      throw err;
    }

    // FOR UPDATE locks this fee row until the transaction commits, so a second
    // concurrent payment for the same student has to wait for this one to
    // finish reading+writing instead of both reading the same stale "paid"
    // value and one silently overwriting the other's update.
    const existingFee = await tx.get("SELECT * FROM fees WHERE student_id = ? FOR UPDATE", [studentId]);

    let installmentAmount = null;
    let newPlanTotal = existingFee?.plan_total_amount ?? null;
    let newPlanTenure = existingFee?.plan_tenure_months ?? null;
    let newPlanEmisPaid = existingFee?.plan_emis_paid ?? null;

    if (paymentMode === "EMI") {
      if (existingFee?.plan_total_amount != null) {
        newPlanEmisPaid = Math.min(existingFee.plan_tenure_months, (existingFee.plan_emis_paid || 0) + 1);
        installmentAmount = existingFee.plan_installment;
      } else {
        newPlanTotal = planTotalAmount || existingFee?.total_fee || totalAmount;
        newPlanTenure = Number(tenureMonths) || 1;
        installmentAmount = Math.round(newPlanTotal / newPlanTenure);
        newPlanEmisPaid = 1;
      }
    }

    const id = uid("txn");
    const date = new Date().toISOString();
    await tx.run(
      `INSERT INTO transactions (id, student_id, fee_amount, additional_fees, total_amount, payment_type, payment_mode, plan_total_amount, tenure_months, installment_amount, date, recorded_by_name, recorded_by_role, gateway, gateway_payment_id, gateway_order_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, studentId, feeAmount || 0, JSON.stringify(additionalFees || []), totalAmount,
        paymentType || "Cash", paymentMode || "Single",
        paymentMode === "EMI" ? newPlanTotal : null,
        paymentMode === "EMI" ? newPlanTenure : null,
        paymentMode === "EMI" ? installmentAmount : null,
        date, recordedByName || "", recordedByRole || "",
        gateway || null, gatewayPaymentId || null, gatewayOrderId || null,
      ]
    );

    const newPaid = (existingFee?.paid || 0) + Number(totalAmount);
    if (existingFee) {
      await tx.run(
        `UPDATE fees SET paid = ?, plan_total_amount = ?, plan_tenure_months = ?, plan_installment = ?, plan_emis_paid = ? WHERE student_id = ?`,
        [newPaid, newPlanTotal, newPlanTenure, installmentAmount, newPlanEmisPaid, studentId]
      );
    } else {
      await tx.run(
        `INSERT INTO fees (student_id, total_fee, paid, plan_total_amount, plan_tenure_months, plan_installment, plan_emis_paid) VALUES (?, 0, ?, ?, ?, ?, ?)`,
        [studentId, newPaid, newPlanTotal, newPlanTenure, installmentAmount, newPlanEmisPaid]
      );
    }

    const txnRow = await tx.get("SELECT * FROM transactions WHERE id = ?", [id]);
    return { txnRow, student };
  });

  const { subject, body } = composeFeeReceiptEmail({ name: student.name, email: student.email }, txnRow);
  await db.run(
    "INSERT INTO emails (id, to_email, subject, body, date) VALUES (?, ?, ?, ?, ?)",
    [uid("mail"), student.email, subject, body, new Date().toISOString()]
  );

  const transaction = rowToCamel(txnRow, TRANSACTION_FIELDS);
  transaction.additionalFees = additionalFees || [];
  return { transaction, student };
}

module.exports = { recordPayment, uid };
