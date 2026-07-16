# Law College ERP — Full Stack Setup (Backend + PostgreSQL + Frontend)

This package has two parts that both need to run at the same time:

1. **`/server`** — a Node.js/Express backend backed by **PostgreSQL**. This
   is what makes data visible on any device — the database lives on ONE
   server, and every laptop/phone that talks to that server sees the same
   data, with real concurrent read/write support.
2. **`law-college-erp.jsx`** — your React frontend, calling this backend
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
   CREATE DATABASE law_college_erp;
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
docker run --name erp-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=law_college_erp -p 5432:5432 -d postgres:16
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

  Law College ERP API running at http://localhost:4000
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

Copy `law-college-erp.jsx` into your existing project's `src/` folder
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

## 5. Full Staff Hierarchy (Super Admin → Admin → HR / Accounts / Examination Incharge / HOD / Faculty)

This is a real, server-enforced role hierarchy — not just different menus
shown to the same underlying access level. It's built on genuine
authentication: every login issues a signed session token (JWT), and every
sensitive action on the server checks that token before doing anything.
This app didn't have that before — every endpoint trusted whatever the
browser claimed. That gap is now closed for every admin/staff-facing
action (see "What's still open" at the end of this section for the one
deliberate exception, and the pre-login admission flow, which needs to
stay reachable without an account).

### The roles

- **Super Admin** — full access, cannot be restricted, cannot be deleted
  or edited by anyone (including other Super Admins — there's no in-app
  path to create additional Super Admins at all). Your original seeded
  `admin` / `admin123` account automatically became Super Admin.
- **Admin** — full access by default, but Super Admin can restrict exactly
  which modules an Admin can use. Created by Super Admin.
- **HR** — Employee Records (view-only — can't create/edit/delete staff,
  matching "only Super Admin/Admin can create faculty"), Leave Requests
  (approve/reject everyone's), and their own Leave.
- **Accounts** — Fees & Receipts, Payment Reports, their own Leave.
- **Examination Incharge** — Marks & Results (all students/courses, not
  just "my" students), Reports, their own Leave.
- **HOD** — Faculty (view-only) and Students, both automatically scoped to
  their own department, plus Attendance and Internal Marks for their
  department, and their own Leave.
- **Faculty** — unchanged from before (My Students, Attendance, Grades,
  Fees read-only, Notices), plus a new "My Leave" tab.

HR/Accounts/Examination Incharge/HOD/Faculty are all created the same way
as before — Admin/Super Admin → Faculty & Staff → Add Staff Member → pick
the **Role** dropdown. They log in through the "Staff" tab on the login
screen (same tab that used to say "Faculty") using their email and
password, same as always — the server figures out which specific role
they are and sends them to the right dashboard automatically.

### Assigning permissions (Admin)

Super Admin → **Staff Accounts** → **Permissions** next to any Admin lets
you either leave them unrestricted or tick exactly which modules they can
use. This isn't just a UI filter — the server checks it too. Verified
directly: created an Admin restricted to only Fees + Reports, confirmed
they could use Fees normally, and confirmed a direct API call to create a
Faculty account was rejected with **"You don't have access to teachers."**
even though the request was otherwise perfectly valid.

### Department scoping (HOD)

A HOD only ever sees students and faculty in their own department — this
is enforced by the server (filtering the actual database query), not by
hiding rows in the browser. This required adding a **Department** field to
Courses (Admin → Courses → Add Course), since that's what actually links
a student to a department in this schema.

Verified directly: created a student in a Law course and another in a
Commerce course, logged in as a Law-department HOD, and confirmed they
only saw the Law student — while Super Admin, querying the same endpoint,
saw both.

### Leave Management (new)

The one part of HR's stated job that didn't exist anywhere in the app
before — built as a real feature: any staff member can apply for their own
leave (type, dates, reason) from their "My Leave" tab; HR (or Admin/Super
Admin) sees all requests and approves/rejects with an optional note.
Verified the full loop directly, including that a regular Faculty account
cannot apply for someone else's leave and cannot approve leave.

**Payroll and staff Attendance are explicitly not built** — building
Payroll properly (salary structures, deductions, payslips) is its own
substantial project, and staff attendance would need its own tracking
concept separate from student attendance. Both are flagged in the HR
dashboard itself so it's honest about what's there versus not, rather than
presenting an empty promise.

**Hall Ticket generation and a dedicated exam-scheduling module** are
similarly not built for Examination Incharge — Marks entry and Reports
are, everything else is flagged in-app.

**A dedicated Timetable module** is not built for HOD either, for the
same reason — flagged in the README rather than silently absent.

### Setup

1. Set a real `JWT_SECRET` in `server/.env` (a random string — instructions
   are in `.env.example`). The app runs with an insecure default and warns
   loudly in the console if you skip this — fine for local testing, not
   for anything real.
2. That's it — everything else (the Super Admin promotion, new tables,
   etc.) happens automatically via the same migration system as every
   other update in this project. Restart the server and it's live.

### What's still open (being upfront about it)

- **The pre-login admission flow is intentionally still public** —
  creating a draft application, uploading documents, and paying the
  admission fee all happen before a prospective student has any account,
  so those specific endpoints can't require a token. This was true before
  this update too; it's not a new gap.
- **Document downloads accept the token as a URL parameter** as well as
  the standard header, specifically because a plain `<a href>` link (used
  for viewing an uploaded document) can't attach a custom header. This is
  a common, deliberate pattern for authenticated file downloads, but is
  slightly weaker than header-only auth (a token in a URL can end up in
  server logs). Fine for this use case; worth knowing.
- **Session tokens last 12 hours** and aren't revocable before then (no
  server-side session list to invalidate one early) — logging out clears
  it from the browser, but a copied token would technically still work
  until it expires. Standard JWT trade-off; fine for this scale of app.

---

## 6. CSV Import (Admin only)

Unchanged from before — "Import CSV" is available in the Admissions
Registry, Students directory, and Fee Ledger (admin only). Any column that
doesn't match a known field is preserved as "Additional Information"
instead of being discarded. See in-app hints on each import dialog for
details.

---

## 7. Payment Receipts & Fee Due Reminders

**Receipts.** Every payment — cash/offline entry by staff or online via
Razorpay/PayU — automatically gets:
- A unique transaction ID
- An emailed receipt (includes the transaction ID, amount, date, payment
  mode, and gateway details if paid online)
- A **"View"** button next to that payment, both on the student's own
  Fees & Payments page and on the admin's Fee Ledger (via the new
  "Payments" button per student), opening a printable receipt

Payment history lists (both student and admin views) show the most recent
payment first.

**Fee due reminders.** If a student has an outstanding balance and their
due date is within 30 days, they automatically get a dashboard
notification and an email — checked once a day, and once whenever the
server starts up. To avoid repeatedly nagging the same student, a given fee
record won't be reminded again for 7 days after its last reminder. Admin
can also trigger this manually anytime from Fees → **"Send Reminders
Now"**, rather than waiting for the daily check.

This was tested directly: created a student with a partial payment and a
near-term due date, triggered the check, confirmed both the dashboard
notification and the email were created with the correct amount and date,
and confirmed re-running immediately correctly sent nothing (respecting
the cooloff).

---

## 8. Admission Form: Academic Details & Documents (Steps 6 & 7)

The admission wizard now has two more steps after Course Selection:

- **Step 6 — Academic Details**: an editable table (add/remove rows freely)
  for every qualifying exam the student has passed — Name, Board/University,
  Passing Year, Grade, Subject. "Save Step" replaces the full set of rows
  for that student in one go (so editing/removing a row and saving again
  cleanly reconciles, rather than accumulating duplicates).
- **Step 7 — Documents**: an editable table for uploading scanned documents
  (JPG/JPEG/PNG/GIF, under 5MB each) — Document Type, Original/Photocopy,
  Document Number, and the file itself. Unlike Academic Details, each file
  uploads **immediately** the moment it's selected (not batched at "Save
  Step" time), so you get instant feedback per file.

**Real files, real per-student folders — not just database blobs.** Every
uploaded document is saved to an actual folder on the server's disk at
`server/uploads/students/<studentId>/`, created automatically the first
time that student uploads anything. Only the file's metadata and location
are stored in the database; admin can view or download any document
directly from the Admissions Registry's "View" screen, which now shows
both the Academic Details table and a list of uploaded documents with
direct links to view each file.

This was tested end-to-end with a real uploaded image file — confirmed the
per-student folder gets created, the file is byte-identical when
downloaded back, and deleting a document removes both the database record
and the file on disk.

**One thing worth knowing for production:** these files live on whichever
single machine runs the Node server. That's fine for a single-server setup
(which is what this whole package is built for), but if you ever move to
running multiple server instances behind a load balancer, local disk
storage won't be shared between them — you'd want to switch to something
like AWS S3 or a shared network volume at that point. Not needed for a
typical single-server deployment.

---

## 9. Online Fee Payment (Razorpay or PayU — pick one)

Students can pay fees online themselves (from Student → Fees & Payments →
"Pay Online", and also from Step 7 of the admission wizard for the initial
admission fee). Two gateways are supported — **only one can be active at a
time**, chosen by the admin.

### Where the switch lives

**Admin → Fees** shows a "Online Payment Gateway" panel with both options
side by side. Each shows whether it's configured (has API keys in `.env`)
and whether it's currently the active one. Selecting one automatically
turns the other off — there's no scenario where both are live
simultaneously. If neither is selected, students only see the cash/offline
payment flow, with a clear message explaining that (not just a missing
button).

### Setting up Razorpay — works out of the box, even on localhost

1. Free account at https://dashboard.razorpay.com/signup
2. Toggle **Test Mode** (top-right) for a safe sandbox.
3. Settings → API Keys → Generate Test Key. Copy the Key ID and Key Secret.
4. Add to `server/.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
   ```
5. Restart the server, then select "Razorpay" in Admin → Fees.

Test with card `4111 1111 1111 1111`, any future expiry, any CVV. Razorpay
opens as a JS popup — the browser never leaves your app, so this works
correctly on plain `localhost` with no extra setup.

### Setting up PayU — needs your server reachable from the internet

PayU works differently: instead of a popup, the browser is redirected to
PayU's own payment page (a real page navigation), and PayU's servers then
redirect the browser back to **your server** with the result. That "back
to your server" step is the catch — `localhost:4000` isn't reachable from
PayU's servers, so a plain local setup can create a PayU order but can't
receive PayU's callback.

To actually test PayU end-to-end, either:
- **Use a tunnel** like [ngrok](https://ngrok.com) — run `ngrok http 4000`,
  and set `FRONTEND_URL` in `.env` accordingly, or
- **Deploy the backend somewhere public** (even a free-tier host) and test
  from there.

Setup:
1. Get test credentials from https://onboarding.payu.in/signup, or use
   PayU's well-known public test pair for their sandbox: merchant key
   `gtKFFx`, salt `eCwWELxi` (these are PayU's own published test
   credentials — safe to use for testing, not real merchant credentials).
2. Add to `server/.env`:
   ```
   PAYU_MERCHANT_KEY=gtKFFx
   PAYU_SALT=eCwWELxi
   PAYU_BASE_URL=https://test.payu.in/_payment
   ```
3. Restart the server, then select "PayU Money" in Admin → Fees.

**If you just want to test the app locally without a tunnel, use Razorpay**
— it's the one built for that.

### How both stay safe (and what was actually verified)

- **Razorpay**: the server re-derives the payment's cryptographic signature
  itself (HMAC-SHA256) and compares it — verified directly: a correct
  signature is accepted, a tampered one is rejected, before anything is
  written to the database.
- **PayU**: same idea, different algorithm — the server re-derives PayU's
  response hash (SHA-512, PayU's documented reverse-hash formula) and only
  records the payment if it matches. Verified that the hash construction
  matches PayU's documented format exactly and produces valid output; the
  full live redirect round-trip couldn't be tested from the environment
  this was built in (no route to `test.payu.in`) — test this yourself with
  a tunnel before relying on it.
- **Both gateways**: the amount that gets credited always comes from the
  gateway's own record of the order/transaction (fetched fresh at
  verification time), never from anything the browser claims at that
  point — so the amount can't be tampered with client-side either.
- **Paying before admission is approved**: this is supported and was
  tested directly — a student can pay their admission fee while still
  "pending", which records against a fee record with `totalFee: 0`. Once
  admin approves them, `totalFee` updates to the real course fee while
  `paid` is correctly preserved, leaving the right remaining balance. No
  payment is lost in that handoff.

### Architecture note

`paymentService.js` holds the actual "record a payment" logic and is
completely gateway-agnostic — both Razorpay's and PayU's routes call the
same function. If you ever want a third gateway, follow the same shape
(create an order/transaction → redirect or popup → verify the gateway's
signature/hash → call `recordPayment()`) without touching anything else.


## 10. Handling many students at once (e.g. 500 concurrent users)

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

## 11. Default login

- **Super Admin:** username `admin`, password `admin123` — change this
  soon (currently requires updating the database directly, since there's
  no in-app admin-password-change flow yet).
- **Admin, HR, Accounts, Examination Incharge, HOD, Faculty** accounts are
  all created by Super Admin/Admin through the app (Staff Accounts /
  Faculty & Staff → Add). **Student accounts** are created by the student
  themselves (Apply for Admission) or via CSV import.

---

## 12. Security notes

- Passwords are hashed with bcrypt (async, non-blocking) before being
  stored — the server never sends password data back to the browser.
- **Set a real `JWT_SECRET`** in `.env` before deploying anywhere real
  (see section 5) — this is what signs every login session; the app runs
  with an insecure default and warns loudly in the console if you skip it.
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

## 13. Deploying to Render

**Important first: Render deploys from a Git repository, not a zip upload.**
You push your code to GitHub, connect Render to that repo, and Render
builds and runs it from there. So the actual first step is getting
everything into one Git repo.

### Step 1 — Combine everything into one repo

You should end up with a repo shaped like this:
```
your-repo/
├── render.yaml          <- included in this package
├── .gitignore           <- included in this package
├── server/               <- the complete backend (this package's server/ folder)
└── (your existing frontend project — package.json, vite.config.js, src/, etc.)
    └── src/law-college-erp.jsx   <- replace with the version in this package
```
If you don't already have a Git repo for your frontend project:
```bash
cd your-frontend-project-folder
git init
git add .
git commit -m "Initial commit"
```
Copy this package's `server/`, `render.yaml`, and `.gitignore` into that
same folder, then push to a new GitHub repository:
```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git branch -M main
git push -u origin main
```

### Step 2 — Deploy via Blueprint

1. Go to https://dashboard.render.com → **New +** → **Blueprint**
2. Connect your GitHub account and select the repo you just pushed
3. Render reads `render.yaml` and shows you three resources it's about to
   create: the database, the backend web service, and the frontend static
   site. Click **Apply**.
4. First deploy will fail or come up incomplete — that's expected, because
   the blueprint intentionally leaves your API keys and URLs blank (see
   Step 3). Don't worry about errors yet.

### Step 3 — Fill in the blanks

Once all three resources exist, go to each service's **Environment** tab
in the Render dashboard:

**On `law-college-erp-api` (backend):**
- `FRONTEND_URL` → your static site's URL, e.g. `https://law-college-erp-frontend.onrender.com` (find this on the static site's own dashboard page)
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` → from Razorpay (see section 7)
- `PAYU_MERCHANT_KEY` / `PAYU_SALT` → from PayU (see section 7) — this is
  actually **easier to test on Render than on localhost**, since Render
  gives your backend a real public URL, which is exactly what PayU's
  callback needs.

**On `law-college-erp-frontend` (static site):**
- `VITE_API_BASE_URL` → your backend's URL + `/api`, e.g.
  `https://law-college-erp-api.onrender.com/api`

Save each — Render automatically redeploys the affected service.

### Step 4 — Verify

- Visit the backend's URL + `/api/health` — should show `{"ok":true,...}`
- Visit the frontend's URL — should load the login screen and be able to
  reach the backend (try logging in as `admin` / `admin123`)

### About uploaded documents (Step 7 of the admission form)

Render's free/standard web services have an **ephemeral filesystem** —
anything written to disk (including the `server/uploads/` folder this app
creates for student document uploads) is **wiped on every deploy and
periodic restart**. Fine for testing; not fine for real student documents
you need to keep.

Two ways to fix this for a real deployment:
- **Render Persistent Disks** (available on paid instance plans) — mount a
  disk at `server/uploads` in the service settings; files then survive
  restarts and deploys.
- **Move to object storage** (AWS S3, Cloudflare R2, etc.) — a more robust
  long-term fix, but requires code changes to `server/routes/documents.js`.
  Ask if you'd like this built out.

### Free plan limitations worth knowing

Render's free web services **spin down after inactivity** and take 30-60
seconds to wake back up on the next request — the first page load after a
quiet period will feel slow. Free Postgres databases also **expire after
90 days** unless upgraded. Fine for testing/demoing; upgrade to a paid plan
before relying on this for a real admissions cycle.

---

## What's inside `/server`

| File | Purpose |
|---|---|
| `db.js` | PostgreSQL connection pool, schema, migrations, indexes, seed data, and the `get`/`all`/`run`/`transaction` query helpers every route uses |
| `fieldMap.js` | Converts between the database's `snake_case` columns and the frontend's `camelCase` fields |
| `csvImport.js` | Header normalization + known-field matching for the CSV importer |
| `emailTemplates.js` | Composes the simulated registration/fee-receipt emails |
| `paymentService.js` | The single place that actually records a fee payment (used by both manual entry and gateway-verified payments) |
| `feeReminderService.js` | Checks for upcoming fee due dates with an outstanding balance, sends dashboard notification + email |
| `settingsService.js` | Small key-value store backing admin toggles — currently which payment gateway is active |
| `authMiddleware.js` | JWT session tokens, role/permission checks — the foundation of the staff hierarchy |
| `server.js` | The Express app — waits for the database to initialize, then wires up all routes, compression, rate-limiting, crash-recovery |
| `ecosystem.config.js` | PM2 config — cluster mode (multi-core), auto-restart |
| `.env.example` | Template for your database connection + Razorpay settings |
| `routes/auth.js` | Login (admin/faculty/student) and password change |
| `routes/students.js` | Draft admission form save/resume, finalize, approve (with roll-number collision handling), reject, edit, bulk delete |
| `routes/import.js` | CSV import for students/admissions and fees (dynamic columns) |
| `routes/academicDetails.js` | Academic Details table (admission wizard step 6) |
| `routes/documents.js` | Document upload/download — real files in a per-student folder (admission wizard step 7) |
| `routes/payments.js` | Gateway selection (Razorpay/PayU, mutually exclusive) + order creation + signature/hash-verified payment recording for both |
| `routes/teachers.js` | Faculty accounts |
| `routes/courses.js` | Courses/programmes |
| `routes/notices.js` | Notice board |
| `routes/attendance.js` | Attendance marking |
| `routes/grades.js` | Grade entries |
| `routes/fees.js` | Fee ledger, due dates |
| `routes/transactions.js` | Manual (cash/offline) fee payment entry — calls `paymentService.js` |
| `routes/admins.js` | Super Admin managing Admin accounts and their permissions |
| `routes/leave.js` | Staff leave requests — apply, list, approve/reject |
| `routes/messages.js` | Targeted notifications |
| `routes/emails.js` | Simulated email log |
