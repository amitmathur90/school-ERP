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
  `postgresql://${process.env.PGUSER || "postgres"}:${process.env.PGPASSWORD || "postgres"}@${process.env.PGHOST || "localhost"}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || "law_college_erp"}`;

const pool = new Pool({
  connectionString,
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
  name          TEXT NOT NULL
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
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  subject       TEXT,
  department    TEXT,
  phone         TEXT
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
  extra_fields        TEXT
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
  date            TEXT NOT NULL
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
  CREATE INDEX IF NOT EXISTS idx_emails_to ON emails(to_email);
  CREATE INDEX IF NOT EXISTS idx_academic_student ON academic_details(student_id);
  CREATE INDEX IF NOT EXISTS idx_documents_student ON documents(student_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_students_roll_no_unique ON students(roll_no) WHERE roll_no IS NOT NULL;
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
    const defaults = [
      ["c-ballb", "BACHELOR OF ARTS AND LAW", "BALLB", "5 Years", 120, 85000, 100, "Graduation"],
      ["c-bballb", "BBA LLB (Integrated)", "BBALLB", "5 Years", 60, 90000, 100, "Graduation"],
      ["c-llb", "BACHELOR OF LAW", "LLB", "3 Years", 100, 60000, 100, "Graduation"],
      ["c-llm", "LLM", "LLM", "1 Year", 40, 50000, 150, "Post Graduation"],
      ["c-dcl", "Diploma in Cyber Law", "DCL", "6 Months", 30, 15000, 50, "Diploma"],
    ];
    for (const row of defaults) {
      await db.run(
        `INSERT INTO courses (id, name, code, duration, seats, fee, admission_fee, course_group) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        row
      );
    }
    console.log("Seeded default courses.");
  }

  const adminCount = (await db.get("SELECT COUNT(*) AS n FROM admins")).n;
  if (Number(adminCount) === 0) {
    const hash = await bcrypt.hash("admin123", 10);
    await db.run(
      `INSERT INTO admins (id, username, password_hash, name) VALUES (?, ?, ?, ?)`,
      ["admin-1", "admin", hash, "Administrator"]
    );
    console.log("Seeded default administrator account (username: admin / password: admin123 — change this after first login).");
  }
}

module.exports = db;
module.exports.init = init;
