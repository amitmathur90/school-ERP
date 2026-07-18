require("dotenv").config();
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const db = require("./db");

const app = express();

// Render (and most PaaS hosts) put the app behind a reverse proxy, which
// sets X-Forwarded-For. Without telling Express to trust it, express-rate-limit
// can't reliably tell requests apart by IP (logs ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// and may end up rate-limiting all users as if they were one client). `1` means
// trust exactly one hop — matches Render's single reverse-proxy setup.
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

// Reduces response payload size over the network — meaningful once you have
// hundreds of students' data (especially photos) flowing through list endpoints.
app.use(compression());

app.use(cors());
app.use(express.json({ limit: "10mb" })); // higher limit: photo/signature uploads are base64 in the body

// Basic protection against accidental request storms (a buggy retry loop,
// someone hammering refresh, etc.) — not meant to stop deliberate attacks,
// just keep one misbehaving client from starving everyone else.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,            // 300 requests/minute per IP — generous for normal use, catches runaway loops
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down and try again shortly." },
});
app.use("/api/", apiLimiter);

// Login gets its own, stricter limit — this is the endpoint most worth protecting
// (it's also the most CPU-expensive one, due to password hashing).
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // 20 login attempts/minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait a minute and try again." },
});
app.use("/api/auth/login", loginLimiter);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/admins", require("./routes/admins"));
app.use("/api/courses", require("./routes/courses"));
app.use("/api/teachers", require("./routes/teachers"));
app.use("/api/students", require("./routes/students"));
app.use("/api/import", require("./routes/import"));
app.use("/api/notices", require("./routes/notices"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/grades", require("./routes/grades"));
app.use("/api/fees", require("./routes/fees"));
app.use("/api/transactions", require("./routes/transactions"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/academic-details", require("./routes/academicDetails"));
app.use("/api/documents", require("./routes/documents"));
app.use("/api/leave", require("./routes/leave"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/support", require("./routes/support"));
app.use("/api/emails", require("./routes/emails"));

app.get("/api/health", async (req, res) => {
  try {
    await db.get("SELECT 1");
    res.json({ ok: true, time: new Date().toISOString(), database: "connected" });
  } catch (e) {
    res.status(503).json({ ok: false, error: "Database not reachable" });
  }
});

// Centralized error handler so a bug in one route returns JSON, not an HTML crash page
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error", detail: err.message });
});

// Safety net: if something throws outside Express's own try/catch (a bug we
// didn't anticipate), log it and keep serving other users instead of taking
// the whole process down. This is a backstop, not a substitute for fixing
// the actual bug — but it means one bad request can't crash everyone else's
// session. Paired with a process manager (see README) that restarts the
// process automatically if it ever does exit unexpectedly.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  // Deliberately NOT calling process.exit() here — see README section 8 for
  // the reasoning. Run this under PM2 (ecosystem.config.js) for real restart
  // coverage on the rare case this process does need to come back up.
});

const PORT = process.env.PORT || 4000;

let server;
const { checkAndSendFeeDueReminders } = require("./feeReminderService");

db.init()
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`\n  Law College ERP API running at http://localhost:${PORT}`);
      console.log(`  Database: PostgreSQL (${process.env.DATABASE_URL ? "via DATABASE_URL" : `${process.env.PGHOST || "localhost"}/${process.env.PGDATABASE || "law_college_erp"}`})\n`);
    });

    // Fee due-date reminders: check once at startup, then once a day.
    // Not precise cron scheduling — this app has one long-running process,
    // so a simple interval is enough. If you run this under something that
    // restarts the process frequently, reminders still won't be missed
    // (the startup check covers that), just possibly re-checked more often
    // than once a day, which is harmless since the 7-day cooloff prevents
    // duplicate notifications either way.
    checkAndSendFeeDueReminders().catch((e) => console.error("Initial fee reminder check failed:", e));
    setInterval(() => {
      checkAndSendFeeDueReminders().catch((e) => console.error("Scheduled fee reminder check failed:", e));
    }, 24 * 60 * 60 * 1000);
  })
  .catch((e) => {
    console.error("\n  Could not start: failed to connect to / initialize PostgreSQL.");
    console.error("  Check your DATABASE_URL (or PGHOST/PGUSER/PGPASSWORD/PGDATABASE) in .env — see README section 2.\n");
    console.error(e);
    process.exit(1);
  });

// Graceful shutdown: finish in-flight requests instead of dropping them when
// you stop the server (Ctrl+C, or a process manager restarting it for a deploy).
process.on("SIGTERM", () => { if (server) server.close(() => process.exit(0)); else process.exit(0); });
process.on("SIGINT", () => { if (server) server.close(() => process.exit(0)); else process.exit(0); });
