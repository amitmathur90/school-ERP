// routes/library.js — Library Management module (see gps-library-management-prd.md).
//
// Scope covered here is the PRD's v1 rollout phase: catalog CRUD + CSV
// import, search/browse by reading level, issue/return/renew, configurable
// overdue consequences (none/hold/fine) per grade band, reading log/
// milestones computed from loan history, and core reports. Reservations
// and barcode scanning (v1.1/v2) are intentionally not built.
//
// Grade bands reuse the same Pre-Primary/Primary/Middle/Secondary/Senior
// Secondary groups already used for classes (courses.course_group) — no new
// "grade" concept was invented. Students borrow under their own grade
// band's policy; teachers (who don't have a grade band) borrow under a
// single fixed staff policy (see TEACHER_POLICY below) rather than needing
// their own settings table, since the PRD only asks for per-grade-band
// configurability on the student side.
const express = require("express");
const db = require("../db");
const { rowToCamel, camelToSnakeParams, camelToSnakeSet, BOOK_TITLE_FIELDS, BOOK_COPY_FIELDS } = require("../fieldMap");
const { mapRow, BOOK_ALIAS_MAP } = require("../csvImport");
const { authenticate, authorizeRoles } = require("../authMiddleware");

const router = express.Router();

const STAFF_ROLES_FOR_DESK = ["super_admin", "admin", "librarian"];

function uid(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}
function daysBetween(fromStr, toStr) {
  return Math.floor((new Date(toStr) - new Date(fromStr)) / (24 * 60 * 60 * 1000));
}

const FALLBACK_POLICY = { gradeBand: null, loanPeriodDays: 14, maxSimultaneousLoans: 3, consequenceType: "hold", dailyFineRate: 0, fineCap: 0, renewalLimit: 2 };
// Teachers don't have a grade band — a single fixed policy covers staff
// borrowing (PRD 4.1: "often longer loan periods"), rather than building a
// whole separate settings table for one fixed row.
const TEACHER_POLICY = { gradeBand: "Staff", loanPeriodDays: 30, maxSimultaneousLoans: 5, consequenceType: "none", dailyFineRate: 0, fineCap: 0, renewalLimit: 3 };

function settingsToCamel(r) {
  if (!r) return null;
  return {
    gradeBand: r.grade_band, loanPeriodDays: r.loan_period_days, maxSimultaneousLoans: r.max_simultaneous_loans,
    consequenceType: r.consequence_type, dailyFineRate: Number(r.daily_fine_rate), fineCap: Number(r.fine_cap),
    renewalLimit: r.renewal_limit,
  };
}

function loanToCamel(r) {
  return {
    id: r.id, copyId: r.copy_id, borrowerType: r.borrower_type, borrowerId: r.borrower_id, gradeBand: r.grade_band,
    issuedAt: r.issued_at, dueDate: r.due_date, returnedAt: r.returned_at, renewedCount: r.renewed_count,
    consequenceType: r.consequence_type, dailyFineRate: Number(r.daily_fine_rate), fineCap: Number(r.fine_cap),
    fineAmount: Number(r.fine_amount), fineStatus: r.fine_status, issuedBy: r.issued_by, returnedBy: r.returned_by,
    countsTowardProgram: r.counts_toward_program,
    // joined extras, present when the query includes them
    title: r.title, authors: r.authors, accessionNo: r.accession_no,
    borrowerName: r.borrower_name, borrowerRef: r.borrower_ref,
  };
}

/** Looks up a borrower (student or teacher) and their effective library policy. */
async function resolveBorrower(borrowerType, borrowerId) {
  if (borrowerType === "teacher") {
    const t = await db.get("SELECT id, name, email FROM teachers WHERE id = ?", [borrowerId]);
    if (!t) return null;
    return { id: t.id, name: t.name, email: t.email, fatherEmail: null, motherEmail: null, policy: TEACHER_POLICY };
  }
  const s = await db.get(
    `SELECT s.id, s.name, s.email, s.father_email, s.mother_email, s.course_group AS student_group, c.course_group AS course_group
     FROM students s LEFT JOIN courses c ON c.id = s.course_id WHERE s.id = ?`,
    [borrowerId]
  );
  if (!s) return null;
  const gradeBand = s.course_group || s.student_group || null;
  const settingsRow = gradeBand ? await db.get("SELECT * FROM library_settings WHERE grade_band = ?", [gradeBand]) : null;
  const policy = settingsToCamel(settingsRow) || { ...FALLBACK_POLICY, gradeBand };
  return { id: s.id, name: s.name, email: s.email, fatherEmail: s.father_email, motherEmail: s.mother_email, policy };
}

/* ============================== CATALOG ============================== */

// GET /api/library/titles?q=&category=&readingLevel=&summerList=1
// Any signed-in user (student/teacher/staff) can search/browse — availability
// is shown, but not who currently holds a given copy (PRD 4.2).
router.get("/titles", authenticate, async (req, res) => {
  const { q, category, readingLevel, summerList } = req.query;
  const clauses = [];
  const params = [];
  if (q) { clauses.push("(bt.title ILIKE ? OR bt.authors ILIKE ? OR bt.isbn ILIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (category) { clauses.push("bt.category = ?"); params.push(category); }
  if (readingLevel) { clauses.push("bt.reading_level = ?"); params.push(readingLevel); }
  if (summerList === "1" || summerList === "true") clauses.push("bt.summer_list = true");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db.all(
    `SELECT bt.*,
        COUNT(bc.id) AS total_copies,
        COUNT(bc.id) FILTER (WHERE bc.status = 'available') AS available_copies
     FROM book_titles bt
     LEFT JOIN book_copies bc ON bc.title_id = bt.id
     ${where}
     GROUP BY bt.id
     ORDER BY bt.title ASC`,
    params
  );
  res.json(rows.map((r) => ({
    ...rowToCamel(r, BOOK_TITLE_FIELDS),
    totalCopies: Number(r.total_copies), availableCopies: Number(r.available_copies),
  })));
});

// GET /api/library/titles/:id — detail + its copies (availability only, no borrower identity).
router.get("/titles/:id", authenticate, async (req, res) => {
  const title = await db.get("SELECT * FROM book_titles WHERE id = ?", [req.params.id]);
  if (!title) return res.status(404).json({ error: "Title not found." });
  const copies = await db.all("SELECT id, accession_no, shelf_location, condition, status FROM book_copies WHERE title_id = ? ORDER BY accession_no", [req.params.id]);
  res.json({
    ...rowToCamel(title, BOOK_TITLE_FIELDS),
    copies: copies.map((c) => rowToCamel(c, BOOK_COPY_FIELDS)),
  });
});

router.post("/titles", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  if (!req.body.title || !req.body.title.trim()) return res.status(400).json({ error: "Title is required." });
  const body = { ...req.body, id: req.body.id || uid("bt"), createdAt: new Date().toISOString() };
  const { columns, placeholders, values } = camelToSnakeParams(body, BOOK_TITLE_FIELDS);
  await db.run(`INSERT INTO book_titles (${columns.join(",")}) VALUES (${placeholders.join(",")})`, values);
  const row = await db.get("SELECT * FROM book_titles WHERE id = ?", [body.id]);
  res.status(201).json(rowToCamel(row, BOOK_TITLE_FIELDS));
});

router.patch("/titles/:id", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const existing = await db.get("SELECT id FROM book_titles WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Title not found." });
  const { sets, values } = camelToSnakeSet(req.body, BOOK_TITLE_FIELDS);
  if (sets.length) await db.run(`UPDATE book_titles SET ${sets.join(", ")} WHERE id = ?`, [...values, req.params.id]);
  const row = await db.get("SELECT * FROM book_titles WHERE id = ?", [req.params.id]);
  res.json(rowToCamel(row, BOOK_TITLE_FIELDS));
});

router.delete("/titles/:id", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const issued = await db.get("SELECT id FROM book_copies WHERE title_id = ? AND status = 'issued' LIMIT 1", [req.params.id]);
  if (issued) return res.status(409).json({ error: "This title still has a copy on loan — it must be returned before the title can be removed." });
  await db.run("DELETE FROM book_titles WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// POST /api/library/titles/:id/copies  { accessionNo, shelfLocation, condition }
router.post("/titles/:id/copies", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const title = await db.get("SELECT id FROM book_titles WHERE id = ?", [req.params.id]);
  if (!title) return res.status(404).json({ error: "Title not found." });
  const accessionNo = (req.body.accessionNo || "").trim();
  if (!accessionNo) return res.status(400).json({ error: "Accession number is required." });
  const dupe = await db.get("SELECT id FROM book_copies WHERE accession_no = ?", [accessionNo]);
  if (dupe) return res.status(409).json({ error: "A copy with this accession number already exists." });
  const id = uid("bc");
  await db.run(
    "INSERT INTO book_copies (id, title_id, accession_no, shelf_location, condition, status) VALUES (?, ?, ?, ?, ?, 'available')",
    [id, req.params.id, accessionNo, req.body.shelfLocation || "", req.body.condition || "Good"]
  );
  const row = await db.get("SELECT * FROM book_copies WHERE id = ?", [id]);
  res.status(201).json(rowToCamel(row, BOOK_COPY_FIELDS));
});

router.patch("/copies/:id", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const existing = await db.get("SELECT * FROM book_copies WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Copy not found." });
  if (existing.status === "issued") return res.status(409).json({ error: "This copy is currently on loan — return it before editing its condition/status." });
  if (req.body.status === "issued") return res.status(400).json({ error: "Copies can only be marked 'issued' by issuing a loan." });
  const { sets, values } = camelToSnakeSet(req.body, BOOK_COPY_FIELDS);
  if (sets.length) await db.run(`UPDATE book_copies SET ${sets.join(", ")} WHERE id = ?`, [...values, req.params.id]);
  const row = await db.get("SELECT * FROM book_copies WHERE id = ?", [req.params.id]);
  res.json(rowToCamel(row, BOOK_COPY_FIELDS));
});

router.delete("/copies/:id", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const existing = await db.get("SELECT status FROM book_copies WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Copy not found." });
  if (existing.status === "issued") return res.status(409).json({ error: "This copy is currently on loan and can't be removed." });
  await db.run("DELETE FROM book_copies WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// POST /api/library/import  { rows: [...] } — upserts by accessionNo. A row
// with no accessionNo just creates/updates the title with no copy attached.
router.post("/import", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: "rows array required." });

  const recognizedColumns = new Set();
  const extraColumns = new Set();
  const errors = [];
  let created = 0, updated = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    try {
      const { mapped, extra } = mapRow(rows[i], BOOK_ALIAS_MAP);
      Object.keys(mapped).forEach((k) => recognizedColumns.add(k));
      Object.keys(extra).forEach((k) => extraColumns.add(k));
      if (!mapped.title) { errors.push(`Row ${rowNum}: no title column found — skipped.`); continue; }

      // Match an existing title by ISBN first (most reliable), else exact title+authors.
      let title = mapped.isbn ? await db.get("SELECT * FROM book_titles WHERE isbn = ?", [mapped.isbn]) : null;
      if (!title) title = await db.get("SELECT * FROM book_titles WHERE LOWER(title) = LOWER(?) AND LOWER(COALESCE(authors,'')) = LOWER(?)", [mapped.title, mapped.authors || ""]);

      if (title) {
        const patch = { ...mapped };
        delete patch.accessionNo; delete patch.shelfLocation; delete patch.condition;
        const { sets, values } = camelToSnakeSet(patch, BOOK_TITLE_FIELDS);
        if (sets.length) await db.run(`UPDATE book_titles SET ${sets.join(", ")} WHERE id = ?`, [...values, title.id]);
        updated++;
      } else {
        const id = uid("bt");
        const withDefaults = { ...mapped, id, createdAt: new Date().toISOString() };
        delete withDefaults.accessionNo; delete withDefaults.shelfLocation; delete withDefaults.condition;
        const { columns, values } = camelToSnakeParams(withDefaults, BOOK_TITLE_FIELDS);
        await db.run(`INSERT INTO book_titles (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`, values);
        title = { id };
        created++;
      }

      if (mapped.accessionNo) {
        const existingCopy = await db.get("SELECT id FROM book_copies WHERE accession_no = ?", [mapped.accessionNo]);
        if (existingCopy) {
          await db.run("UPDATE book_copies SET title_id = ?, shelf_location = COALESCE(?, shelf_location), condition = COALESCE(?, condition) WHERE id = ?",
            [title.id, mapped.shelfLocation || null, mapped.condition || null, existingCopy.id]);
        } else {
          await db.run("INSERT INTO book_copies (id, title_id, accession_no, shelf_location, condition, status) VALUES (?, ?, ?, ?, ?, 'available')",
            [uid("bc"), title.id, mapped.accessionNo, mapped.shelfLocation || "", mapped.condition || "Good"]);
        }
      }
    } catch (e) {
      errors.push(`Row ${rowNum}: ${e.message}`);
    }
  }

  res.json({ created, updated, errors, recognizedColumns: Array.from(recognizedColumns), extraColumns: Array.from(extraColumns) });
});

/* ============================== SETTINGS ============================== */

router.get("/settings", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const rows = await db.all("SELECT * FROM library_settings ORDER BY grade_band");
  res.json(rows.map(settingsToCamel));
});

// Policy configuration is Admin/Principal-only per the PRD (Librarian
// operates within the policy, but doesn't set it).
router.patch("/settings/:gradeBand", authenticate, authorizeRoles("super_admin", "admin"), async (req, res) => {
  const existing = await db.get("SELECT * FROM library_settings WHERE grade_band = ?", [req.params.gradeBand]);
  if (!existing) return res.status(404).json({ error: "Unknown grade band." });
  const { loanPeriodDays, maxSimultaneousLoans, consequenceType, dailyFineRate, fineCap, renewalLimit } = req.body;
  if (consequenceType && !["none", "hold", "fine"].includes(consequenceType)) return res.status(400).json({ error: "consequenceType must be 'none', 'hold' or 'fine'." });
  await db.run(
    `UPDATE library_settings SET
       loan_period_days = COALESCE(?, loan_period_days),
       max_simultaneous_loans = COALESCE(?, max_simultaneous_loans),
       consequence_type = COALESCE(?, consequence_type),
       daily_fine_rate = COALESCE(?, daily_fine_rate),
       fine_cap = COALESCE(?, fine_cap),
       renewal_limit = COALESCE(?, renewal_limit)
     WHERE grade_band = ?`,
    [loanPeriodDays, maxSimultaneousLoans, consequenceType, dailyFineRate, fineCap, renewalLimit, req.params.gradeBand]
  );
  const row = await db.get("SELECT * FROM library_settings WHERE grade_band = ?", [req.params.gradeBand]);
  res.json(settingsToCamel(row));
});

/* ============================== ISSUE / RETURN / RENEW ============================== */

const LOAN_JOIN_SELECT = `
  SELECT bl.*, bt.title, bt.authors, bc.accession_no,
    COALESCE(s.name, t.name) AS borrower_name,
    COALESCE(s.roll_no, t.employee_id) AS borrower_ref
  FROM book_loans bl
  JOIN book_copies bc ON bc.id = bl.copy_id
  JOIN book_titles bt ON bt.id = bc.title_id
  LEFT JOIN students s ON bl.borrower_type = 'student' AND s.id = bl.borrower_id
  LEFT JOIN teachers t ON bl.borrower_type = 'teacher' AND t.id = bl.borrower_id
`;

// POST /api/library/loans/issue  { accessionNo, borrowerType, borrowerId }
router.post("/loans/issue", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const { accessionNo, borrowerType, borrowerId } = req.body;
  if (!accessionNo || !borrowerId) return res.status(400).json({ error: "accessionNo and borrowerId are required." });
  if (!["student", "teacher"].includes(borrowerType)) return res.status(400).json({ error: "borrowerType must be 'student' or 'teacher'." });

  const borrower = await resolveBorrower(borrowerType, borrowerId);
  if (!borrower) return res.status(404).json({ error: "Borrower not found." });

  try {
    const loan = await db.transaction(async (tx) => {
      const copy = await tx.get("SELECT * FROM book_copies WHERE accession_no = ?", [accessionNo]);
      if (!copy) throw Object.assign(new Error("No copy found with that accession number."), { status: 404 });
      if (copy.status !== "available") throw Object.assign(new Error(`This copy is currently ${copy.status} and can't be issued.`), { status: 409 });

      const activeCount = (await tx.get(
        "SELECT COUNT(*) AS n FROM book_loans WHERE borrower_type = ? AND borrower_id = ? AND returned_at IS NULL",
        [borrowerType, borrowerId]
      )).n;
      if (Number(activeCount) >= borrower.policy.maxSimultaneousLoans) {
        throw Object.assign(new Error(`${borrower.name} is already at their borrowing limit (${borrower.policy.maxSimultaneousLoans}) for their grade band.`), { status: 400 });
      }

      if (borrower.policy.consequenceType === "hold") {
        const overdue = await tx.get(
          "SELECT id FROM book_loans WHERE borrower_type = ? AND borrower_id = ? AND returned_at IS NULL AND due_date < ? LIMIT 1",
          [borrowerType, borrowerId, todayStr()]
        );
        if (overdue) throw Object.assign(new Error(`${borrower.name} has an overdue book — new loans are on hold until it's returned.`), { status: 400 });
      }

      const id = uid("loan");
      const issuedAt = todayStr();
      const dueDate = addDays(issuedAt, borrower.policy.loanPeriodDays);
      await tx.run(
        `INSERT INTO book_loans (id, copy_id, borrower_type, borrower_id, grade_band, issued_at, due_date,
           consequence_type, daily_fine_rate, fine_cap, issued_by, counts_toward_program)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, copy.id, borrowerType, borrowerId, borrower.policy.gradeBand, issuedAt, dueDate,
          borrower.policy.consequenceType, borrower.policy.dailyFineRate, borrower.policy.fineCap,
          req.user.name, borrowerType === "student"]
      );
      await tx.run("UPDATE book_copies SET status = 'issued' WHERE id = ?", [copy.id]);
      return id;
    });
    const row = await db.get(`${LOAN_JOIN_SELECT} WHERE bl.id = ?`, [loan]);
    res.status(201).json(loanToCamel(row));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || "Could not issue this book." });
  }
});

// POST /api/library/loans/:id/return
router.post("/loans/:id/return", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const loan = await db.get("SELECT * FROM book_loans WHERE id = ?", [req.params.id]);
  if (!loan) return res.status(404).json({ error: "Loan not found." });
  if (loan.returned_at) return res.status(409).json({ error: "This loan was already returned." });

  const returnedAt = todayStr();
  const overdueDays = Math.max(0, daysBetween(loan.due_date, returnedAt));
  const fineAmount = loan.consequence_type === "fine" && overdueDays > 0
    ? Math.min(overdueDays * Number(loan.daily_fine_rate), Number(loan.fine_cap) || Infinity)
    : 0;

  await db.run(
    "UPDATE book_loans SET returned_at = ?, returned_by = ?, fine_amount = ?, fine_status = ? WHERE id = ?",
    [returnedAt, req.user.name, fineAmount, fineAmount > 0 ? "pending" : "none", req.params.id]
  );
  await db.run("UPDATE book_copies SET status = 'available' WHERE id = ?", [loan.copy_id]);

  const row = await db.get(`${LOAN_JOIN_SELECT} WHERE bl.id = ?`, [req.params.id]);
  res.json(loanToCamel(row));
});

// POST /api/library/loans/:id/renew — librarian/admin for anyone, or the
// borrower themselves (self-service, per the PRD's "renews online" flow).
router.post("/loans/:id/renew", authenticate, async (req, res) => {
  const loan = await db.get("SELECT * FROM book_loans WHERE id = ?", [req.params.id]);
  if (!loan) return res.status(404).json({ error: "Loan not found." });
  if (loan.returned_at) return res.status(409).json({ error: "This loan was already returned." });

  const isDeskStaff = STAFF_ROLES_FOR_DESK.includes(req.user.role);
  const isSelf = (req.user.role === "student" || req.user.role === "faculty" || req.user.role === "librarian")
    && loan.borrower_id === req.user.id;
  if (!isDeskStaff && !isSelf) return res.status(403).json({ error: "You can only renew your own loans." });

  const policy = loan.borrower_type === "teacher" ? TEACHER_POLICY : (settingsToCamel(await db.get("SELECT * FROM library_settings WHERE grade_band = ?", [loan.grade_band])) || FALLBACK_POLICY);
  if (loan.renewed_count >= policy.renewalLimit) return res.status(400).json({ error: `This loan has already reached its renewal limit (${policy.renewalLimit}).` });
  if (loan.due_date < todayStr()) return res.status(400).json({ error: "Overdue loans can't be renewed online — please return or renew at the desk." });

  const newDueDate = addDays(loan.due_date, policy.loanPeriodDays);
  await db.run("UPDATE book_loans SET due_date = ?, renewed_count = renewed_count + 1 WHERE id = ?", [newDueDate, req.params.id]);
  const row = await db.get(`${LOAN_JOIN_SELECT} WHERE bl.id = ?`, [req.params.id]);
  res.json(loanToCamel(row));
});

// PATCH /api/library/loans/:id/fine  { fineStatus: 'paid' | 'waived' }
router.patch("/loans/:id/fine", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const { fineStatus } = req.body;
  if (!["paid", "waived"].includes(fineStatus)) return res.status(400).json({ error: "fineStatus must be 'paid' or 'waived'." });
  const existing = await db.get("SELECT id FROM book_loans WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Loan not found." });
  await db.run("UPDATE book_loans SET fine_status = ? WHERE id = ?", [fineStatus, req.params.id]);
  const row = await db.get(`${LOAN_JOIN_SELECT} WHERE bl.id = ?`, [req.params.id]);
  res.json(loanToCamel(row));
});

// GET /api/library/loans?status=issued|overdue|returned&borrowerType=&borrowerId=
router.get("/loans", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const { status, borrowerType, borrowerId } = req.query;
  const clauses = [];
  const params = [];
  if (status === "issued") clauses.push("bl.returned_at IS NULL");
  else if (status === "overdue") { clauses.push("bl.returned_at IS NULL AND bl.due_date < ?"); params.push(todayStr()); }
  else if (status === "returned") clauses.push("bl.returned_at IS NOT NULL");
  if (borrowerType) { clauses.push("bl.borrower_type = ?"); params.push(borrowerType); }
  if (borrowerId) { clauses.push("bl.borrower_id = ?"); params.push(borrowerId); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db.all(`${LOAN_JOIN_SELECT} ${where} ORDER BY bl.issued_at DESC`, params);
  res.json(rows.map(loanToCamel));
});

// GET /api/library/loans/mine — the signed-in student/teacher/librarian's own loans.
router.get("/loans/mine", authenticate, async (req, res) => {
  const borrowerType = req.user.role === "student" ? "student" : "teacher";
  if (req.user.role !== "student" && !(await db.get("SELECT id FROM teachers WHERE id = ?", [req.user.id]))) return res.json([]);
  const rows = await db.all(`${LOAN_JOIN_SELECT} WHERE bl.borrower_type = ? AND bl.borrower_id = ? ORDER BY bl.issued_at DESC`, [borrowerType, req.user.id]);
  res.json(rows.map(loanToCamel));
});

/* ============================== READING PROGRAM ============================== */

const MILESTONES = [5, 10, 20, 50, 100];

// GET /api/library/reading/:studentId — completed-book count + milestones.
// Students can only see their own; staff can look up any.
router.get("/reading/:studentId", authenticate, async (req, res) => {
  if (req.user.role === "student" && req.user.id !== req.params.studentId) {
    return res.status(403).json({ error: "You can only view your own reading record." });
  }
  const row = await db.get(
    "SELECT COUNT(*) AS n FROM book_loans WHERE borrower_type = 'student' AND borrower_id = ? AND returned_at IS NOT NULL AND counts_toward_program = true",
    [req.params.studentId]
  );
  const count = Number(row.n);
  res.json({
    booksRead: count,
    milestonesReached: MILESTONES.filter((m) => count >= m),
    nextMilestone: MILESTONES.find((m) => count < m) || null,
  });
});

/* ============================== REPORTS ============================== */

router.get("/reports/overdue", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const rows = await db.all(`${LOAN_JOIN_SELECT} WHERE bl.returned_at IS NULL AND bl.due_date < ? ORDER BY bl.due_date ASC`, [todayStr()]);
  res.json(rows.map(loanToCamel));
});

router.get("/reports/issued", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const rows = await db.all(`${LOAN_JOIN_SELECT} WHERE bl.returned_at IS NULL ORDER BY bl.due_date ASC`);
  res.json(rows.map(loanToCamel));
});

// GET /api/library/reports/most-borrowed?order=desc|asc&limit=20
router.get("/reports/most-borrowed", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const order = req.query.order === "asc" ? "ASC" : "DESC";
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const rows = await db.all(
    `SELECT bt.id, bt.title, bt.authors, COUNT(bl.id) AS times_borrowed
     FROM book_titles bt
     LEFT JOIN book_copies bc ON bc.title_id = bt.id
     LEFT JOIN book_loans bl ON bl.copy_id = bc.id
     GROUP BY bt.id
     ORDER BY times_borrowed ${order}
     LIMIT ?`,
    [limit]
  );
  res.json(rows.map((r) => ({ id: r.id, title: r.title, authors: r.authors, timesBorrowed: Number(r.times_borrowed) })));
});

// GET /api/library/reports/reading-program — participation per grade band.
router.get("/reports/reading-program", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const rows = await db.all(
    `SELECT COALESCE(bl.grade_band, 'Unknown') AS grade_band,
        COUNT(DISTINCT bl.borrower_id) AS participating_students,
        COUNT(*) AS books_completed
     FROM book_loans bl
     WHERE bl.borrower_type = 'student' AND bl.returned_at IS NOT NULL AND bl.counts_toward_program = true
     GROUP BY bl.grade_band
     ORDER BY bl.grade_band`
  );
  res.json(rows.map((r) => ({ gradeBand: r.grade_band, participatingStudents: Number(r.participating_students), booksCompleted: Number(r.books_completed) })));
});

router.get("/reports/catalog", authenticate, authorizeRoles(...STAFF_ROLES_FOR_DESK), async (req, res) => {
  const rows = await db.all(
    `SELECT bt.title, bt.authors, bt.publisher, bt.isbn, bt.category, bt.reading_level, bt.price,
        bc.accession_no, bc.shelf_location, bc.condition, bc.status
     FROM book_titles bt
     LEFT JOIN book_copies bc ON bc.title_id = bt.id
     ORDER BY bt.title, bc.accession_no`
  );
  res.json(rows);
});

module.exports = router;
