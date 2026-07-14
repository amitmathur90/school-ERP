// settingsService.js — a minimal key-value store for admin-controlled
// toggles (currently just "is online payment enabled"), backed by the
// `settings` table. Deliberately simple: get a value with a default,
// set a value (upsert).

const db = require("./db");

async function getSetting(key, fallback) {
  const row = await db.get("SELECT value FROM settings WHERE key = ?", [key]);
  return row ? row.value : fallback;
}

async function getBoolSetting(key, fallback) {
  const raw = await getSetting(key, fallback === true ? "true" : "false");
  return raw === "true";
}

async function setSetting(key, value) {
  await db.run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)]
  );
}

module.exports = { getSetting, getBoolSetting, setSetting };
