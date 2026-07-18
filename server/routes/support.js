// support.js — student help-desk tickets. Students open a ticket and reply
// in a thread; admins (with the "support" module) see every ticket, reply,
// and mark them resolved/reopened. Kept as two small tables (ticket + a
// reply thread) rather than one row per ticket with a growing text blob, so
// each side of the conversation is its own record with its own author/date.

const express = require("express");
const db = require("../db");
const { rowToCamel, SUPPORT_TICKET_FIELDS, SUPPORT_REPLY_FIELDS } = require("../fieldMap");
const { authenticate } = require("../authMiddleware");

const router = express.Router();
router.use(authenticate);

function uid(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function isSupportStaff(user) {
  if (user.role === "student") return false;
  if (user.role === "super_admin") return true;
  return (user.permissions || []).includes("support");
}

// GET /api/support/tickets — students see only their own; support staff see all.
router.get("/tickets", async (req, res) => {
  if (req.user.role === "student") {
    const rows = await db.all("SELECT * FROM support_tickets WHERE student_id = ? ORDER BY updated_at DESC", [req.user.id]);
    return res.json(rows.map((r) => rowToCamel(r, SUPPORT_TICKET_FIELDS)));
  }
  if (!isSupportStaff(req.user)) return res.status(403).json({ error: "You don't have access to Support." });
  const rows = await db.all("SELECT * FROM support_tickets ORDER BY updated_at DESC");
  res.json(rows.map((r) => rowToCamel(r, SUPPORT_TICKET_FIELDS)));
});

// POST /api/support/tickets  { subject, message } — student opens a new ticket.
router.post("/tickets", async (req, res) => {
  if (req.user.role !== "student") return res.status(403).json({ error: "Only students can open a support ticket." });
  const { subject, message } = req.body;
  if (!subject?.trim() || !message?.trim()) return res.status(400).json({ error: "Subject and message are required." });

  const now = new Date().toISOString();
  const id = uid("tkt");
  await db.run(
    "INSERT INTO support_tickets (id, student_id, subject, status, created_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?)",
    [id, req.user.id, subject.trim(), now, now]
  );
  await db.run(
    "INSERT INTO support_replies (id, ticket_id, from_role, from_name, text, date) VALUES (?, ?, 'student', ?, ?, ?)",
    [uid("rep"), id, req.user.name, message.trim(), now]
  );
  const row = await db.get("SELECT * FROM support_tickets WHERE id = ?", [id]);
  res.status(201).json(rowToCamel(row, SUPPORT_TICKET_FIELDS));
});

async function loadTicketForUser(req, res) {
  const ticket = await db.get("SELECT * FROM support_tickets WHERE id = ?", [req.params.id]);
  if (!ticket) { res.status(404).json({ error: "Ticket not found." }); return null; }
  if (req.user.role === "student") {
    if (ticket.student_id !== req.user.id) { res.status(403).json({ error: "That's not your ticket." }); return null; }
  } else if (!isSupportStaff(req.user)) {
    res.status(403).json({ error: "You don't have access to Support." });
    return null;
  }
  return ticket;
}

// GET /api/support/tickets/:id/replies
router.get("/tickets/:id/replies", async (req, res) => {
  const ticket = await loadTicketForUser(req, res);
  if (!ticket) return;
  const rows = await db.all("SELECT * FROM support_replies WHERE ticket_id = ? ORDER BY date ASC", [req.params.id]);
  res.json(rows.map((r) => rowToCamel(r, SUPPORT_REPLY_FIELDS)));
});

// POST /api/support/tickets/:id/replies  { text }
router.post("/tickets/:id/replies", async (req, res) => {
  const ticket = await loadTicketForUser(req, res);
  if (!ticket) return;
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "Reply text is required." });

  const now = new Date().toISOString();
  const fromRole = req.user.role === "student" ? "student" : "admin";
  await db.run(
    "INSERT INTO support_replies (id, ticket_id, from_role, from_name, text, date) VALUES (?, ?, ?, ?, ?, ?)",
    [uid("rep"), req.params.id, fromRole, req.user.name, text.trim(), now]
  );
  // A staff reply on a resolved ticket reopens it — the conversation isn't over.
  const nextStatus = fromRole === "admin" && ticket.status === "resolved" ? "open" : ticket.status;
  await db.run("UPDATE support_tickets SET updated_at = ?, status = ? WHERE id = ?", [now, nextStatus, req.params.id]);

  // Let the student know via their existing Notifications inbox when staff reply.
  if (fromRole === "admin") {
    await db.run(
      "INSERT INTO messages (id, to_student_id, from_name, from_role, text, date) VALUES (?, ?, ?, ?, ?, ?)",
      [uid("msg"), ticket.student_id, req.user.name, "admin", `New reply on your support ticket "${ticket.subject}".`, now]
    );
  }

  const row = await db.get("SELECT * FROM support_tickets WHERE id = ?", [req.params.id]);
  res.status(201).json({ ticket: rowToCamel(row, SUPPORT_TICKET_FIELDS) });
});

// PATCH /api/support/tickets/:id  { status: 'open' | 'resolved' } — staff only.
router.patch("/tickets/:id", async (req, res) => {
  if (!isSupportStaff(req.user)) return res.status(403).json({ error: "You don't have access to Support." });
  const { status } = req.body;
  if (!["open", "resolved"].includes(status)) return res.status(400).json({ error: "status must be 'open' or 'resolved'." });
  const existing = await db.get("SELECT id FROM support_tickets WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Ticket not found." });
  await db.run("UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?", [status, new Date().toISOString(), req.params.id]);
  const row = await db.get("SELECT * FROM support_tickets WHERE id = ?", [req.params.id]);
  res.json(rowToCamel(row, SUPPORT_TICKET_FIELDS));
});

module.exports = router;
