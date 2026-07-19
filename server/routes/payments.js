const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const db = require("../db");
const { recordPayment, uid } = require("../paymentService");
const { getSetting, setSetting } = require("../settingsService");
const { authenticate, authorizeRoles } = require("../authMiddleware");

const router = express.Router();

const PROVIDER_KEY = "payment_gateway_provider"; // "none" | "razorpay" | "payu"
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

/* ============================== SHARED CONFIG ============================== */

function razorpayConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}
function payuConfigured() {
  return !!(process.env.PAYU_MERCHANT_KEY && process.env.PAYU_SALT);
}
function getRazorpayClient() {
  if (!razorpayConfigured()) return null;
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

// GET /api/payments/config — tells the frontend which ONE gateway (if any)
// is currently active, plus whether each is configured at all (has keys in
// .env) so the admin screen can show "set up" vs "not set up" per option.
router.get("/config", async (req, res) => {
  const provider = await getSetting(PROVIDER_KEY, "none");
  const razorpay = { configured: razorpayConfigured(), keyId: process.env.RAZORPAY_KEY_ID || null };
  const payu = { configured: payuConfigured() };
  const providerReady = provider === "razorpay" ? razorpay.configured : provider === "payu" ? payu.configured : false;
  res.json({ provider, razorpay, payu, available: providerReady });
});

// PATCH /api/payments/config  { provider: "none" | "razorpay" | "payu" }
// Only ONE gateway can be active at a time — selecting one automatically
// means the other is off, there's no separate "enable" per gateway.
// NOTE: like the rest of this API, this endpoint doesn't itself verify the
// caller is an admin — see the README's security notes.
router.patch("/config", authenticate, authorizeRoles("super_admin", "admin"), async (req, res) => {
  const { provider } = req.body;
  if (!["none", "razorpay", "payu"].includes(provider)) {
    return res.status(400).json({ error: "provider must be 'none', 'razorpay', or 'payu'." });
  }
  if (provider === "razorpay" && !razorpayConfigured()) {
    return res.status(400).json({ error: "Razorpay isn't configured yet — add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env first." });
  }
  if (provider === "payu" && !payuConfigured()) {
    return res.status(400).json({ error: "PayU isn't configured yet — add PAYU_MERCHANT_KEY and PAYU_SALT to .env first." });
  }
  await setSetting(PROVIDER_KEY, provider);
  res.json({ ok: true, provider });
});

async function assertActiveProvider(expected) {
  const provider = await getSetting(PROVIDER_KEY, "none");
  if (provider !== expected) {
    const err = new Error(`Online payment is currently set to "${provider}", not "${expected}". Please refresh and try again.`);
    err.status = 503;
    throw err;
  }
}

/* ============================== RAZORPAY ============================== */

// POST /api/payments/razorpay/create-order
// Body: { studentId, feeAmount, additionalFees, totalAmount, paymentMode, planTotalAmount, tenureMonths }
router.post("/razorpay/create-order", async (req, res) => {
  try {
    await assertActiveProvider("razorpay");
  } catch (e) { return res.status(e.status || 503).json({ error: e.message }); }

  const client = getRazorpayClient();
  if (!client) return res.status(503).json({ error: "Razorpay is not configured on this server yet. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env." });

  const { studentId, feeAmount, additionalFees, totalAmount, paymentMode, planTotalAmount, tenureMonths, purpose } = req.body;
  if (!studentId || !totalAmount || Number(totalAmount) <= 0) {
    return res.status(400).json({ error: "studentId and a positive totalAmount are required." });
  }

  const student = await db.get("SELECT id, name, email, phone FROM students WHERE id = ?", [studentId]);
  if (!student) return res.status(404).json({ error: "Student not found." });

  try {
    // Razorpay amounts are in the smallest currency unit (paise for INR).
    const amountPaise = Math.round(Number(totalAmount) * 100);
    const order = await client.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: uid("rcpt"),
      notes: {
        studentId,
        feeAmount: String(feeAmount || 0),
        additionalFees: JSON.stringify(additionalFees || []),
        paymentMode: paymentMode || "Single",
        planTotalAmount: planTotalAmount != null ? String(planTotalAmount) : "",
        tenureMonths: tenureMonths != null ? String(tenureMonths) : "",
        purpose: purpose === "admission" ? "admission" : "course",
      },
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      studentName: student.name,
      studentEmail: student.email,
      studentPhone: student.phone,
    });
  } catch (e) {
    console.error("Razorpay create-order error:", e);
    res.status(502).json({ error: "Could not start the payment. Please try again in a moment." });
  }
});

// POST /api/payments/razorpay/verify
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
//
// This is the step that actually matters for security: never trust a
// "payment succeeded" message from the browser alone — verify the
// cryptographic signature Razorpay sends back, and re-derive the amount and
// student from the order we created (stored via Razorpay's own `notes`
// field), never from anything the client claims at this step.
router.post("/razorpay/verify", async (req, res) => {
  const client = getRazorpayClient();
  if (!client) return res.status(503).json({ error: "Razorpay is not configured on this server." });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing payment verification fields." });
  }

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const valid =
    expectedSignature.length === razorpay_signature.length &&
    crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpay_signature));

  if (!valid) {
    return res.status(400).json({ error: "Payment verification failed. If money was deducted, contact the college office with your payment ID." });
  }

  try {
    const order = await client.orders.fetch(razorpay_order_id);
    const notes = order.notes || {};
    const studentId = notes.studentId;
    if (!studentId) return res.status(400).json({ error: "This payment order has no associated student record." });

    const student = await db.get("SELECT name, email FROM students WHERE id = ?", [studentId]);
    if (!student) return res.status(404).json({ error: "Student not found." });

    const { transaction } = await recordPayment({
      studentId,
      feeAmount: Number(notes.feeAmount || 0),
      additionalFees: notes.additionalFees ? JSON.parse(notes.additionalFees) : [],
      totalAmount: order.amount / 100, // authoritative — from Razorpay's own order, not the request body
      paymentType: "Online",
      paymentMode: notes.paymentMode || "Single",
      planTotalAmount: notes.planTotalAmount ? Number(notes.planTotalAmount) : undefined,
      tenureMonths: notes.tenureMonths ? Number(notes.tenureMonths) : undefined,
      recordedByName: student.name,
      recordedByRole: "student",
      gateway: "razorpay",
      gatewayPaymentId: razorpay_payment_id,
      gatewayOrderId: razorpay_order_id,
      purpose: notes.purpose === "admission" ? "admission" : "course",
    });

    res.status(201).json(transaction);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error("Razorpay verify error:", e);
    res.status(500).json({ error: "Payment was verified but couldn't be recorded. Please contact the college office with your payment ID." });
  }
});

/* ============================== PAYU ============================== */
// PayU doesn't use a JS checkout modal like Razorpay — the browser is
// redirected (via an auto-submitting HTML form) to PayU's own payment page,
// and PayU redirects back to a success/failure URL on our server once the
// payment is done. That means, unlike Razorpay, PayU needs our server to be
// reachable FROM THE INTERNET (PayU's servers POST the result to us) — see
// the README's PayU section for how to test this on localhost (you'll need
// a tunnel like ngrok; it won't work against a bare localhost URL).

function payuHash(fields) {
  // Request hash formula (PayU spec): sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
  const { key, txnid, amount, productinfo, firstname, email, udf1 = "", udf2 = "", udf3 = "", udf4 = "", udf5 = "" } = fields;
  const str = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${process.env.PAYU_SALT}`;
  return crypto.createHash("sha512").update(str).digest("hex");
}

function payuResponseHash(fields) {
  // Response verification formula (reverse order, SALT instead of key):
  // sha512(SALT|status|udf5|udf4|udf3|udf2|udf1||||email|firstname|productinfo|amount|txnid|key)
  const { status, udf1 = "", udf2 = "", udf3 = "", udf4 = "", udf5 = "", email, firstname, productinfo, amount, txnid, key } = fields;
  const str = `${process.env.PAYU_SALT}|${status}|${udf5}|${udf4}|${udf3}|${udf2}|${udf1}||||${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
  return crypto.createHash("sha512").update(str).digest("hex");
}

// POST /api/payments/payu/create-order
// Body: { studentId, feeAmount, additionalFees, totalAmount, paymentMode, planTotalAmount, tenureMonths }
// Returns the PayU form URL + all fields the frontend must POST (as a real
// HTML form submit, not fetch/JSON) to reach PayU's payment page.
router.post("/payu/create-order", async (req, res) => {
  try {
    await assertActiveProvider("payu");
  } catch (e) { return res.status(e.status || 503).json({ error: e.message }); }

  if (!payuConfigured()) return res.status(503).json({ error: "PayU is not configured on this server yet. Set PAYU_MERCHANT_KEY and PAYU_SALT in .env." });

  const { studentId, feeAmount, additionalFees, totalAmount, paymentMode, planTotalAmount, tenureMonths, purpose } = req.body;
  if (!studentId || !totalAmount || Number(totalAmount) <= 0) {
    return res.status(400).json({ error: "studentId and a positive totalAmount are required." });
  }

  const student = await db.get("SELECT id, name, email, phone FROM students WHERE id = ?", [studentId]);
  if (!student) return res.status(404).json({ error: "Student not found." });

  const txnid = uid("payu").replace(/_/g, "").slice(0, 32); // PayU txnid: alphanumeric, no special chars, max ~30 chars
  const amount = Number(totalAmount).toFixed(2);
  const [firstname, ...rest] = (student.name || "Student").split(" ");
  const lastname = rest.join(" ") || ".";

  // All 5 PayU udf slots are already used below, so the admission-vs-course
  // purpose rides in productinfo instead — it's part of both the request and
  // response hash, so the callback can trust it came back unmodified.
  const fields = {
    key: process.env.PAYU_MERCHANT_KEY,
    txnid,
    amount,
    productinfo: purpose === "admission" ? "Admission Fee Payment" : "Course Fee Payment",
    firstname: firstname || "Student",
    email: student.email,
    phone: student.phone || "9999999999",
    udf1: studentId,
    udf2: paymentMode || "Single",
    udf3: String(feeAmount || 0),
    udf4: planTotalAmount != null ? String(planTotalAmount) : "",
    udf5: tenureMonths != null ? String(tenureMonths) : "",
  };
  const hash = payuHash(fields);
  const base = process.env.PAYU_BASE_URL || "https://test.payu.in/_payment";

  res.json({
    payuUrl: base,
    fields: {
      ...fields,
      lastname,
      surl: `${req.protocol}://${req.get("host")}/api/payments/payu/callback`,
      furl: `${req.protocol}://${req.get("host")}/api/payments/payu/failure`,
      hash,
      service_provider: "payu_paisa",
    },
  });
});

// POST /api/payments/payu/callback (surl) — PayU redirects the browser here
// (via a form POST) after a successful payment.
router.post("/payu/callback", express.urlencoded({ extended: true }), async (req, res) => {
  const body = req.body;
  try {
    const expectedHash = payuResponseHash(body);
    if (expectedHash !== body.hash) {
      console.error("PayU response hash mismatch — possible tampering.", body);
      return res.redirect(`${FRONTEND_URL}/?payment=failed&reason=verification`);
    }
    if (body.status !== "success") {
      return res.redirect(`${FRONTEND_URL}/?payment=failed`);
    }

    const studentId = body.udf1;
    const student = await db.get("SELECT name, email FROM students WHERE id = ?", [studentId]);
    if (!student) return res.redirect(`${FRONTEND_URL}/?payment=failed&reason=student`);

    await recordPayment({
      studentId,
      feeAmount: Number(body.udf3 || 0),
      additionalFees: [],
      totalAmount: Number(body.amount),
      paymentType: "Online",
      paymentMode: body.udf2 || "Single",
      planTotalAmount: body.udf4 ? Number(body.udf4) : undefined,
      tenureMonths: body.udf5 ? Number(body.udf5) : undefined,
      recordedByName: student.name,
      recordedByRole: "student",
      gateway: "payu",
      gatewayPaymentId: body.mihpayid || body.txnid,
      gatewayOrderId: body.txnid,
      purpose: body.productinfo === "Admission Fee Payment" ? "admission" : "course",
    });

    res.redirect(`${FRONTEND_URL}/?payment=success`);
  } catch (e) {
    console.error("PayU callback error:", e);
    res.redirect(`${FRONTEND_URL}/?payment=failed&reason=server`);
  }
});

// POST /api/payments/payu/failure (furl) — PayU redirects here if the payment failed/was cancelled.
router.post("/payu/failure", express.urlencoded({ extended: true }), (req, res) => {
  res.redirect(`${FRONTEND_URL}/?payment=failed`);
});

module.exports = router;
