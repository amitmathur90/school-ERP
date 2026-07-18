// support.js — student help-desk tickets. Students open a ticket and reply
// in a thread (optionally attaching a file); admins (with the "support"
// module) see every ticket, reply, attach files too, and set status.
// Two small tables: one row per ticket, one row per reply in its thread —
// each reply carries its own optional attachment rather than a separate
// attachments table, since a ticket reply has at most one file.

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
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

const VALID_STATUSES = ["open", "resolved", "closed"];

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads", "support");
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
    cb(null, UPLOAD_ROOT);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName}`);
  },
});
const ALLOWED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/gif", "application/pdf"];
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) return cb(new Error("Only JPG, PNG, GIF, or PDF files are allowed."));
    cb(null, true);
  },
});
// Wraps multer's single-file upload so its errors come back as a normal
// { error } JSON response instead of an uncaught exception / raw 500 page —
// same shape every other route in this app returns errors in.
function uploadOptionalFile(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed." });
    next();
  });
}

// GET /api/support/tickets — students see only their own; support staff see
// all; any other authenticated role (faculty, HR, etc. without the module)
// just gets an empty list rather than a 403, since this is called
// unconditionally on login as part of the app's bulk data load and
// shouldn't break login for roles that simply don't use Support.
router.get("/tickets", async (req, res) => {
  if (req.user.role === "student") {
    const rows = await db.all("SELECT * FROM support_tickets WHERE student_id = ? ORDER BY updated_at DESC", [req.user.id]);
    return res.json(rows.map((r) => rowToCamel(r, SUPPORT_TICKET_FIELDS)));
  }
  if (!isSupportStaff(req.user)) return res.json([]);
  const rows = await db.all("SELECT * FROM support_tickets ORDER BY updated_at DESC");
  res.json(rows.map((r) => rowToCamel(r, SUPPORT_TICKET_FIELDS)));
});

// POST /api/support/tickets  (multipart/form-data: subject, message, file?) — student opens a new ticket.
router.post("/tickets", uploadOptionalFile, async (req, res) => {
  if (req.user.role !== "student") return res.status(403).json({ error: "Only students can open a support ticket." });
  const { subject, message } = req.body;
  if (!subject?.trim() || !message?.trim()) return res.status(400).json({ error: "Subject and message are required." });

  const now = new Date().toISOString();
  const id = uid("tkt");
  await db.run(
    "INSERT INTO support_tickets (id, student_id, subject, status, student_unread, admin_unread, created_at, updated_at) VALUES (?, ?, ?, 'open', false, true, ?, ?)",
    [id, req.user.id, subject.trim(), now, now]
  );
  await db.run(
    `INSERT INTO support_replies (id, ticket_id, from_role, from_name, text, date, attachment_name, attachment_path, attachment_size, attachment_mime)
     VALUES (?, ?, 'student', ?, ?, ?, ?, ?, ?, ?)`,
    [uid("rep"), id, req.user.name, message.trim(), now,
      req.file?.originalname || null, req.file?.filename || null, req.file?.size || null, req.file?.mimetype || null]
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

// GET /api/support/tickets/:id/replies — also clears the viewer's own
// unread flag (opening the thread is what "read" means here), and returns
// the ticket's fresh state alongside the replies so the frontend's list/badge
// stays in sync without a second round-trip.
router.get("/tickets/:id/replies", async (req, res) => {
  const ticket = await loadTicketForUser(req, res);
  if (!ticket) return;
  const unreadCol = req.user.role === "student" ? "student_unread" : "admin_unread";
  await db.run(`UPDATE support_tickets SET ${unreadCol} = false WHERE id = ?`, [req.params.id]);
  const [rows, freshTicket] = await Promise.all([
    db.all("SELECT * FROM support_replies WHERE ticket_id = ? ORDER BY date ASC", [req.params.id]),
    db.get("SELECT * FROM support_tickets WHERE id = ?", [req.params.id]),
  ]);
  res.json({
    ticket: rowToCamel(freshTicket, SUPPORT_TICKET_FIELDS),
    replies: rows.map((r) => rowToCamel(r, SUPPORT_REPLY_FIELDS)),
  });
});

// POST /api/support/tickets/:id/replies  (multipart/form-data: text, file?)
router.post("/tickets/:id/replies", uploadOptionalFile, async (req, res) => {
  const ticket = await loadTicketForUser(req, res);
  if (!ticket) return;
  const { text } = req.body;
  if (!text?.trim() && !req.file) return res.status(400).json({ error: "Reply text or an attachment is required." });

  const now = new Date().toISOString();
  const fromRole = req.user.role === "student" ? "student" : "admin";
  await db.run(
    `INSERT INTO support_replies (id, ticket_id, from_role, from_name, text, date, attachment_name, attachment_path, attachment_size, attachment_mime)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uid("rep"), req.params.id, fromRole, req.user.name, (text || "").trim(), now,
      req.file?.originalname || null, req.file?.filename || null, req.file?.size || null, req.file?.mimetype || null]
  );

  // A staff reply on a non-open ticket reopens it — the conversation isn't over.
  // Either side's reply flips the OTHER side's unread flag; the replier has
  // obviously already "seen" their own message, so their own flag is untouched here.
  const nextStatus = fromRole === "admin" && ticket.status !== "open" ? "open" : ticket.status;
  const flagToSet = fromRole === "student" ? "admin_unread" : "student_unread";
  await db.run(
    `UPDATE support_tickets SET updated_at = ?, status = ?, ${flagToSet} = true WHERE id = ?`,
    [now, nextStatus, req.params.id]
  );

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

// PATCH /api/support/tickets/:id  { status: 'open' | 'resolved' | 'closed' } — staff only.
router.patch("/tickets/:id", async (req, res) => {
  if (!isSupportStaff(req.user)) return res.status(403).json({ error: "You don't have access to Support." });
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}.` });
  const existing = await db.get("SELECT id FROM support_tickets WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Ticket not found." });
  await db.run("UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?", [status, new Date().toISOString(), req.params.id]);
  const row = await db.get("SELECT * FROM support_tickets WHERE id = ?", [req.params.id]);
  res.json(rowToCamel(row, SUPPORT_TICKET_FIELDS));
});

// GET /api/support/replies/:replyId/file — streams a reply's attachment.
// Access follows the same rule as the thread itself: the ticket's own
// student, or support staff.
router.get("/replies/:replyId/file", async (req, res) => {
  const reply = await db.get("SELECT * FROM support_replies WHERE id = ?", [req.params.replyId]);
  if (!reply || !reply.attachment_path) return res.status(404).json({ error: "Attachment not found." });
  const ticket = await db.get("SELECT * FROM support_tickets WHERE id = ?", [reply.ticket_id]);
  if (!ticket) return res.status(404).json({ error: "Ticket not found." });
  if (req.user.role === "student") {
    if (ticket.student_id !== req.user.id) return res.status(403).json({ error: "That's not your ticket." });
  } else if (!isSupportStaff(req.user)) {
    return res.status(403).json({ error: "You don't have access to Support." });
  }
  const fullPath = path.join(UPLOAD_ROOT, reply.attachment_path);
  if (!fullPath.startsWith(UPLOAD_ROOT)) return res.status(400).json({ error: "Invalid file path." });
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "File is missing from disk." });
  res.setHeader("Content-Disposition", `inline; filename="${reply.attachment_name || "attachment"}"`);
  res.sendFile(fullPath);
});

module.exports = router;
