const express = require("express");
const db = require("../db");
const { rowToCamel, EMAIL_FIELDS } = require("../fieldMap");

const router = express.Router();

// GET /api/emails?to=someone@example.com
router.get("/", async (req, res) => {
  const { to } = req.query;
  const rows = to
    ? await db.all("SELECT * FROM emails WHERE to_email = ? ORDER BY date DESC", [to])
    : await db.all("SELECT * FROM emails ORDER BY date DESC");
  res.json(rows.map((r) => rowToCamel(r, EMAIL_FIELDS)));
});

module.exports = router;
