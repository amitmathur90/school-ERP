# School ERP — Full Stack Setup (Backend + PostgreSQL + Frontend)

This package has two parts that both need to run at the same time:

1. **`/server`** — a Node.js/Express backend backed by **PostgreSQL**. This
   is what makes data visible on any device — the database lives on ONE
   server, and every laptop/phone that talks to that server sees the same
   data, with real concurrent read/write support.
2. **`school-erp.jsx`** — your React frontend, calling this backend
   over HTTP.

> **Migrated from SQLite.** An earlier version of this project used Node's
> built-in SQLite (`node:sqlite`), which is great for getting started but
> only allows one writer at a time. This version moves to PostgreSQL
> specifically so the app holds up under real concurrent load — e.g. many
> students checking results or paying fees around the same time.

---

## 1. Requirements

- **Node.js v18 or newer** (no longer needs v22.5+ specifically — that was
  only required for the old SQLite version's `node:sqlite`).
- **PostgreSQL 13+**, either installed locally or a free-tier hosted
  instance (see options below — hosted is often the easier path if you
  don't want to install database software on your own machine).

---

## 2. Set up PostgreSQL

Pick ONE of these:

### Option A — Install PostgreSQL locally (Windows)
1. Download and run the installer from https://www.postgresql.org/download/windows/
2. During setup, set a password for the `postgres` user and remember it.
3. Leave the port as the default `5432`.
4. Once installed, open **pgAdmin** (installed alongside) or a terminal and
   create a database:
   ```sql
   CREATE DATABASE school_erp;
   ```

### Option B — Free hosted PostgreSQL (no local install — often simplest)
Any of these give you a free Postgres database and a ready-to-use
connection string in about a minute:
- [Neon](https://neon.tech)
- [Supabase](https://supabase.com)
- [Railway](https://railway.app)

Copy the connection string they give you (looks like
`postgresql://user:password@host/dbname`) — you'll paste it into `.env` as
`DATABASE_URL` in the next step.

### Option C — Docker (if you already use it)
```bash
docker run --name erp-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=school_erp -p 5432:5432 -d postgres:16
```

---

## 3. Set up and run the backend

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env`:
- If you used **Option A or C** above, fill in `PGUSER`/`PGPASSWORD`/`PGHOST`/`PGDATABASE`.
- If you used **Option B** (hosted), just set `DATABASE_URL` to the connection string they gave you and leave the rest.

Then:
```bash
npm start
```

You should see:
```
Seeded default courses.
Seeded default administrator account (username: admin / password: admin123 — change this after first login).

  School ERP API running at http://localhost:4000
  Database: PostgreSQL (...)
```

The server creates every table, index, and the default admin/course data
automatically on first run — nothing to run by hand.

**If it fails to start** with a connection error, double-check your `.env`
values match what your Postgres install/host actually expects, and that
the Postgres server itself is running.

**Leave this terminal running.** The frontend needs it to stay up.

---

## 4. Connect the frontend

Copy `school-erp.jsx` into your existing project's `src/` folder
(replacing the old one), and make sure its dependencies are installed:
```bash
npm install papaparse
```
(`xlsx` and `lucide-react` should already be installed from before — the
frontend itself didn't change in this update, only how the backend stores
data.)

Then run the frontend as usual:
```bash
npm run dev
```

By default the frontend looks for the API at `http://localhost:4000/api`.
To point it elsewhere, add this to your `index.html` before the Vite script tag:
```html
<script>
  window.__ERP_API_BASE__ = "http://YOUR-SERVER-ADDRESS:4000/api";
</script>
```

---

## 5. CSV Import (Admin only)

Unchanged from before — "Import CSV" is available in the Admissions
Registry, Students directory, and Fee Ledger (admin only). Any column that
doesn't match a known field is preserved as "Additional Information"
instead of being discarded. See in-app hints on each import dialog for
details.

---

## 6. Handling many students at once (e.g. 500 concurrent users)

This is the main reason for the PostgreSQL migration. What you get now:

- **Real concurrent writes.** Unlike SQLite, PostgreSQL doesn't serialize
  every write through a single lock — many students can submit
  fees/attendance/etc. at the same time without queuing behind each other.
- **Connection pooling** (`db.js`, `max: 20` per server process) — reuses
  a small number of live database connections instead of opening a new one
  per request.
- **Row-level locking on fee payments.** If two payments for the *same*
  student land at the exact same instant, the second one waits for the
  first to finish instead of both reading a stale balance and one silently
  overwriting the other. This was tested directly: two simultaneous
  ₹1,000 payments for one student correctly summed to ₹2,000, not ₹1,000.
- **A safety constraint on roll numbers** — if two admission approvals in
  the same course ever did collide on the same auto-generated roll number
  (a very rare timing edge case), the database rejects the second one with
  a clear "please try again" error instead of silently creating a
  duplicate roll number.
- Everything from the earlier resilience pass is still in place: async
  password hashing, indexes on every frequently-queried column,
  compression, rate limiting, and crash-recovery logging.

**Run it with PM2, not a plain terminal**, and take advantage of multiple
CPU cores now that the database supports it:
```bash
npm install -g pm2
cd server
pm2 start ecosystem.config.js
pm2 save
pm2 startup      # follow the printed instructions to auto-start on reboot
```
`ecosystem.config.js` is set to `instances: "max"` (cluster mode — one
worker per CPU core). Each worker opens its own connection pool, so check
your Postgres server's `max_connections` setting if you have many cores
(see the comment at the top of `ecosystem.config.js`).

**Serve a real production build of the frontend, not the dev server:**
```bash
npm run build          # produces a dist/ folder
```
Serve `dist/` with nginx, Caddy, or a static host (Netlify/Vercel) instead
of `npm run dev`.

### A note on load testing

I validated every piece of this individually against a real running
PostgreSQL instance — full student lifecycle (draft → finalize → approve →
attendance → grades → fee payment), CSV import, bulk delete, and
specifically the concurrent-payment race condition (see above) — all
confirmed working correctly. What I couldn't do from where I built this is
a true large-scale concurrent load burst (e.g. 500 simultaneous requests).
Before a real high-stakes rollout (an exam results day, an admissions
rush), it's worth running one yourself:
```bash
npm install -g autocannon
autocannon -c 200 -d 30 http://localhost:4000/api/health
```
(`-c 200` = 200 concurrent connections, `-d 30` = for 30 seconds)

---

## 7. Default login

- **Administrator:** username `admin`, password `admin123` — change this
  soon (currently requires updating the database directly, since there's
  no in-app admin-password-change flow yet).
- **Faculty & Student accounts** are created through the app (Admin → Add
  Faculty; Student → Apply for Admission; or via CSV import for students).

---

## 8. Security notes

- Passwords are hashed with bcrypt (async, non-blocking) before being
  stored — the server never sends password data back to the browser.
- The "registration successful" and "fee receipt" emails are **simulated**
  — composed and stored in the `emails` table so you can see what *would*
  be sent, but nothing is actually emailed. To send real email, add a
  provider (Resend, SendGrid, your college's SMTP, etc.) inside
  `server/routes/students.js` and `server/routes/transactions.js`.
- `DATABASE_URL`/`.env` contains your database password — never commit it
  to a public repository. `.env.example` (committed, no real secrets) shows
  the shape; your actual `.env` should stay local or be set as environment
  variables on whatever host you deploy to.

---

## What's inside `/server`

| File | Purpose |
|---|---|
| `db.js` | PostgreSQL connection pool, schema, migrations, indexes, seed data, and the `get`/`all`/`run`/`transaction` query helpers every route uses |
| `fieldMap.js` | Converts between the database's `snake_case` columns and the frontend's `camelCase` fields |
| `csvImport.js` | Header normalization + known-field matching for the CSV importer |
| `emailTemplates.js` | Composes the simulated registration/fee-receipt emails |
| `server.js` | The Express app — waits for the database to initialize, then wires up all routes, compression, rate-limiting, crash-recovery |
| `ecosystem.config.js` | PM2 config — cluster mode (multi-core), auto-restart |
| `.env.example` | Template for your database connection settings |
| `routes/auth.js` | Login (admin/faculty/student) and password change |
| `routes/students.js` | Draft admission form save/resume, finalize, approve (with roll-number collision handling), reject, edit, bulk delete |
| `routes/import.js` | CSV import for students/admissions and fees (dynamic columns) |
| `routes/teachers.js` | Faculty accounts |
| `routes/courses.js` | Courses/programmes |
| `routes/notices.js` | Notice board |
| `routes/attendance.js` | Attendance marking |
| `routes/grades.js` | Grade entries |
| `routes/fees.js` | Fee ledger, due dates |
| `routes/transactions.js` | Fee payments, EMI plans — wrapped in a database transaction with row locking to stay correct under concurrent payments |
| `routes/messages.js` | Targeted notifications |
| `routes/emails.js` | Simulated email log |
