// db.js — PostgreSQL connection pool + schema + a small compatibility layer.
//
// This used to run on Node's built-in SQLite (node:sqlite). That's fine for
// small/local usage, but SQLite only allows one writer at a time — under
// real concurrent load (e.g. hundreds of students hitting the server when
// results are declared) that becomes the bottleneck. PostgreSQL handles
// genuine concurrent reads AND writes properly, via a connection pool.
//
// The db.get/db.all/db.run helpers below exist so the rest of the codebase
// (which was written against SQLite's `?` placeholder style) didn't need a
// full query-by-query rewrite — placeholders are auto-converted to
// PostgreSQL's `$1, $2, ...` style. Every call is async now (a real
// network-backed database can't be synchronous), so every route that
// touches the database must `await` these calls.

const { Pool, types } = require("pg");
const bcrypt = require("bcryptjs");

// By default node-postgres returns NUMERIC columns as strings (to avoid
// silent precision loss on very large numbers) and BIGINT/COUNT(*) results
// as strings too. This app's fee/amount math (and the frontend's
// .toLocaleString() calls) all assume plain JS numbers, matching how
// node:sqlite behaved before — so we opt back into that here.
types.setTypeParser(types.builtins.NUMERIC, (val) => (val === null ? null : parseFloat(val)));
types.setTypeParser(types.builtins.INT8, (val) => (val === null ? null : parseInt(val, 10)));

const connectionString = process.env.DATABASE_URL ||
  `postgresql://${process.env.PGUSER || "postgres"}:${process.env.PGPASSWORD || "postgres"}@${process.env.PGHOST || "localhost"}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || "school_erp"}`;

// Hosted Postgres (Render, Heroku, Neon, Supabase, Railway, ...) requires
// SSL, using certs that aren't in Node's default trusted CA list — without
// this, connecting fails with a self-signed-certificate error. A local
// Postgres install has no SSL configured at all, so this is off by default
// and only turned on when DATABASE_URL is set (the standard signal that
// you're pointed at a hosted provider) or when explicitly requested.
const useSSL = process.env.DB_SSL === "true" || (!!process.env.DATABASE_URL && process.env.DB_SSL !== "false");

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 20,                      // up to 20 concurrent connections in the pool — tune based on your Postgres server's own max_connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  // A background/idle client hit an error (e.g. connection dropped) — log it,
  // don't crash the whole server over one bad pooled connection.
  console.error("Unexpected error on idle Postgres client:", err);
});

/** Converts SQLite-style `?` placeholders to Postgres-style `$1, $2, ...` in order. */
function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

const db = {
  pool,
  /** Returns the first row, or null. */
  async get(sql, params = []) {
    const res = await pool.query(toPgPlaceholders(sql), params);
    return res.rows[0] || null;
  },
  /** Returns all matching rows as an array. */
  async all(sql, params = []) {
    const res = await pool.query(toPgPlaceholders(sql), params);
    return res.rows;
  },
  /** For INSERT/UPDATE/DELETE. Returns { changes, rows } — `rows` is populated if your query has a RETURNING clause. */
  async run(sql, params = []) {
    const res = await pool.query(toPgPlaceholders(sql), params);
    return { changes: res.rowCount, rows: res.rows };
  },
  /** Raw escape hatch for anything the helpers above don't cover. */
  async query(sql, params = []) {
    return pool.query(toPgPlaceholders(sql), params);
  },
  /**
   * Runs `fn` inside a single BEGIN/COMMIT transaction on one dedicated
   * connection, rolling back on any error. `fn` receives a scoped { get, all, run }
   * bound to that same connection/transaction.
   *
   * Use this for any read-modify-write sequence where a real race is
   * possible under concurrent load — e.g. reading a fee balance and then
   * updating it. Without this, two simultaneous requests could both read
   * the same starting value and one update would silently overwrite the
   * other's.
   */
  async transaction(fn) {
    const client = await pool.connect();
    const scoped = {
      async get(sql, params = []) {
        const res = await client.query(toPgPlaceholders(sql), params);
        return res.rows[0] || null;
      },
      async all(sql, params = []) {
        const res = await client.query(toPgPlaceholders(sql), params);
        return res.rows;
      },
      async run(sql, params = []) {
        const res = await client.query(toPgPlaceholders(sql), params);
        return { changes: res.rowCount, rows: res.rows };
      },
    };
    try {
      await client.query("BEGIN");
      const result = await fn(scoped);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },
};

/* ============================== SCHEMA ============================== */
// One table per entity, as requested — not a single JSON blob.

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS admins (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin',
  status        TEXT NOT NULL DEFAULT 'active',
  permissions   TEXT
);

CREATE TABLE IF NOT EXISTS courses (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  code           TEXT NOT NULL,
  duration       TEXT,
  seats          INTEGER DEFAULT 0,
  fee            NUMERIC DEFAULT 0,
  admission_fee  NUMERIC DEFAULT 0,
  course_group   TEXT DEFAULT 'Graduation'
);

CREATE TABLE IF NOT EXISTS teachers (
  id            TEXT PRIMARY KEY,
  employee_id   TEXT UNIQUE,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone         TEXT,
  gender        TEXT,
  dob           TEXT,
  qualification TEXT,
  experience    TEXT,
  address       TEXT,
  joining_date  TEXT,
  subject       TEXT,
  department    TEXT,
  designation   TEXT,
  role          TEXT NOT NULL DEFAULT 'faculty',
  status        TEXT NOT NULL DEFAULT 'active',
  photo_data    TEXT,
  photo_name    TEXT
);

CREATE TABLE IF NOT EXISTS students (
  id                    TEXT PRIMARY KEY,
  first_name TEXT, first_name_hi TEXT,
  middle_name TEXT, middle_name_hi TEXT,
  last_name TEXT, last_name_hi TEXT,
  name                  TEXT,
  gender                TEXT,
  email                 TEXT UNIQUE NOT NULL,
  password_hash         TEXT NOT NULL,
  phone                 TEXT,
  emergency_mobile      TEXT,
  whatsapp              TEXT,
  aadhar                TEXT,
  how_know              TEXT,

  dob                   TEXT,
  marital_status        TEXT,
  spouse_name           TEXT,
  spouse_phone          TEXT,
  caste                 TEXT,
  category              TEXT,
  photo_data            TEXT,
  photo_name            TEXT,
  signature_data        TEXT,
  signature_name        TEXT,

  permanent_address     TEXT,
  contact_no            TEXT,
  mobile_no             TEXT,
  country               TEXT,
  state                 TEXT,
  city                  TEXT,
  pin_code              TEXT,
  state_domicile        TEXT,
  address_type          TEXT,
  current_address       TEXT,
  current_city          TEXT,
  current_state         TEXT,
  current_pin_code      TEXT,

  father_first_middle TEXT, father_first_middle_hi TEXT,
  father_last_name TEXT, father_last_name_hi TEXT,
  father_phone TEXT, father_email TEXT, father_occupation TEXT, father_org TEXT, father_post TEXT,
  mother_first_middle TEXT, mother_first_middle_hi TEXT,
  mother_last_name TEXT, mother_last_name_hi TEXT,
  mother_phone TEXT, mother_email TEXT, mother_occupation TEXT, mother_org TEXT, mother_post TEXT,
  guardian_name TEXT, guardian_relation TEXT, guardian_phone_resi TEXT, guardian_mobile TEXT,

  last_institution      TEXT,
  last_exam_year        TEXT,
  last_exam_percentage  TEXT,
  result_status         TEXT,
  gap_in_study          TEXT,
  lateral_entry         TEXT,

  course_group          TEXT,
  course_id             TEXT REFERENCES courses(id),
  amount                NUMERIC,
  medium                TEXT,
  remarks               TEXT,

  status                TEXT NOT NULL DEFAULT 'draft',
  roll_no               TEXT,
  reject_reason         TEXT,
  saved_up_to           INTEGER DEFAULT 0,
  created_at            TEXT,
  applied_at            TEXT,
  extra_fields          TEXT
);

CREATE TABLE IF NOT EXISTS notices (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  content           TEXT NOT NULL,
  date              TEXT NOT NULL,
  posted_by_name    TEXT,
  posted_by_role    TEXT
);

CREATE TABLE IF NOT EXISTS attendance (
  id          SERIAL PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  subject     TEXT,
  status      TEXT NOT NULL,
  UNIQUE(student_id, date, subject)
);

CREATE TABLE IF NOT EXISTS grades (
  id          TEXT PRIMARY KEY,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  exam_type   TEXT,
  semester    INTEGER,
  marks       NUMERIC,
  max_marks   NUMERIC
);

CREATE TABLE IF NOT EXISTS fees (
  student_id          TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  total_fee           NUMERIC DEFAULT 0,
  paid                NUMERIC DEFAULT 0,
  due_date            TEXT,
  plan_total_amount   NUMERIC,
  plan_tenure_months  INTEGER,
  plan_installment    NUMERIC,
  plan_emis_paid      INTEGER,
  extra_fields        TEXT,
  last_reminder_at    TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id                 TEXT PRIMARY KEY,
  student_id         TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_amount         NUMERIC,
  additional_fees    TEXT,
  total_amount       NUMERIC NOT NULL,
  payment_type       TEXT,
  payment_mode       TEXT,
  plan_total_amount  NUMERIC,
  tenure_months      INTEGER,
  installment_amount NUMERIC,
  date               TEXT NOT NULL,
  recorded_by_name   TEXT,
  recorded_by_role   TEXT,
  gateway            TEXT,
  gateway_payment_id TEXT,
  gateway_order_id   TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  to_student_id   TEXT REFERENCES students(id) ON DELETE CASCADE,
  from_name       TEXT,
  from_role       TEXT,
  text            TEXT NOT NULL,
  date            TEXT NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id              TEXT PRIMARY KEY,
  student_id      TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',
  student_unread  BOOLEAN NOT NULL DEFAULT false,
  admin_unread    BOOLEAN NOT NULL DEFAULT true,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS support_replies (
  id               TEXT PRIMARY KEY,
  ticket_id        TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  from_role        TEXT NOT NULL,
  from_name        TEXT,
  text             TEXT NOT NULL,
  date             TEXT NOT NULL,
  attachment_name  TEXT,
  attachment_path  TEXT,
  attachment_size  INTEGER,
  attachment_mime  TEXT
);

CREATE TABLE IF NOT EXISTS emails (
  id       TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject  TEXT,
  body     TEXT,
  date     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS academic_details (
  id            TEXT PRIMARY KEY,
  student_id    TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sno           INTEGER,
  name          TEXT,
  board         TEXT,
  passing_year  TEXT,
  grade         TEXT,
  subject       TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id                  TEXT PRIMARY KEY,
  student_id          TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sno                 INTEGER,
  document_type       TEXT,
  original_photocopy  TEXT,
  document_no         TEXT,
  file_name           TEXT,
  file_path           TEXT,
  file_size           INTEGER,
  mime_type           TEXT,
  uploaded_at         TEXT
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id              TEXT PRIMARY KEY,
  teacher_id      TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  leave_type      TEXT,
  start_date      TEXT NOT NULL,
  end_date        TEXT NOT NULL,
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  applied_at      TEXT NOT NULL,
  decided_by      TEXT,
  decided_at      TEXT,
  decision_note   TEXT
);

-- Library Management (see gps-library-management-prd.md).
-- "book_titles" is the catalog entry (one per book); "book_copies" is each
-- physical, individually issuable unit of a title (a title with 3 copies has
-- 3 rows here) — matching the PRD's explicit Title-vs-Copy distinction.
CREATE TABLE IF NOT EXISTS book_titles (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  authors        TEXT,
  publisher      TEXT,
  isbn           TEXT,
  category       TEXT NOT NULL DEFAULT 'Fiction',
  reading_level  TEXT,
  price          NUMERIC DEFAULT 0,
  cover_data     TEXT,
  cover_name     TEXT,
  summer_list    BOOLEAN NOT NULL DEFAULT false,
  created_at     TEXT
);

CREATE TABLE IF NOT EXISTS book_copies (
  id             TEXT PRIMARY KEY,
  title_id       TEXT NOT NULL REFERENCES book_titles(id) ON DELETE CASCADE,
  accession_no   TEXT UNIQUE NOT NULL,
  shelf_location TEXT,
  condition      TEXT NOT NULL DEFAULT 'Good',
  status         TEXT NOT NULL DEFAULT 'available'
);

-- No separate "reading_log" table (unlike the PRD's data-model sketch) —
-- a returned loan with counts_toward_program=true already IS the reading
-- record (borrower, what, when), so a second table would just duplicate
-- book_loans with an extra join. Reading counts/milestones are computed
-- on the fly from this table instead (see routes/library.js).
--
-- borrower_type/borrower_id (not a student_id FK) because the PRD requires
-- teachers to be able to borrow too (4.1/6), and this app keeps students and
-- teachers in two separate tables with no shared "person" id — a polymorphic
-- reference is the pragmatic v1 fit rather than a much larger refactor to
-- unify them. Application code (routes/library.js) validates borrower_id
-- against the right table for the given borrower_type.
CREATE TABLE IF NOT EXISTS book_loans (
  id                     TEXT PRIMARY KEY,
  copy_id                TEXT NOT NULL REFERENCES book_copies(id) ON DELETE CASCADE,
  borrower_type          TEXT NOT NULL DEFAULT 'student',
  borrower_id            TEXT NOT NULL,
  grade_band             TEXT,
  issued_at              TEXT NOT NULL,
  due_date               TEXT NOT NULL,
  returned_at            TEXT,
  renewed_count          INTEGER NOT NULL DEFAULT 0,
  -- consequence_type/daily_fine_rate/fine_cap are snapshotted from
  -- library_settings at issue time (not re-read live at return time) so a
  -- policy edit later doesn't retroactively change a fine already accruing
  -- on a loan issued under the old policy.
  consequence_type       TEXT NOT NULL DEFAULT 'none',
  daily_fine_rate        NUMERIC NOT NULL DEFAULT 0,
  fine_cap               NUMERIC NOT NULL DEFAULT 0,
  fine_amount            NUMERIC NOT NULL DEFAULT 0,
  fine_status            TEXT NOT NULL DEFAULT 'none',
  issued_by              TEXT,
  returned_by            TEXT,
  counts_toward_program  BOOLEAN NOT NULL DEFAULT true,
  last_reminder_at       TEXT
);

-- One row per grade band (reuses the same Pre-Primary/Primary/Middle/
-- Secondary/Senior Secondary bands already used for classes/courses —
-- see the PRD's "configurable per grade band, not just school-wide").
CREATE TABLE IF NOT EXISTS library_settings (
  grade_band              TEXT PRIMARY KEY,
  loan_period_days        INTEGER NOT NULL DEFAULT 14,
  max_simultaneous_loans  INTEGER NOT NULL DEFAULT 3,
  consequence_type        TEXT NOT NULL DEFAULT 'hold',
  daily_fine_rate         NUMERIC NOT NULL DEFAULT 0,
  fine_cap                NUMERIC NOT NULL DEFAULT 0,
  renewal_limit           INTEGER NOT NULL DEFAULT 2
);

-- Parent portal: a parent account is created by Admin (not self-service,
-- same as teachers) and linked to one or more existing students via
-- parent_students, since siblings should share one login.
CREATE TABLE IF NOT EXISTS parents (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone         TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT
);

CREATE TABLE IF NOT EXISTS parent_students (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relation    TEXT,
  UNIQUE(parent_id, student_id)
);
`;

/* ============================== INDEXES ============================== */

const INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
  CREATE INDEX IF NOT EXISTS idx_students_course ON students(course_id);
  CREATE INDEX IF NOT EXISTS idx_students_roll_no ON students(roll_no);
  CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
  CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_student ON transactions(student_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_messages_student ON messages(to_student_id);
  CREATE INDEX IF NOT EXISTS idx_support_tickets_student ON support_tickets(student_id);
  CREATE INDEX IF NOT EXISTS idx_support_replies_ticket ON support_replies(ticket_id);
  CREATE INDEX IF NOT EXISTS idx_emails_to ON emails(to_email);
  CREATE INDEX IF NOT EXISTS idx_academic_student ON academic_details(student_id);
  CREATE INDEX IF NOT EXISTS idx_documents_student ON documents(student_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_students_roll_no_unique ON students(roll_no) WHERE roll_no IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_leave_requests_teacher ON leave_requests(teacher_id);
  CREATE INDEX IF NOT EXISTS idx_book_copies_title ON book_copies(title_id);
  CREATE INDEX IF NOT EXISTS idx_book_copies_status ON book_copies(status);
  CREATE INDEX IF NOT EXISTS idx_book_titles_reading_level ON book_titles(reading_level);
  CREATE INDEX IF NOT EXISTS idx_book_loans_copy ON book_loans(copy_id);
  CREATE INDEX IF NOT EXISTS idx_book_loans_borrower ON book_loans(borrower_type, borrower_id);
  CREATE INDEX IF NOT EXISTS idx_book_loans_returned ON book_loans(returned_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_book_loans_one_active_per_copy ON book_loans(copy_id) WHERE returned_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_parent_students_parent ON parent_students(parent_id);
  CREATE INDEX IF NOT EXISTS idx_parent_students_student ON parent_students(student_id);
`;

/* ============================== INIT (schema + migrations + seed) ============================== */
// Runs once at startup. Exported as a promise — server.js awaits it before
// accepting requests, so there's no race between "server is up" and
// "schema/seed data actually exists yet".

async function ensureColumn(table, column, ddl) {
  const exists = await db.get(
    `SELECT column_name FROM information_schema.columns WHERE table_name = ? AND column_name = ?`,
    [table, column]
  );
  if (!exists) {
    await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    console.log(`Migrated: added ${table}.${column}`);
  }
}

async function init() {
  await pool.query(SCHEMA_SQL);
  await ensureColumn("students", "extra_fields", "TEXT");
  await ensureColumn("fees", "extra_fields", "TEXT");
  await ensureColumn("transactions", "gateway", "TEXT");
  await ensureColumn("transactions", "gateway_payment_id", "TEXT");
  await ensureColumn("transactions", "gateway_order_id", "TEXT");
  await ensureColumn("transactions", "purpose", "TEXT NOT NULL DEFAULT 'course'");
  await ensureColumn("fees", "last_reminder_at", "TEXT");
  await ensureColumn("fees", "admission_fee_paid", "NUMERIC DEFAULT 0");
  await ensureColumn("documents", "file_data", "BYTEA");
  await ensureColumn("messages", "is_read", "BOOLEAN NOT NULL DEFAULT false");
  await ensureColumn("support_tickets", "student_unread", "BOOLEAN NOT NULL DEFAULT false");
  await ensureColumn("support_tickets", "admin_unread", "BOOLEAN NOT NULL DEFAULT true");
  await ensureColumn("support_replies", "attachment_name", "TEXT");
  await ensureColumn("support_replies", "attachment_path", "TEXT");
  await ensureColumn("support_replies", "attachment_size", "INTEGER");
  await ensureColumn("support_replies", "attachment_mime", "TEXT");
  await ensureColumn("teachers", "employee_id", "TEXT");
  await ensureColumn("teachers", "gender", "TEXT");
  await ensureColumn("teachers", "dob", "TEXT");
  await ensureColumn("teachers", "qualification", "TEXT");
  await ensureColumn("teachers", "experience", "TEXT");
  await ensureColumn("teachers", "address", "TEXT");
  await ensureColumn("teachers", "joining_date", "TEXT");
  await ensureColumn("teachers", "designation", "TEXT");
  await ensureColumn("teachers", "role", "TEXT NOT NULL DEFAULT 'faculty'");
  await ensureColumn("teachers", "status", "TEXT NOT NULL DEFAULT 'active'");
  await ensureColumn("teachers", "photo_data", "TEXT");
  await ensureColumn("teachers", "photo_name", "TEXT");
  await ensureColumn("admins", "role", "TEXT NOT NULL DEFAULT 'admin'");
  await ensureColumn("admins", "status", "TEXT NOT NULL DEFAULT 'active'");
  await ensureColumn("admins", "permissions", "TEXT");

  // The very first admin account (seeded pre-migration, username 'admin')
  // predates the role column and got backfilled to 'admin' by the ALTER
  // TABLE default above — promote it back to the unrestricted top of the
  // hierarchy it was always meant to be. Idempotent: once promoted, this
  // WHERE no longer matches it on later startups.
  await db.run("UPDATE admins SET role = 'super_admin' WHERE username = 'admin' AND role = 'admin'");

  // Backfill employee IDs for any teachers created before this field existed.
  const missingEmpId = await db.all("SELECT id FROM teachers WHERE employee_id IS NULL ORDER BY id");
  for (let i = 0; i < missingEmpId.length; i++) {
    const empId = `EMP-${new Date().getFullYear()}-${String(i + 1).padStart(3, "0")}`;
    await db.run("UPDATE teachers SET employee_id = ? WHERE id = ?", [empId, missingEmpId[i].id]);
  }
  await pool.query(INDEX_SQL);

  // One-time cleanup for any rows written before status normalization existed.
  const VALID_STATUSES = ["draft", "pending", "approved", "rejected"];
  const badStatusRows = await db.all(
    `SELECT id, status FROM students WHERE status NOT IN (?, ?, ?, ?)`,
    VALID_STATUSES
  );
  if (badStatusRows.length > 0) {
    let fixed = 0;
    for (const row of badStatusRows) {
      const normalized = String(row.status || "").trim().toLowerCase();
      if (VALID_STATUSES.includes(normalized)) {
        await db.run(`UPDATE students SET status = ? WHERE id = ?`, [normalized, row.id]);
        fixed++;
      }
    }
    if (fixed) console.log(`Migrated: normalized status casing on ${fixed} student record(s).`);
  }

  const courseCount = (await db.get("SELECT COUNT(*) AS n FROM courses")).n;
  if (Number(courseCount) === 0) {
    // "Courses" here means the school's grade levels (Nursery through Class
    // 12) — the table/column names stayed as courses/course_group since the
    // shape (name, code, seats, fee, admission fee, a grouping level) fits
    // a class just as well as a college programme, and every route/join
    // built on it keeps working unchanged.
    const defaults = [
      ["c-pg", "Play Group", "PG", "1 Year", 35, 22000, 4000, "Pre-Primary"],
      ["c-nur", "Nursery", "NUR", "1 Year", 40, 25000, 5000, "Pre-Primary"],
      ["c-lkg", "LKG", "LKG", "1 Year", 40, 26000, 5000, "Pre-Primary"],
      ["c-ukg", "UKG", "UKG", "1 Year", 40, 27000, 5000, "Pre-Primary"],
      ["c-c1", "Class 1", "I", "1 Year", 45, 30000, 6000, "Primary"],
      ["c-c2", "Class 2", "II", "1 Year", 45, 30000, 6000, "Primary"],
      ["c-c3", "Class 3", "III", "1 Year", 45, 31000, 6000, "Primary"],
      ["c-c4", "Class 4", "IV", "1 Year", 45, 31000, 6000, "Primary"],
      ["c-c5", "Class 5", "V", "1 Year", 45, 32000, 6000, "Primary"],
      ["c-c6", "Class 6", "VI", "1 Year", 50, 34000, 7000, "Middle"],
      ["c-c7", "Class 7", "VII", "1 Year", 50, 34000, 7000, "Middle"],
      ["c-c8", "Class 8", "VIII", "1 Year", 50, 35000, 7000, "Middle"],
      ["c-c9", "Class 9", "IX", "1 Year", 50, 38000, 8000, "Secondary"],
      ["c-c10", "Class 10", "X", "1 Year", 50, 38000, 8000, "Secondary"],
      ["c-c11", "Class 11", "XI", "1 Year", 40, 42000, 9000, "Senior Secondary"],
      ["c-c12", "Class 12", "XII", "1 Year", 40, 42000, 9000, "Senior Secondary"],
    ];
    for (const row of defaults) {
      await db.run(
        `INSERT INTO courses (id, name, code, duration, seats, fee, admission_fee, course_group) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        row
      );
    }
    console.log("Seeded default classes (Nursery through Class 12).");
  }

  const librarySettingsCount = (await db.get("SELECT COUNT(*) AS n FROM library_settings")).n;
  if (Number(librarySettingsCount) === 0) {
    // Defaults follow the PRD's guidance directly: younger grades get short,
    // simple loans with no monetary consequence (a hold once overdue, at
    // most); fines only kick in for the oldest band, and only from a modest
    // daily rate with a cap. All of this is editable per band afterward
    // from Library → Settings — these are starting points, not a mandate.
    const defaults = [
      // [grade_band, loan_period_days, max_simultaneous_loans, consequence_type, daily_fine_rate, fine_cap, renewal_limit]
      ["Pre-Primary", 7, 1, "none", 0, 0, 1],
      ["Primary", 14, 2, "hold", 0, 0, 2],
      ["Middle", 14, 3, "hold", 0, 0, 2],
      ["Secondary", 14, 3, "hold", 0, 0, 2],
      ["Senior Secondary", 21, 4, "fine", 2, 100, 3],
    ];
    for (const row of defaults) {
      await db.run(
        `INSERT INTO library_settings (grade_band, loan_period_days, max_simultaneous_loans, consequence_type, daily_fine_rate, fine_cap, renewal_limit) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        row
      );
    }
    console.log("Seeded default library policy per grade band.");
  }

  const adminCount = (await db.get("SELECT COUNT(*) AS n FROM admins")).n;
  if (Number(adminCount) === 0) {
    const hash = await bcrypt.hash("admin123", 10);
    await db.run(
      `INSERT INTO admins (id, username, password_hash, name, role, status) VALUES (?, ?, ?, ?, 'super_admin', 'active')`,
      ["admin-1", "admin", hash, "Administrator"]
    );
    console.log("Seeded default administrator account (username: admin / password: admin123 — change this after first login).");
  }
}

module.exports = db;
module.exports.init = init;
