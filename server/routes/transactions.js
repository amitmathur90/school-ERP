const express = require("express");
const db = require("../db");
const { rowToCamel, TRANSACTION_FIELDS } = require("../fieldMap");
const { recordPayment } = require("../paymentService");
const { authenticate, authorizeRoles } = require("../authMiddleware");

const router = express.Router();

router.get("/", authenticate, async (req, res) => {
  const rows = await db.all("SELECT * FROM transactions ORDER BY date DESC");
  res.json(rows.map((r) => {
    const out = rowToCamel(r, TRANSACTION_FIELDS);
    out.additionalFees = r.additional_fees ? JSON.parse(r.additional_fees) : [];
    return out;
  }));
});

// POST /api/transactions — manual entry (cash/offline), used by admin/faculty.
// Body: { studentId, feeAmount, additionalFees: [{label, amount}], totalAmount,
//         paymentType, paymentMode, planTotalAmount, tenureMonths,
//         recordedByName, recordedByRole }
router.post("/", authenticate, authorizeRoles("super_admin", "admin", "accounts"), async (req, res) => {
  try {
    const { transaction } = await recordPayment(req.body);
    res.status(201).json(transaction);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error("Transaction error:", e);
    res.status(500).json({ error: "Something went wrong recording this payment. Please try again." });
  }
});

module.exports = router;
