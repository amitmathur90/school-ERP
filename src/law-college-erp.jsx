import { useState, useEffect, useMemo, useRef, Fragment, Component } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import {
  Scale, LayoutDashboard, Users, UserPlus, GraduationCap, BookOpen, Bell,
  Wallet, LogOut, CheckCircle, XCircle, Clock, Search, Plus,
  Trash2, ChevronRight, User, Lock, FileText,
  Award, X, ClipboardCheck, Eye, Pencil, UploadCloud, Printer, Menu
} from "lucide-react";

/**
 * API client for the backend server (see the accompanying /server folder).
 * The backend owns the real SQLite database — this app is now a thin client
 * that reads/writes over HTTP, so every device pointed at the same server
 * sees the same data.
 *
 * Where this comes from, in priority order:
 *  1. VITE_API_BASE_URL — set at build time (e.g. in Render's static site
 *     env vars, or a local .env for `npm run build`). This is the right
 *     way to point a deployed frontend at a deployed backend.
 *  2. window.__ERP_API_BASE__ — set at runtime in index.html, for quick
 *     local overrides without rebuilding.
 *  3. http://localhost:4000/api — the local-dev default.
 */
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  (typeof window !== "undefined" && window.__ERP_API_BASE__) ||
  "http://localhost:4000/api";

/** The current session's auth token. Kept as a module-level variable (not
 *  React state) because api/apiFetch are plain functions called from many
 *  places, not just inside components. Persisted to localStorage so a page
 *  refresh doesn't sign the user out (the token's own 12h expiry is what
 *  actually ends a session, not closing the tab). */
let authToken = (typeof window !== "undefined" && window.localStorage.getItem("erp_token")) || null;
function setAuthToken(token) {
  authToken = token;
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem("erp_token", token);
  else window.localStorage.removeItem("erp_token");
}
function getAuthToken() { return authToken; }

async function apiFetch(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      ...options,
    });
  } catch (e) {
    throw new Error(`Could not reach the server at ${API_BASE}. Is the backend running? (npm start in /server)`, { cause: e });
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty response body */ }
  if (res.status === 401) {
    setAuthToken(null); // session expired/invalid — clear it so the next action prompts a fresh login instead of looping on 401s
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: "POST", body: JSON.stringify(body || {}) }),
  patch: (path, body) => apiFetch(path, { method: "PATCH", body: JSON.stringify(body || {}) }),
  del: (path) => apiFetch(path, { method: "DELETE" }),
  /** Multipart upload — deliberately doesn't go through apiFetch, since that
   *  always sets a JSON content-type; the browser needs to set its own
   *  multipart boundary header for FormData uploads. */
  async upload(path, formData) {
    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        body: formData,
      });
    } catch (e) {
      throw new Error(`Could not reach the server at ${API_BASE}. Is the backend running? (npm start in /server)`);
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty response body */ }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  },
};

/** Loads Razorpay's checkout widget script once, reusing it on subsequent calls. */
let razorpayScriptPromise = null;
function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;
  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Could not load the payment gateway. Check your internet connection and try again."));
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
}

/** PayU doesn't have a JS popup like Razorpay — it requires an actual HTML
 *  form POST to navigate the browser to PayU's own payment page. Builds a
 *  hidden form with the given fields and submits it, which leaves this page
 *  entirely (PayU redirects back to us via the server-side surl/furl once
 *  the payment is done). */
function submitPayuRedirectForm(url, fields) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  Object.entries(fields).forEach(([key, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value == null ? "" : String(value);
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

/** Strips password/confirm fields out of a form snapshot before it's stored
 *  in local state or sent as the "rest of the fields" payload (password is
 *  sent separately, only where the server actually needs it). */
function omitCreds(snapshot) {
  const rest = { ...snapshot };
  delete rest.password;
  delete rest.confirm;
  return rest;
}

/* ============================== CONSTANTS ============================== */

const COLLEGE_NAME = "Sir Pratap Vidhi Mahavidyalaya";
const COLLEGE_SHORT = "SPVM";
const COLLEGE_EMAIL = "info.spmjodh@gmail.com";
const COLLEGE_PHONES = ["(+91) 6378800229", "(+91) 9414145735", "(+91) 9460155558"];
const EMAIL_FOOTER =
  `For all future requests, you can reach us through the following channels:\n` +
  `Email: ${COLLEGE_EMAIL}, Contact No.: ${COLLEGE_PHONES.join(" / ")}`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9]{10}$/;
const PIN_RE = /^[0-9]{6}$/;
const AADHAR_RE = /^[0-9]{12}$/;

const CATEGORIES = ["General", "OBC", "SC", "ST", "EWS"];
const EXAM_TYPES = ["Internal Assessment", "Mid-Term", "End-Term", "Moot Court", "Viva Voce"];

const COURSE_GROUPS = ["Graduation", "Post Graduation", "Diploma"];
const OCCUPATIONS = ["Govt.", "Private", "Business", "Others"];
const HOW_KNOW_OPTIONS = [
  "Newspaper", "Television", "Social Media", "Friends & Family",
  "College Website", "Education Fair / Exhibition", "Hoarding / Banner",
  "School / College Reference", "Other",
];
const INDIA_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi (NCT)", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

const uid = (p = "id") => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const todayISO = () => new Date().toISOString().slice(0, 10);

function startOfWeek(date) {
  const dt = new Date(date);
  const day = dt.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + diffToMonday);
  return dt;
}
function isInSameWeek(dateStr, ref) {
  if (!dateStr) return false;
  return startOfWeek(dateStr).getTime() === startOfWeek(ref).getTime();
}
function isInSameMonth(dateStr, ref) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}
function isInMonthString(dateStr, monthStr) {
  if (!dateStr || !monthStr) return false;
  return dateStr.slice(0, 7) === monthStr;
}

/** Best-effort Hindi transliteration via the Claude API (falls back to blank on any failure,
 *  the field always stays editable so the applicant can type/correct it manually). */
async function transliterateToHindi(name) {
  const text = (name || "").trim();
  if (!text) return "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 60,
        messages: [{
          role: "user",
          content: `Transliterate this Indian personal name into Hindi Devanagari script. Reply with ONLY the Devanagari text, nothing else — no quotes, no explanation.\n\nName: ${text}`,
        }],
      }),
    });
    const data = await res.json();
    const block = (data.content || []).find((c) => c.type === "text");
    return block ? block.text.trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

/* ============================== STYLES ============================== */

const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');

    .erp-root {
      --ink: #1B2A4A;
      --ink-2: #24365c;
      --maroon: #7A2E2E;
      --maroon-dark: #5e2222;
      --gold: #B8935F;
      --gold-light: #E9D9BE;
      --parchment: #F7F3EA;
      --paper: #FFFFFF;
      --charcoal: #2B2B2B;
      --slate: #6B7280;
      --success: #3F6B4E;
      --success-bg: #E7EFE9;
      --danger: #9B3B3B;
      --danger-bg: #F5E8E6;
      --warn: #96712A;
      --warn-bg: #FBF0DC;
      --border: #E4DCC8;
      --font-display: 'Lora', Georgia, serif;
      --font-body: 'Inter', -apple-system, sans-serif;
      --font-mono: 'IBM Plex Mono', monospace;

      font-family: var(--font-body);
      color: var(--charcoal);
      background: var(--parchment);
      min-height: 100vh;
      width: 100%;
    }
    .erp-root * { box-sizing: border-box; }
    .erp-root h1, .erp-root h2, .erp-root h3 { font-family: var(--font-display); margin: 0; }
    .erp-root button { font-family: var(--font-body); cursor: pointer; }
    .erp-root input, .erp-root select, .erp-root textarea {
      font-family: var(--font-body);
      border: 1px solid var(--border);
      background: var(--paper);
      border-radius: 4px;
      padding: 9px 11px;
      font-size: 13.5px;
      color: var(--charcoal);
      width: 100%;
      outline: none;
    }
    .erp-root input:focus, .erp-root select:focus, .erp-root textarea:focus {
      border-color: var(--gold);
      box-shadow: 0 0 0 3px rgba(184,147,95,0.18);
    }
    .erp-root label { font-size: 12px; font-weight: 600; color: var(--ink); display:block; margin-bottom:5px; letter-spacing:.01em; }

    .eyebrow {
      font-family: var(--font-mono);
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--gold);
      font-weight: 500;
    }

    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 9px 16px; border-radius: 4px; border: 1px solid transparent;
      font-size: 13.5px; font-weight: 600; transition: all .15s ease;
    }
    .btn-primary { background: var(--maroon); color: #fff; }
    .btn-primary:hover { background: var(--maroon-dark); }
    .btn-outline { background: transparent; border-color: var(--ink); color: var(--ink); }
    .btn-outline:hover { background: var(--ink); color: #fff; }
    .btn-ghost { background: transparent; color: var(--slate); border: 1px solid var(--border); }
    .btn-ghost:hover { border-color: var(--maroon); color: var(--maroon); }
    .btn-sm { padding: 6px 10px; font-size: 12.5px; }
    .btn-danger { background: var(--danger-bg); color: var(--danger); border-color: transparent; }
    .btn-danger:hover { background: var(--danger); color: #fff; }
    .btn-success { background: var(--success-bg); color: var(--success); }
    .btn-success:hover { background: var(--success); color: #fff; }
    .btn:disabled { opacity: .5; cursor: not-allowed; }

    .card {
      background: var(--paper);
      border: 1px solid var(--border);
      border-radius: 6px;
    }
    .card-header {
      padding: 16px 20px; border-bottom: 1px solid var(--border);
      display:flex; align-items:center; justify-content:space-between; gap: 12px; flex-wrap: wrap;
    }
    .card-body { padding: 20px; }

    .seal {
      display:inline-flex; align-items:center; gap:6px;
      font-family: var(--font-mono); font-size: 11px; font-weight: 600;
      letter-spacing: .08em; text-transform: uppercase;
      padding: 5px 12px; border-radius: 999px; border: 1.5px dashed;
    }
    .seal-pending { color: var(--warn); border-color: var(--warn); background: var(--warn-bg); }
    .seal-approved { color: var(--success); border-color: var(--success); background: var(--success-bg); }
    .seal-rejected { color: var(--danger); border-color: var(--danger); background: var(--danger-bg); }

    .erp-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
    .erp-scrollbar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 8px; }

    table.ledger { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    table.ledger th {
      text-align: left; font-family: var(--font-mono); font-size: 10.5px;
      text-transform: uppercase; letter-spacing: .08em; color: var(--slate);
      padding: 10px 14px; border-bottom: 2px solid var(--ink); background: #FBF9F4;
    }
    table.ledger td { padding: 12px 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    table.ledger tr:last-child td { border-bottom: none; }
    table.ledger td.num { font-family: var(--font-mono); color: var(--slate); }

    .nav-item {
      display:flex; align-items:center; gap:11px; padding: 10px 16px;
      color: rgba(255,255,255,0.68); font-size: 13.5px; font-weight: 500;
      border-left: 3px solid transparent; cursor:pointer; transition: all .15s ease;
    }
    .nav-item:hover { background: rgba(255,255,255,0.05); color: #fff; }
    .nav-item.active { background: rgba(184,147,95,0.15); color: #fff; border-left-color: var(--gold); }

    .stat-card {
      background: var(--paper); border: 1px solid var(--border); border-radius: 6px;
      padding: 18px 20px; position: relative; overflow: hidden;
    }
    .stat-card .stat-value { font-family: var(--font-display); font-size: 30px; font-weight: 700; color: var(--ink); }
    .stat-card .stat-label { font-size: 12px; color: var(--slate); margin-top: 4px; }

    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(27,42,74,0.45);
      display:flex; align-items:center; justify-content:center; z-index: 100; padding: 20px;
    }
    .modal-box {
      background: var(--paper); border-radius: 8px; max-width: 520px; width: 100%;
      max-height: 88vh; overflow-y: auto; border: 1px solid var(--border);
    }

    .tab-btn {
      padding: 10px 18px; font-size: 13.5px; font-weight: 600; color: var(--slate);
      border-bottom: 2px solid transparent; background:none; border-radius:0;
    }
    .tab-btn.active { color: var(--maroon); border-bottom-color: var(--maroon); }

    .badge-role {
      font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
      padding: 3px 8px; border-radius: 3px;
    }
    .badge-admin { background: var(--ink); color: #fff; }
    .badge-teacher { background: var(--gold-light); color: var(--ink); }
    .badge-student { background: #EDEAE0; color: var(--charcoal); }

    .erp-hamburger { display: none; }
    .erp-backdrop { display: none; }
    @media (min-width: 861px) {
      /* A sticky sidebar with a hardcoded 100vh height can drift out of sync
         with the real viewport at non-100% browser zoom (subpixel rounding
         between the two independently-computed values), making it scroll
         instead of staying pinned. Letting it stretch to match its flex
         sibling's actual rendered height instead sidesteps vh entirely. */
      .erp-sidebar { height: auto !important; align-self: stretch; }
    }
    @media (max-width: 860px) {
      .erp-hamburger {
        display: flex; align-items: center; justify-content: center;
        position: fixed; top: 14px; left: 14px; z-index: 300;
        width: 38px; height: 38px; border-radius: 8px;
        background: var(--ink); color: #fff; border: none; cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      }
      .erp-sidebar {
        position: fixed !important; left: 0; top: 0; z-index: 260;
        transform: translateX(-100%);
        transition: transform .2s ease;
        box-shadow: 4px 0 24px rgba(0,0,0,0.3);
      }
      .erp-sidebar.open { transform: translateX(0); }
      .erp-backdrop.open {
        display: block; position: fixed; inset: 0;
        background: rgba(0,0,0,0.4); z-index: 250;
      }
      .erp-main-content { padding-top: 56px !important; }
      .erp-main-content > div { padding-left: 16px !important; padding-right: 16px !important; }
    }
    @media (max-width: 640px) {
      .erp-root [style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
    }

    .print-header { display: none; }
    @media print {
      body * { visibility: hidden; }
      .print-area, .print-area * { visibility: visible; }
      .print-area { position: absolute; top: 0; left: 0; width: 100%; padding: 16px 24px; }
      .no-print { display: none !important; }
      .print-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; border-bottom: 2px solid var(--ink); padding-bottom: 12px; }
      table.ledger { font-size: 11px; }
      table.ledger th, table.ledger td { padding: 6px 8px; }
    }
  `}</style>
);

function composeRegistrationEmail(student) {
  return {
    id: uid("mail"),
    to: student.email,
    subject: `Registration Successful — ${COLLEGE_NAME}`,
    body:
`Dear ${student.name},

Thank you for applying to ${COLLEGE_NAME}. Your registration has been completed successfully and your application is now under review by our admissions office.

Your student portal login details are below:
Username: ${student.email}
Password: ${student.password}

Please keep these credentials safe. You can sign in any time to track your admission status, view your submitted application, and update your contact details.

${EMAIL_FOOTER}`,
    date: new Date().toISOString(),
  };
}

function composeFeeReceiptEmail(student, txn) {
  return {
    id: uid("mail"),
    to: student.email,
    subject: `Fee Payment Receipt — ${COLLEGE_NAME}`,
    body:
`Dear ${student.name},

We have received your fee payment. Details are below:

Amount Received: ₹${txn.totalAmount.toLocaleString("en-IN")}
Payment Type: ${txn.paymentType}
Payment Mode: ${txn.paymentMode}${txn.paymentMode === "EMI" ? `\nInstallment Amount: ₹${Number(txn.installmentAmount || 0).toLocaleString("en-IN")}` : ""}
Date: ${fmtDate(txn.date)}
Recorded By: ${txn.recordedByName}

Thank you for your prompt payment.

${EMAIL_FOOTER}`,
    date: new Date().toISOString(),
  };
}



/* ============================== SMALL COMPONENTS ============================== */

function Seal({ status }) {
  const map = {
    pending: { cls: "seal-pending", icon: <Clock size={12} />, label: "Pending Review" },
    approved: { cls: "seal-approved", icon: <CheckCircle size={12} />, label: "Approved" },
    rejected: { cls: "seal-rejected", icon: <XCircle size={12} />, label: "Rejected" },
  };
  const m = map[(status || "").toLowerCase()] || map.pending;
  return <span className={`seal ${m.cls}`}>{m.icon}{m.label}</span>;
}

function StatCard({ icon, value, label, accent }) {
  return (
    <div className="stat-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="stat-value">{value}</div>
          <div className="stat-label">{label}</div>
        </div>
        <div style={{ color: accent || "var(--gold)", opacity: 0.8 }}>{icon}</div>
      </div>
    </div>
  );
}

class ModalErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Modal render error:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 4 }}>
          <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "12px 14px", borderRadius: 4, fontSize: 13, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>This record couldn't be displayed.</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{String(this.state.error.message || this.state.error)}</div>
            <div style={{ marginTop: 8 }}>This usually means the record is missing data the form expects (often from a CSV import). Try Edit to fix its fields, or check the browser console for details.</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Modal({ title, onClose, children, width }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: width || 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3 style={{ fontSize: 17 }}>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="card-body">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label>{label}</label>
      {props.as === "select" ? (
        <select {...props.selectProps}>{props.children}</select>
      ) : props.as === "textarea" ? (
        <textarea rows={3} {...props.inputProps} />
      ) : (
        <input {...props.inputProps} />
      )}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button
          type="button"
          key={o}
          className={`btn btn-sm ${value === o ? "btn-primary" : "btn-ghost"}`}
          onClick={() => onChange(o)}
        >{o}</button>
      ))}
    </div>
  );
}

function HiField({ label, required, value, onChange, hiValue, onHiChange, placeholder }) {
  const [loading, setLoading] = useState(false);
  const handleBlur = async () => {
    if (!value || hiValue) return;
    setLoading(true);
    const hi = await transliterateToHindi(value);
    setLoading(false);
    if (hi) onHiChange(hi);
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <label>{label}{required ? " *" : ""}</label>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onBlur={handleBlur} />
      <div style={{ position: "relative", marginTop: 6 }}>
        <input
          value={hiValue}
          onChange={(e) => onHiChange(e.target.value)}
          placeholder={loading ? "Translating…" : "हिंदी में (auto, editable)"}
          style={{ background: "#FBF9F4", fontStyle: hiValue ? "normal" : "italic", color: "var(--slate)" }}
        />
      </div>
    </div>
  );
}

function FileUploadField({ label, hint, value, fileName, onChange, error }) {
  const inputRef = useRef(null);
  return (
    <div style={{ marginBottom: 14 }}>
      <label>{label}</label>
      <div
        onClick={() => inputRef.current && inputRef.current.click()}
        style={{
          border: "1.5px dashed var(--border)", borderRadius: 6, padding: "14px",
          display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: "#FBF9F4",
        }}
      >
        {value ? (
          <img src={value} alt={label} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 4, border: "1px solid var(--border)" }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 4, background: "var(--gold-light)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink)", fontSize: 10, fontWeight: 700 }}>
            {label[0]}
          </div>
        )}
        <div style={{ fontSize: 12.5 }}>
          <div style={{ fontWeight: 600, color: "var(--ink)" }}>{fileName || "Click to upload"}</div>
          <div style={{ color: "var(--slate)", fontSize: 11 }}>{hint}</div>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/jpg,image/png" style={{ display: "none" }} onChange={onChange} />
      {error && <div style={{ color: "var(--danger)", fontSize: 11.5, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
function EmptyState({ icon, title, note }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--slate)" }}>
      <div style={{ marginBottom: 10, opacity: 0.5 }}>{icon}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--ink)", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{note}</div>
    </div>
  );
}

/* ============================== LOGO ============================== */

function CollegeMark({ light }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{
        width: 38, height: 38, borderRadius: "50%", border: `1.5px solid ${light ? "rgba(255,255,255,0.4)" : "var(--gold)"}`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
      }}>
        <Scale size={18} color={light ? "#fff" : "var(--maroon)"} />
      </div>
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14.5, color: light ? "#fff" : "var(--ink)", lineHeight: 1.15 }}>
          {COLLEGE_NAME}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: light ? "rgba(255,255,255,0.55)" : "var(--gold)" }}>
          {COLLEGE_SHORT} &middot; Jodhpur &middot; Justitia Omnibus
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div><div style={{ fontSize: 11, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div><div style={{ fontWeight: 600, marginTop: 2 }}>{value || "—"}</div></div>
  );
}

function SummarySection({ title, printable, children }) {
  return (
    <div className={printable ? "" : "card"} style={{ marginBottom: 16 }}>
      <div className={printable ? "" : "card-body"}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>{title}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13.5 }}>{children}</div>
      </div>
    </div>
  );
}

function ApplicationSummary({ student, course, printable, academicDetails, documents }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 18 }}>
        {student.photoData ? (
          <img src={student.photoData} alt={student.name} style={{ width: 84, height: 84, borderRadius: 6, objectFit: "cover", border: "1px solid var(--border)" }} />
        ) : (
          <div style={{ width: 84, height: 84, borderRadius: 6, background: "var(--gold-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: "var(--ink)" }}>{student.name?.[0] || "?"}</div>
        )}
        <div>
          <h2 style={{ fontSize: 20 }}>{student.name}</h2>
          <div style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 3 }}>{student.rollNo ? `Roll No. ${student.rollNo} · ` : ""}{course?.name || "—"}</div>
          {student.signatureData && <img src={student.signatureData} alt="Signature" style={{ height: 28, marginTop: 8 }} />}
        </div>
      </div>
      <SummarySection title="Personal" printable={printable}>
        <SummaryRow label="Full Name" value={student.name} />
        <SummaryRow label="Gender" value={student.gender} />
        <SummaryRow label="Date of Birth" value={student.dob} />
        <SummaryRow label="Marital Status" value={student.maritalStatus} />
        <SummaryRow label="Category" value={student.category || student.caste} />
        <SummaryRow label="Email" value={student.email} />
        <SummaryRow label="Phone" value={student.phone} />
        <SummaryRow label="Emergency Mobile" value={student.emergencyMobile} />
        <SummaryRow label="WhatsApp No." value={student.whatsapp} />
        <SummaryRow label="Aadhar Number" value={student.aadhar} />
        <SummaryRow label="How did you know about SPVM?" value={student.howKnow} />
      </SummarySection>
      <SummarySection title="Address" printable={printable}>
        <SummaryRow label="Permanent Address" value={student.permanentAddress || student.address} />
        <SummaryRow label="City" value={student.city} />
        <SummaryRow label="State" value={student.state} />
        <SummaryRow label="PIN Code" value={student.pinCode} />
        <SummaryRow label="State of Domicile" value={student.stateDomicile} />
        <SummaryRow label="Correspondence Address" value={student.addressType === "different" ? student.currentAddress : "Same as Permanent"} />
      </SummarySection>
      <SummarySection title="Family" printable={printable}>
        <SummaryRow label="Father's Name" value={[student.fatherFirstMiddle, student.fatherLastName].filter(Boolean).join(" ")} />
        <SummaryRow label="Father's Phone" value={student.fatherPhone} />
        <SummaryRow label="Father's Occupation" value={`${student.fatherOccupation || "—"}${student.fatherOrg ? ` · ${student.fatherOrg}` : ""}`} />
        <SummaryRow label="Mother's Name" value={[student.motherFirstMiddle, student.motherLastName].filter(Boolean).join(" ")} />
        <SummaryRow label="Mother's Phone" value={student.motherPhone} />
        <SummaryRow label="Mother's Occupation" value={`${student.motherOccupation || "—"}${student.motherOrg ? ` · ${student.motherOrg}` : ""}`} />
        <SummaryRow label="Guardian" value={student.guardianName} />
        <SummaryRow label="Guardian Mobile" value={student.guardianMobile} />
      </SummarySection>
      <SummarySection title="Educational Background" printable={printable}>
        <SummaryRow label="Last Institution" value={student.lastInstitution || student.qualification} />
        <SummaryRow label="Passing Year" value={student.lastExamYear} />
        <SummaryRow label="Percentage" value={student.lastExamPercentage || student.percentage} />
        <SummaryRow label="Result" value={student.resultStatus} />
        <SummaryRow label="Gap in Study" value={student.gapInStudy} />
        <SummaryRow label="Lateral Entry" value={student.lateralEntry} />
      </SummarySection>
      <SummarySection title="Course Applied For" printable={printable}>
        <SummaryRow label="Course Group" value={student.courseGroup} />
        <SummaryRow label="Course" value={course?.name} />
        <SummaryRow label="Admission Fee" value={student.amount ? `₹${Number(student.amount).toLocaleString("en-IN")}` : "—"} />
        <SummaryRow label="Medium" value={student.medium} />
        <SummaryRow label="Remarks" value={student.remarks} />
      </SummarySection>
      {student.extraFields && Object.keys(student.extraFields).length > 0 && (
        <SummarySection title="Additional Information" printable={printable}>
          {Object.entries(student.extraFields).map(([k, v]) => (
            <SummaryRow key={k} label={k} value={String(v)} />
          ))}
        </SummarySection>
      )}
      {academicDetails && academicDetails.length > 0 && (
        <div className={printable ? "" : "card"} style={{ marginBottom: 16 }}>
          <div className={printable ? "" : "card-body"}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Academic Details</div>
            <table className="ledger">
              <thead><tr><th>S.No.</th><th>Name</th><th>Board / University</th><th>Passing Year</th><th>Grade</th><th>Subject</th></tr></thead>
              <tbody>
                {academicDetails.map((r) => (
                  <tr key={r.id}>
                    <td className="num">{r.sno}</td><td>{r.name}</td><td>{r.board}</td>
                    <td>{r.passingYear}</td><td>{r.grade || "—"}</td><td>{r.subject || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {documents && documents.length > 0 && (
        <div className={printable ? "" : "card"} style={{ marginBottom: 16 }}>
          <div className={printable ? "" : "card-body"}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Documents</div>
            <table className="ledger">
              <thead><tr><th>S.No.</th><th>Document</th><th>Type</th><th>Document No.</th><th>File</th></tr></thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td className="num">{d.sno}</td><td>{d.documentType}</td><td>{d.originalPhotocopy}</td>
                    <td>{d.documentNo || "—"}</td>
                    <td>
                      {!printable && (
                        <a href={`${API_BASE}/documents/${d.id}/file?token=${encodeURIComponent(getAuthToken() || "")}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--maroon)", fontWeight: 600, fontSize: 12.5 }}>
                          View {d.fileName}
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================== RESULT CARD (grades view for student/faculty) ============================== */

function ResultCard({ student, course, grades }) {
  const [semFilter, setSemFilter] = useState("All");
  const semesters = Array.from(new Set(grades.map((g) => g.semester))).sort((a, b) => a - b);
  const filtered = semFilter === "All" ? grades : grades.filter((g) => String(g.semester) === String(semFilter));
  const totalObtained = filtered.reduce((sum, g) => sum + Number(g.marks || 0), 0);
  const totalMax = filtered.reduce((sum, g) => sum + Number(g.maxMarks || 0), 0);
  const overallPct = totalMax ? Math.round((totalObtained / totalMax) * 1000) / 10 : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        {student.photoData ? (
          <img src={student.photoData} alt={student.name} style={{ width: 84, height: 84, borderRadius: 6, objectFit: "cover", border: "1px solid var(--border)" }} />
        ) : (
          <div style={{ width: 84, height: 84, borderRadius: 6, background: "var(--gold-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: "var(--ink)" }}>{student.name?.[0] || "?"}</div>
        )}
        <div style={{ flex: 1, minWidth: 180 }}>
          <h2 style={{ fontSize: 20 }}>{student.name}</h2>
          <div style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 3 }}>{student.rollNo ? `Roll No. ${student.rollNo} · ` : ""}{course?.name || "—"}</div>
        </div>
        {semesters.length > 1 && (
          <div style={{ minWidth: 170 }}>
            <label>Semester</label>
            <select value={semFilter} onChange={(e) => setSemFilter(e.target.value)}>
              <option value="All">All Semesters</option>
              {semesters.map((s) => <option key={s} value={s}>Semester {s}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13.5 }}>
          <SummaryRow label="Father's Name" value={[student.fatherFirstMiddle, student.fatherLastName].filter(Boolean).join(" ")} />
          <SummaryRow label="Mother's Name" value={[student.motherFirstMiddle, student.motherLastName].filter(Boolean).join(" ")} />
        </div>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="card-body"><EmptyState icon={<Award size={28} />} title="No results published" note="Grades will appear here once entered by faculty." /></div>
        ) : (
          <table className="ledger">
            <thead><tr><th>Semester</th><th>Subject</th><th>Exam Type</th><th>Marks Obtained</th><th>Max Marks</th><th>%</th></tr></thead>
            <tbody>
              {filtered.map((g) => (
                <tr key={g.id}>
                  <td className="num">Sem {g.semester}</td>
                  <td>{g.subject}</td>
                  <td>{g.examType}</td>
                  <td className="num">{g.marks}</td>
                  <td className="num">{g.maxMarks}</td>
                  <td className="num">{g.maxMarks ? Math.round((g.marks / g.maxMarks) * 1000) / 10 : "—"}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ fontWeight: 700, background: "#FBF9F4" }}>Total</td>
                <td className="num" style={{ fontWeight: 700, background: "#FBF9F4" }}>{totalObtained}</td>
                <td className="num" style={{ fontWeight: 700, background: "#FBF9F4" }}>{totalMax}</td>
                <td className="num" style={{ fontWeight: 700, background: "#FBF9F4" }}>{overallPct === null ? "—" : `${overallPct}%`}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

function PaymentGatewaySelector({ paymentsConfig, actions }) {
  const [busy, setBusy] = useState(null); // which provider is currently being switched to, or null
  const [err, setErr] = useState("");
  const provider = paymentsConfig?.provider || "none";
  const razorpay = paymentsConfig?.razorpay || { configured: false };
  const payu = paymentsConfig?.payu || { configured: false };

  const select = async (next) => {
    setErr(""); setBusy(next);
    try { await actions.setPaymentProvider(next); }
    catch (e) { setErr(e.message || "Could not update the payment gateway."); }
    setBusy(null);
  };

  const GatewayCard = ({ id, label, hint, configured }) => {
    const active = provider === id;
    return (
      <div
        style={{
          flex: 1, minWidth: 220, border: `1.5px solid ${active ? "var(--success)" : "var(--border)"}`,
          borderRadius: 6, padding: "14px 16px", background: active ? "var(--success-bg)" : "var(--paper)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>{label}</div>
          {active && <span className="seal seal-approved" style={{ fontSize: 10 }}><CheckCircle size={11} /> Active</span>}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
          {configured ? hint : "Not set up — add API keys to the server's .env first."}
        </div>
        <button
          className={`btn btn-sm ${active ? "btn-ghost" : "btn-outline"}`}
          onClick={() => select(active ? "none" : id)}
          disabled={!configured || busy === id}
          style={{ width: "100%", justifyContent: "center" }}
        >
          {busy === id ? "Updating…" : active ? "Turn Off" : "Use " + label}
        </button>
      </div>
    );
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body">
        <div className="eyebrow" style={{ marginBottom: 4 }}>Online Payment Gateway</div>
        <p style={{ fontSize: 12, color: "var(--slate)", marginTop: 4, marginBottom: 14 }}>
          Only one gateway can be active at a time. Selecting one automatically turns the other off.
          {provider === "none" && <span style={{ color: "var(--warn)", fontWeight: 600 }}> Currently off — students only see the cash/offline payment flow.</span>}
        </p>
        {err && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: 4, fontSize: 12.5, marginBottom: 12 }}>{err}</div>}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <GatewayCard id="razorpay" label="Razorpay" hint="Cards, UPI, netbanking via a popup — works out of the box, even on localhost." configured={razorpay.configured} />
          <GatewayCard id="payu" label="PayU Money" hint="Redirects to PayU's payment page. Needs your server reachable from the internet." configured={payu.configured} />
        </div>
      </div>
    </div>
  );
}

function FeeReminderTrigger({ actions }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  const trigger = async () => {
    setBusy(true); setErr(""); setResult(null);
    try {
      const r = await actions.sendFeeReminders();
      setResult(r.sent);
    } catch (e) {
      setErr(e.message || "Could not send reminders.");
    }
    setBusy(false);
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>Fee Due Reminders</div>
          <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 2 }}>
            Runs automatically once a day for anyone with a balance due within 30 days (dashboard notification + email). Use this to send right now instead of waiting.
            {result !== null && <span style={{ color: "var(--success)", fontWeight: 600 }}> Just sent {result} reminder{result === 1 ? "" : "s"}.</span>}
            {err && <span style={{ color: "var(--danger)", fontWeight: 600 }}> {err}</span>}
          </div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={trigger} disabled={busy}>
          <Bell size={13} /> {busy ? "Sending…" : "Send Reminders Now"}
        </button>
      </div>
    </div>
  );
}

function PaymentReceiptModal({ transaction: t, student, course, onClose }) {
  return (
    <Modal title="Payment Receipt" onClose={onClose} width={520}>
      <div className="print-area">
        <div style={{ textAlign: "center", marginBottom: 18, paddingBottom: 16, borderBottom: "2px solid var(--ink)" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><CollegeMark /></div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17 }}>{COLLEGE_NAME}</div>
          <div className="eyebrow" style={{ marginTop: 6 }}>Fee Payment Receipt</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, fontSize: 13, marginBottom: 16 }}>
          <SummaryRow label="Receipt / Transaction ID" value={t.id} />
          <SummaryRow label="Date" value={fmtDate(t.date)} />
          <SummaryRow label="Student Name" value={student?.name} />
          <SummaryRow label="Roll No." value={student?.rollNo || "—"} />
          <SummaryRow label="Course" value={course?.name || "—"} />
          <SummaryRow label="Payment Type" value={t.paymentType} />
          <SummaryRow label="Payment Mode" value={t.paymentMode} />
          <SummaryRow label="Recorded By" value={`${t.recordedByName}${t.recordedByRole ? ` (${t.recordedByRole})` : ""}`} />
          {t.gateway && <SummaryRow label="Payment Gateway" value={t.gateway.charAt(0).toUpperCase() + t.gateway.slice(1)} />}
          {t.gatewayPaymentId && <SummaryRow label="Gateway Payment ID" value={t.gatewayPaymentId} />}
          {t.paymentMode === "EMI" && <SummaryRow label="Installment Amount" value={`₹${Number(t.installmentAmount || 0).toLocaleString("en-IN")}`} />}
        </div>
        {t.additionalFees && t.additionalFees.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Fee Breakdown</div>
            {t.feeAmount > 0 && <SummaryRow label="Base Fee" value={`₹${Number(t.feeAmount).toLocaleString("en-IN")}`} />}
            {t.additionalFees.map((f, i) => <SummaryRow key={i} label={f.label} value={`₹${Number(f.amount).toLocaleString("en-IN")}`} />)}
          </div>
        )}
        <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Amount Paid</span>
          <span style={{ fontWeight: 700, fontSize: 22, fontFamily: "var(--font-display)", color: "var(--success)" }}>₹{Number(t.totalAmount).toLocaleString("en-IN")}</span>
        </div>
      </div>
      <div className="no-print" style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={() => window.print()}><Printer size={14} /> Print / Save PDF</button>
      </div>
    </Modal>
  );
}

function PayOnlineModal({ student, fee, actions, onClose }) {
  const balance = Math.max(0, (fee?.totalFee || 0) - (fee?.paid || 0));
  const hasPlan = !!fee?.plan;
  const [amount, setAmount] = useState(hasPlan ? fee.plan.installmentAmount : balance);
  const [mode, setMode] = useState(hasPlan ? "EMI" : "Single");
  const [tenure, setTenure] = useState(6);
  const [err, setErr] = useState("");
  const [paying, setPaying] = useState(false);

  // EMIs are always equal installments — keep the amount in sync with the
  // chosen tenure (new plan) or the existing plan's fixed installment,
  // rather than letting it drift from what the backend will actually record.
  useEffect(() => {
    if (hasPlan) { setAmount(fee.plan.installmentAmount); return; }
    if (mode === "EMI") setAmount(Math.round(balance / (Number(tenure) || 1)));
    else setAmount(balance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tenure, hasPlan, balance]);

  const emiAmountLocked = mode === "EMI";

  const pay = async () => {
    setErr("");
    const amt = Number(amount);
    if (!amt || amt <= 0) { setErr("Enter a valid amount."); return; }
    if (amt > balance) { setErr(`Amount can't exceed your outstanding balance of ₹${balance.toLocaleString("en-IN")}.`); return; }
    setPaying(true);
    try {
      await actions.payFeeOnline({
        studentId: student.id,
        feeAmount: amt,
        additionalFees: [],
        totalAmount: amt,
        paymentMode: mode,
        planTotalAmount: mode === "EMI" && !hasPlan ? balance : undefined,
        tenureMonths: mode === "EMI" && !hasPlan ? Number(tenure) : undefined,
      });
      onClose();
    } catch (e) {
      setErr(e.message || "Payment could not be completed.");
    }
    setPaying(false);
  };

  return (
    <Modal title="Pay Fees Online" onClose={onClose}>
      {err && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 14 }}>{err}</div>}
      <div style={{ marginBottom: 14, fontSize: 13.5 }}>
        Outstanding balance: <b>₹{balance.toLocaleString("en-IN")}</b>
      </div>
      {!hasPlan && (
        <div style={{ marginBottom: 14 }}>
          <label>Payment Mode</label>
          <Segmented options={["Single", "EMI"]} value={mode} onChange={setMode} />
        </div>
      )}
      {mode === "EMI" && !hasPlan && (
        <>
          <Field label="Number of Installments" inputProps={{ type: "number", min: 2, max: 24, value: tenure, onChange: (e) => setTenure(e.target.value) }} />
          <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: -6, marginBottom: 14 }}>
            {tenure > 0 && `${tenure} equal installments of ₹${Math.round(balance / tenure).toLocaleString("en-IN")} each.`}
          </p>
        </>
      )}
      {hasPlan && <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: -6, marginBottom: 14 }}>You're on an EMI plan — this pays your next installment.</p>}
      <Field label="Amount to Pay (₹)" inputProps={{ type: "number", value: amount, onChange: (e) => setAmount(e.target.value), max: balance, disabled: emiAmountLocked, readOnly: emiAmountLocked }} />
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onClose} disabled={paying}>Cancel</button>
        <button className="btn btn-primary" onClick={pay} disabled={paying || balance <= 0}>
          {paying ? "Opening Payment…" : `Pay ₹${Number(amount || 0).toLocaleString("en-IN")} with Razorpay`}
        </button>
      </div>
    </Modal>
  );
}

function StepIndicator({ step, labels }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 22, overflowX: "auto" }} className="erp-scrollbar">
      {labels.map((l, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <Fragment key={l}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 76 }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 700,
                background: done ? "var(--success)" : current ? "var(--maroon)" : "var(--paper)",
                color: done || current ? "#fff" : "var(--slate)",
                border: `1.5px solid ${done ? "var(--success)" : current ? "var(--maroon)" : "var(--border)"}`,
              }}>
                {done ? <CheckCircle size={15} /> : n}
              </div>
              <div style={{ fontSize: 10.5, marginTop: 5, color: current ? "var(--ink)" : "var(--slate)", fontWeight: current ? 700 : 500, textAlign: "center" }}>{l}</div>
            </div>
            {n < labels.length && <div style={{ flex: 1, height: 2, minWidth: 20, background: done ? "var(--success)" : "var(--border)", marginBottom: 16 }} />}
          </Fragment>
        );
      })}
    </div>
  );
}

const STEP_LABELS = ["Basic Info", "Personal Details", "Address", "Family Details", "Education & Course", "Academic Details", "Documents"];
const DOCUMENT_TYPES = [
  "10th Marksheet", "12th Marksheet", "Graduation Marksheet", "Graduation Certificate",
  "Transfer Certificate", "Migration Certificate", "Character Certificate",
  "Aadhar Card", "Category Certificate", "Income Certificate", "Photo", "Signature", "Other",
];

function AdmissionForm({ courses, existingEmails, resumeStudent, resumeAcademic, resumeDocuments, resumeFeePaid, paymentsConfig, onSaveStep, onFinalSubmit, onSaveAcademic, onUploadDocument, onDeleteDocument, onPayNow, onExit }) {
  const blank = {
    firstName: "", firstNameHi: "", middleName: "", middleNameHi: "", lastName: "", lastNameHi: "",
    gender: "Male", email: "", phone: "", howKnow: "", emergencyMobile: "", whatsapp: "", aadhar: "",
    password: "", confirm: "",
    dob: "", maritalStatus: "Unmarried", spouseName: "", spousePhone: "", caste: "General",
    photoData: "", photoName: "", signatureData: "", signatureName: "",
    permanentAddress: "", contactNo: "", mobileNo: "", country: "India", state: "", city: "", pinCode: "",
    stateDomicile: "", addressType: "same", currentAddress: "", currentCity: "", currentState: "", currentPinCode: "",
    fatherFirstMiddle: "", fatherFirstMiddleHi: "", fatherLastName: "", fatherLastNameHi: "", fatherPhone: "",
    fatherEmail: "", fatherOccupation: "Govt.", fatherOrg: "", fatherPost: "",
    motherFirstMiddle: "", motherFirstMiddleHi: "", motherLastName: "", motherLastNameHi: "", motherPhone: "",
    motherEmail: "", motherOccupation: "Govt.", motherOrg: "", motherPost: "",
    guardianName: "", guardianRelation: "", guardianPhoneResi: "", guardianMobile: "",
    lastInstitution: "", lastExamYear: "", lastExamPercentage: "", resultStatus: "Pass", gapInStudy: "No",
    lateralEntry: "No", courseGroup: "Graduation", courseId: "", amount: "", medium: "English", remarks: "",
  };
  const [f, setF] = useState({ ...blank, ...(resumeStudent || {}), confirm: resumeStudent?.password || "" });
  const [step, setStep] = useState(resumeStudent?.savedUpTo ? Math.min(7, resumeStudent.savedUpTo + 1) : 1);
  const [draftId, setDraftId] = useState(resumeStudent?.id || null);
  const [savedUpTo, setSavedUpTo] = useState(resumeStudent?.savedUpTo || 0);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [fileErr, setFileErr] = useState({ photo: "", signature: "" });

  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setDirty(true); setJustSaved(false); };
  const setV = (k, v) => { setF({ ...f, [k]: v }); setDirty(true); setJustSaved(false); };

  const handleFile = (e, kind) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    const maxBytes = kind === "photo" ? 512 * 1024 : 25 * 1024;
    if (!allowed.includes(file.type)) { setFileErr({ ...fileErr, [kind]: "Only JPG, JPEG or PNG files are allowed." }); return; }
    if (file.size > maxBytes) { setFileErr({ ...fileErr, [kind]: `File must be less than ${kind === "photo" ? "512KB" : "25KB"}.` }); return; }
    setFileErr({ ...fileErr, [kind]: "" });
    const reader = new FileReader();
    reader.onload = () => { setF((prev) => ({ ...prev, [`${kind}Data`]: reader.result, [`${kind}Name`]: file.name })); setDirty(true); setJustSaved(false); };
    reader.readAsDataURL(file);
  };

  const blankAcademicRow = () => ({ localId: uid("arow"), name: "", board: "", passingYear: "", grade: "", subject: "" });
  const [academicRows, setAcademicRows] = useState(
    resumeAcademic && resumeAcademic.length ? resumeAcademic.map((r) => ({ ...r, localId: r.id })) : [blankAcademicRow()]
  );
  const addAcademicRow = () => { setAcademicRows((prev) => [...prev, blankAcademicRow()]); setDirty(true); setJustSaved(false); };
  const removeAcademicRow = (localId) => { setAcademicRows((prev) => prev.length > 1 ? prev.filter((r) => r.localId !== localId) : prev); setDirty(true); setJustSaved(false); };
  const updateAcademicRow = (localId, field, value) => {
    setAcademicRows((prev) => prev.map((r) => r.localId === localId ? { ...r, [field]: value } : r));
    setDirty(true); setJustSaved(false);
  };

  const blankDocumentRow = () => ({ localId: uid("drow"), id: null, documentType: "", originalPhotocopy: "Original", documentNo: "", fileName: "", uploading: false, docErr: "" });
  const [documentRows, setDocumentRows] = useState(
    resumeDocuments && resumeDocuments.length ? resumeDocuments.map((d) => ({ ...d, localId: d.id, uploading: false, docErr: "" })) : [blankDocumentRow()]
  );
  const addDocumentRow = () => setDocumentRows((prev) => [...prev, blankDocumentRow()]);
  const removeDocumentRow = async (localId) => {
    const row = documentRows.find((r) => r.localId === localId);
    if (row?.id && onDeleteDocument) { try { await onDeleteDocument(row.id); } catch { /* best-effort */ } }
    setDocumentRows((prev) => prev.length > 1 ? prev.filter((r) => r.localId !== localId) : prev);
  };
  const updateDocumentRow = (localId, field, value) => {
    setDocumentRows((prev) => prev.map((r) => r.localId === localId ? { ...r, [field]: value } : r));
  };
  const handleDocumentFile = async (localId, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
    if (!allowed.includes(file.type)) { updateDocumentRow(localId, "docErr", "Only JPG, JPEG, PNG, or GIF files are allowed."); return; }
    if (file.size > 5 * 1024 * 1024) { updateDocumentRow(localId, "docErr", "File must be less than 5MB."); return; }
    const row = documentRows.find((r) => r.localId === localId);
    if (!row.documentType) { updateDocumentRow(localId, "docErr", "Select a document type first."); return; }
    setDocumentRows((prev) => prev.map((r) => r.localId === localId ? { ...r, uploading: true, docErr: "" } : r));
    try {
      const sno = documentRows.findIndex((r) => r.localId === localId) + 1;
      const created = await onUploadDocument(draftId, { sno, documentType: row.documentType, originalPhotocopy: row.originalPhotocopy, documentNo: row.documentNo }, file);
      setDocumentRows((prev) => prev.map((r) => r.localId === localId ? { ...r, ...created, localId, uploading: false, docErr: "" } : r));
    } catch (ex) {
      setDocumentRows((prev) => prev.map((r) => r.localId === localId ? { ...r, uploading: false, docErr: ex.message || "Upload failed." } : r));
    }
  };

  const [paidNow, setPaidNow] = useState(!!resumeFeePaid);
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState("");
  const [declAccepted, setDeclAccepted] = useState(false);
  const [declTruth, setDeclTruth] = useState(false);

  const payAdmissionFee = async () => {
    setPayErr(""); setPaying(true);
    try {
      await onPayNow({ studentId: draftId, feeAmount: Number(f.amount) || 0, additionalFees: [], totalAmount: Number(f.amount) || 0, paymentMode: "Single" });
      setPaidNow(true);
    } catch (ex) {
      setPayErr(ex.message || "Payment could not be completed.");
    }
    setPaying(false);
  };

  const validateStep = (s) => {
    if (s === 1) {
      if (!f.firstName.trim() || !f.lastName.trim() || !f.email.trim() || !f.phone.trim() || !f.howKnow || !f.emergencyMobile.trim())
        return "Please complete all required fields.";
      if (!EMAIL_RE.test(f.email.trim())) return "Please enter a valid email address.";
      if (!PHONE_RE.test(f.phone.trim())) return "Phone number must be exactly 10 digits.";
      if (!PHONE_RE.test(f.emergencyMobile.trim())) return "Emergency mobile number must be exactly 10 digits.";
      if (f.whatsapp.trim() && !PHONE_RE.test(f.whatsapp.trim())) return "WhatsApp number must be exactly 10 digits.";
      if (f.aadhar.trim() && !AADHAR_RE.test(f.aadhar.trim())) return "Aadhar number must be exactly 12 digits.";
      if (existingEmails.includes(f.email.trim().toLowerCase())) return "An account with this email already exists. Please sign in instead.";
      if (f.password.length < 6) return "Password must be at least 6 characters.";
      if (f.password !== f.confirm) return "Passwords do not match.";
      return "";
    }
    if (s === 2) {
      if (!f.dob) return "Please enter your date of birth.";
      const d = new Date(f.dob);
      if (isNaN(d.getTime()) || d > new Date()) return "Please enter a valid date of birth.";
      if (f.maritalStatus === "Married" && (!f.spouseName.trim() || !f.spousePhone.trim())) return "Please enter spouse name and phone number.";
      if (f.spousePhone.trim() && !PHONE_RE.test(f.spousePhone.trim())) return "Spouse phone number must be exactly 10 digits.";
      if (fileErr.photo || fileErr.signature) return "Please fix the file upload errors before continuing.";
      return "";
    }
    if (s === 3) {
      if (!f.permanentAddress.trim() || !f.contactNo.trim() || !f.mobileNo.trim() || !f.country.trim() || !f.state || !f.city.trim() || !f.pinCode.trim() || !f.stateDomicile)
        return "Please complete all required address fields.";
      if (!PHONE_RE.test(f.contactNo.trim())) return "Contact number must be exactly 10 digits.";
      if (!PHONE_RE.test(f.mobileNo.trim())) return "Mobile number must be exactly 10 digits.";
      if (!PIN_RE.test(f.pinCode.trim())) return "PIN code must be exactly 6 digits.";
      if (f.addressType === "different") {
        if (!f.currentAddress.trim() || !f.currentCity.trim() || !f.currentState || !f.currentPinCode.trim())
          return "Please complete all current address fields.";
        if (!PIN_RE.test(f.currentPinCode.trim())) return "Current address PIN code must be exactly 6 digits.";
      }
      return "";
    }
    if (s === 4) {
      if (!f.fatherFirstMiddle.trim() || !f.fatherLastName.trim() || !f.fatherPhone.trim() || !f.fatherOccupation || !f.fatherOrg.trim())
        return "Please complete all required father's details.";
      if (!PHONE_RE.test(f.fatherPhone.trim())) return "Father's phone number must be exactly 10 digits.";
      if (!f.motherFirstMiddle.trim() || !f.motherLastName.trim() || !f.motherPhone.trim() || !f.motherOccupation || !f.motherOrg.trim())
        return "Please complete all required mother's details.";
      if (!PHONE_RE.test(f.motherPhone.trim())) return "Mother's phone number must be exactly 10 digits.";
      return "";
    }
    if (s === 5) {
      if (!f.lastExamYear.trim() || !f.lastExamPercentage.trim() || !f.resultStatus || !f.courseGroup || !f.courseId || !f.medium)
        return "Please complete all required fields and select a course.";
      if (!/^\d{4}$/.test(f.lastExamYear.trim())) return "Please enter a valid 4-digit passing year.";
      return "";
    }
    if (s === 6) {
      const complete = academicRows.filter((r) => r.name.trim() && r.board.trim() && r.passingYear.trim());
      if (complete.length === 0) return "Add at least one academic record with Name, Board/University, and Passing Year filled in.";
      return "";
    }
    if (s === 7) {
      if (documentRows.some((r) => r.uploading)) return "Please wait for the current upload to finish.";
      if (documentRows.some((r) => r.docErr)) return "Please fix the upload error before continuing.";
      if (!declAccepted || !declTruth) return "Please accept both declarations below before continuing.";
      return "";
    }
    return "";
  };

  const buildSnapshot = () => {
    const fullName = [f.firstName.trim(), f.middleName.trim(), f.lastName.trim()].filter(Boolean).join(" ");
    return {
      ...f,
      name: fullName,
      email: f.email.trim().toLowerCase(),
      phone: f.phone.trim(),
      address: f.permanentAddress.trim(),
      category: f.caste,
      qualification: f.lastInstitution.trim() || "—",
      percentage: f.lastExamPercentage.trim(),
    };
  };

  const doSave = async () => {
    const e = validateStep(step);
    if (e) { setErr(e); setJustSaved(false); return false; }
    setErr(""); setSaving(true);
    try {
      if (step === 6) {
        const rows = academicRows.filter((r) => r.name.trim() || r.board.trim() || r.subject.trim())
          .map((r) => ({ name: r.name, board: r.board, passingYear: r.passingYear, grade: r.grade, subject: r.subject }));
        const saved = await onSaveAcademic(draftId, rows);
        if (saved?.rows) setAcademicRows(saved.rows.map((r) => ({ ...r, localId: r.id })));
      } else {
        const newId = await onSaveStep(buildSnapshot(), step, draftId);
        if (newId && !draftId) setDraftId(newId);
      }
      setSavedUpTo((prev) => Math.max(prev, step));
      setDirty(false);
      setJustSaved(true);
    } catch (ex) {
      setErr(ex.message || "Something went wrong while saving. Please try again.");
      setSaving(false);
      return false;
    }
    setSaving(false);
    return true;
  };

  const goNext = () => {
    if (dirty || savedUpTo < step) { setErr("Please save this step before continuing — click \"Save Step\" first."); return; }
    setErr(""); setStep((s) => Math.min(7, s + 1)); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goBack = () => { setErr(""); setStep((s) => Math.max(1, s - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const submitFinal = async () => {
    const e = validateStep(7);
    if (e) { setErr(e); return; }
    setErr(""); setSaving(true);
    try {
      const snap = buildSnapshot();
      const newId = await onSaveStep(snap, 7, draftId);
      const finalId = draftId || newId;
      await onFinalSubmit(snap, finalId);
    } catch (ex) {
      setErr(ex.message || "Something went wrong while submitting. Please try again.");
    }
    setSaving(false);
  };

  const groupCourses = courses.filter((c) => (c.group || "Graduation") === f.courseGroup);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="eyebrow">Form No. ADM-{new Date().getFullYear()}</div>
            <h2 style={{ fontSize: 20, marginTop: 4 }}>Application for Admission</h2>
          </div>
          <CollegeMark />
        </div>
        <div className="card-body">
          <StepIndicator step={step} labels={STEP_LABELS} />
          {err && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "9px 12px", borderRadius: 4, fontSize: 13, marginBottom: 16 }}>{err}</div>}
          {!err && justSaved && <div style={{ background: "var(--success-bg)", color: "var(--success)", padding: "9px 12px", borderRadius: 4, fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}><CheckCircle size={14} /> Step saved. You can continue to the next step.</div>}

          {step === 1 && (
            <>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Basic Information</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <HiField label="First Name" required value={f.firstName} onChange={(v) => setV("firstName", v)} hiValue={f.firstNameHi} onHiChange={(v) => setV("firstNameHi", v)} />
                <HiField label="Middle Name" value={f.middleName} onChange={(v) => setV("middleName", v)} hiValue={f.middleNameHi} onHiChange={(v) => setV("middleNameHi", v)} />
                <HiField label="Last Name" required value={f.lastName} onChange={(v) => setV("lastName", v)} hiValue={f.lastNameHi} onHiChange={(v) => setV("lastNameHi", v)} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label>Gender *</label>
                <Segmented options={["Male", "Female", "Transgender"]} value={f.gender} onChange={(v) => setV("gender", v)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Email Address *" inputProps={{ type: "email", value: f.email, onChange: set("email"), placeholder: "you@example.com", disabled: !!draftId }} />
                <Field label="Phone Number *" inputProps={{ value: f.phone, onChange: set("phone"), placeholder: "10-digit mobile" }} />
                <Field label="How did you know about SPVM? *" as="select" selectProps={{ value: f.howKnow, onChange: set("howKnow") }}>
                  <option value="">Select an option</option>
                  {HOW_KNOW_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                </Field>
                <Field label="Emergency Mobile No. *" inputProps={{ value: f.emergencyMobile, onChange: set("emergencyMobile"), placeholder: "10-digit mobile" }} />
                <Field label="WhatsApp No." inputProps={{ value: f.whatsapp, onChange: set("whatsapp"), placeholder: "10-digit mobile" }} />
                <Field label="Aadhar Number" inputProps={{ value: f.aadhar, onChange: set("aadhar"), placeholder: "12-digit UID" }} />
              </div>
              <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Create Portal Login</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Password *" inputProps={{ type: "password", value: f.password, onChange: set("password"), disabled: !!draftId }} />
                <Field label="Confirm Password *" inputProps={{ type: "password", value: f.confirm, onChange: set("confirm"), disabled: !!draftId }} />
              </div>
              {draftId && <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: -6 }}>Email and password are locked once your first step is saved. Use "Edit Profile" after admission to change your password.</div>}
            </>
          )}

          {step === 2 && (
            <>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Personal Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Date of Birth *" inputProps={{ type: "date", value: f.dob, onChange: set("dob") }} />
                <div>
                  <label>Marital Status *</label>
                  <Segmented options={["Unmarried", "Married"]} value={f.maritalStatus} onChange={(v) => setV("maritalStatus", v)} />
                </div>
              </div>
              {f.maritalStatus === "Married" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <Field label="Spouse Name *" inputProps={{ value: f.spouseName, onChange: set("spouseName") }} />
                  <Field label="Spouse Phone Number *" inputProps={{ value: f.spousePhone, onChange: set("spousePhone") }} />
                </div>
              )}
              <div style={{ marginBottom: 18 }}>
                <label>Caste Category *</label>
                <Segmented options={["General", "OBC", "SC", "ST", "EWS"]} value={f.caste} onChange={(v) => setV("caste", v)} />
              </div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Uploads</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <FileUploadField label="Photo" hint="JPG / JPEG / PNG, under 512KB" value={f.photoData} fileName={f.photoName} onChange={(e) => handleFile(e, "photo")} error={fileErr.photo} />
                <FileUploadField label="Signature" hint="JPG / JPEG / PNG, under 25KB" value={f.signatureData} fileName={f.signatureName} onChange={(e) => handleFile(e, "signature")} error={fileErr.signature} />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Permanent Address</div>
              <Field label="Permanent Address *" as="textarea" inputProps={{ value: f.permanentAddress, onChange: set("permanentAddress") }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Contact No. *" inputProps={{ value: f.contactNo, onChange: set("contactNo") }} />
                <Field label="Mobile No. *" inputProps={{ value: f.mobileNo, onChange: set("mobileNo") }} />
                <Field label="Country *" inputProps={{ value: f.country, onChange: set("country") }} />
                <Field label="State *" as="select" selectProps={{ value: f.state, onChange: set("state") }}>
                  <option value="">Select State</option>
                  {INDIA_STATES.map((s) => <option key={s}>{s}</option>)}
                </Field>
                <Field label="City *" inputProps={{ value: f.city, onChange: set("city") }} />
                <Field label="PIN Code *" inputProps={{ value: f.pinCode, onChange: set("pinCode") }} />
                <Field label="State of Domicile *" as="select" selectProps={{ value: f.stateDomicile, onChange: set("stateDomicile") }}>
                  <option value="">Select State</option>
                  {INDIA_STATES.map((s) => <option key={s}>{s}</option>)}
                </Field>
              </div>

              <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Correspondence Address</div>
              <Segmented
                options={["Same as Permanent Address", "Different (Current) Address"]}
                value={f.addressType === "same" ? "Same as Permanent Address" : "Different (Current) Address"}
                onChange={(v) => setV("addressType", v === "Same as Permanent Address" ? "same" : "different")}
              />
              {f.addressType === "different" && (
                <div style={{ marginTop: 14 }}>
                  <Field label="Current Address *" as="textarea" inputProps={{ value: f.currentAddress, onChange: set("currentAddress") }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                    <Field label="City *" inputProps={{ value: f.currentCity, onChange: set("currentCity") }} />
                    <Field label="State *" as="select" selectProps={{ value: f.currentState, onChange: set("currentState") }}>
                      <option value="">Select State</option>
                      {INDIA_STATES.map((s) => <option key={s}>{s}</option>)}
                    </Field>
                    <Field label="PIN Code *" inputProps={{ value: f.currentPinCode, onChange: set("currentPinCode") }} />
                  </div>
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Father's Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <HiField label="Father's First & Middle Name" required value={f.fatherFirstMiddle} onChange={(v) => setV("fatherFirstMiddle", v)} hiValue={f.fatherFirstMiddleHi} onHiChange={(v) => setV("fatherFirstMiddleHi", v)} />
                <HiField label="Father's Last Name" required value={f.fatherLastName} onChange={(v) => setV("fatherLastName", v)} hiValue={f.fatherLastNameHi} onHiChange={(v) => setV("fatherLastNameHi", v)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Father's Phone No. *" inputProps={{ value: f.fatherPhone, onChange: set("fatherPhone") }} />
                <Field label="Father's Email ID" inputProps={{ type: "email", value: f.fatherEmail, onChange: set("fatherEmail") }} />
                <Field label="Father's Occupation *" as="select" selectProps={{ value: f.fatherOccupation, onChange: set("fatherOccupation") }}>
                  {OCCUPATIONS.map((o) => <option key={o}>{o}</option>)}
                </Field>
                <Field label="Father's Organization *" inputProps={{ value: f.fatherOrg, onChange: set("fatherOrg") }} />
                <Field label="Father's Post" inputProps={{ value: f.fatherPost, onChange: set("fatherPost") }} />
              </div>

              <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Mother's Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <HiField label="Mother's First & Middle Name" required value={f.motherFirstMiddle} onChange={(v) => setV("motherFirstMiddle", v)} hiValue={f.motherFirstMiddleHi} onHiChange={(v) => setV("motherFirstMiddleHi", v)} />
                <HiField label="Mother's Last Name" required value={f.motherLastName} onChange={(v) => setV("motherLastName", v)} hiValue={f.motherLastNameHi} onHiChange={(v) => setV("motherLastNameHi", v)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Mother's Phone No. *" inputProps={{ value: f.motherPhone, onChange: set("motherPhone") }} />
                <Field label="Mother's Email ID" inputProps={{ type: "email", value: f.motherEmail, onChange: set("motherEmail") }} />
                <Field label="Mother's Occupation *" as="select" selectProps={{ value: f.motherOccupation, onChange: set("motherOccupation") }}>
                  {OCCUPATIONS.map((o) => <option key={o}>{o}</option>)}
                </Field>
                <Field label="Mother's Organization *" inputProps={{ value: f.motherOrg, onChange: set("motherOrg") }} />
                <Field label="Mother's Post" inputProps={{ value: f.motherPost, onChange: set("motherPost") }} />
              </div>

              <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Guardian (optional)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Guardian Name" inputProps={{ value: f.guardianName, onChange: set("guardianName") }} />
                <Field label="Relationship with Student" inputProps={{ value: f.guardianRelation, onChange: set("guardianRelation") }} />
                <Field label="Guardian Phone (Resi.)" inputProps={{ value: f.guardianPhoneResi, onChange: set("guardianPhoneResi") }} />
                <Field label="Guardian Mobile No." inputProps={{ value: f.guardianMobile, onChange: set("guardianMobile") }} />
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Educational Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Last Institution Attended" inputProps={{ value: f.lastInstitution, onChange: set("lastInstitution"), placeholder: "School / College / University name" }} />
                <Field label="Last Exam Passed Out Year *" inputProps={{ value: f.lastExamYear, onChange: set("lastExamYear"), placeholder: "e.g. 2024" }} />
                <Field label="Last Exam Percentage *" inputProps={{ value: f.lastExamPercentage, onChange: set("lastExamPercentage"), placeholder: "e.g. 78%" }} />
                <Field label="Result of Qualifying Exam *" as="select" selectProps={{ value: f.resultStatus, onChange: set("resultStatus") }}>
                  <option>Pass</option><option>Supplementary</option><option>Result Awaited</option>
                </Field>
              </div>
              <div style={{ display: "flex", gap: 28, marginBottom: 18, flexWrap: "wrap" }}>
                <div><label>Gap Between Study</label><Segmented options={["No", "Yes"]} value={f.gapInStudy} onChange={(v) => setV("gapInStudy", v)} /></div>
                <div><label>Lateral Entry</label><Segmented options={["No", "Yes"]} value={f.lateralEntry} onChange={(v) => setV("lateralEntry", v)} /></div>
                <div><label>Medium *</label><Segmented options={["English", "Hindi"]} value={f.medium} onChange={(v) => setV("medium", v)} /></div>
              </div>

              <div className="eyebrow" style={{ marginBottom: 10 }}>Course Selection *</div>
              <div style={{ marginBottom: 14, maxWidth: 260 }}>
                <label>Course Group</label>
                <select value={f.courseGroup} onChange={(e) => { setF({ ...f, courseGroup: e.target.value, courseId: "", amount: "" }); setDirty(true); setJustSaved(false); }}>
                  {COURSE_GROUPS.map((g) => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div className="card" style={{ marginBottom: 18 }}>
                <table className="ledger">
                  <thead><tr><th>S.No.</th><th>Course</th><th>Admission Fee</th><th>Priority</th><th style={{ textAlign: "center" }}>Select</th></tr></thead>
                  <tbody>
                    {groupCourses.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--slate)", padding: 20 }}>No courses currently offered in this group.</td></tr>
                    ) : groupCourses.map((c, i) => (
                      <tr key={c.id}>
                        <td className="num">{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td className="num">₹{Number(c.admissionFee ?? c.fee).toLocaleString("en-IN")}</td>
                        <td><input type="number" min="1" style={{ width: 64 }} placeholder="—" /></td>
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="radio" name="course-select" checked={f.courseId === c.id}
                            onChange={() => { setF({ ...f, courseId: c.id, amount: c.admissionFee ?? c.fee }); setDirty(true); setJustSaved(false); }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Amount *" inputProps={{ value: f.amount ? `₹${Number(f.amount).toLocaleString("en-IN")}` : "", readOnly: true, placeholder: "Auto-filled on course selection" }} />
              </div>
              <Field label="Remarks" as="textarea" inputProps={{ value: f.remarks, onChange: set("remarks") }} />
            </>
          )}

          {step === 6 && (
            <>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Academic Details</div>
              <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: -4, marginBottom: 14 }}>
                Add every qualifying exam you've passed (e.g. 10th, 12th, Graduation) — one row each.
              </p>
              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ overflowX: "auto" }}>
                  <table className="ledger">
                    <thead><tr>
                      <th>S.No.</th><th>Name *</th><th>Board / University *</th><th>Passing Year *</th><th>Grade</th><th>Subject</th><th></th>
                    </tr></thead>
                    <tbody>
                      {academicRows.map((r, i) => (
                        <tr key={r.localId}>
                          <td className="num">{i + 1}</td>
                          <td><input value={r.name} onChange={(e) => updateAcademicRow(r.localId, "name", e.target.value)} placeholder="e.g. 10th, 12th, B.A." style={{ minWidth: 120 }} /></td>
                          <td><input value={r.board} onChange={(e) => updateAcademicRow(r.localId, "board", e.target.value)} placeholder="e.g. CBSE, RBSE" style={{ minWidth: 140 }} /></td>
                          <td><input value={r.passingYear} onChange={(e) => updateAcademicRow(r.localId, "passingYear", e.target.value)} placeholder="e.g. 2023" style={{ minWidth: 90 }} /></td>
                          <td><input value={r.grade} onChange={(e) => updateAcademicRow(r.localId, "grade", e.target.value)} placeholder="e.g. A1, 78%" style={{ minWidth: 90 }} /></td>
                          <td><input value={r.subject} onChange={(e) => updateAcademicRow(r.localId, "subject", e.target.value)} placeholder="e.g. Science" style={{ minWidth: 110 }} /></td>
                          <td><button className="btn btn-ghost btn-sm" onClick={() => removeAcademicRow(r.localId)} disabled={academicRows.length === 1}><Trash2 size={13} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={addAcademicRow}><Plus size={13} /> Add More Details</button>
            </>
          )}

          {step === 7 && (
            <>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Documents</div>
              <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: -4, marginBottom: 14 }}>
                Upload scanned copies of your documents (JPG, JPEG, PNG, or GIF, under 5MB each). Uploading here is optional — you may also be asked to submit hard copies at the college.
              </p>
              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ overflowX: "auto" }}>
                  <table className="ledger">
                    <thead><tr>
                      <th>S.No.</th><th>Document *</th><th>Original / Photocopy</th><th>Document No.</th><th>Upload</th><th></th>
                    </tr></thead>
                    <tbody>
                      {documentRows.map((r, i) => (
                        <tr key={r.localId}>
                          <td className="num">{i + 1}</td>
                          <td>
                            <select value={r.documentType} onChange={(e) => updateDocumentRow(r.localId, "documentType", e.target.value)} style={{ minWidth: 150 }}>
                              <option value="">Select</option>
                              {DOCUMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
                            </select>
                          </td>
                          <td>
                            <select value={r.originalPhotocopy} onChange={(e) => updateDocumentRow(r.localId, "originalPhotocopy", e.target.value)}>
                              <option>Original</option><option>Photocopy</option>
                            </select>
                          </td>
                          <td><input value={r.documentNo} onChange={(e) => updateDocumentRow(r.localId, "documentNo", e.target.value)} placeholder="Optional" style={{ minWidth: 110 }} /></td>
                          <td>
                            <label className="btn btn-ghost btn-sm" style={{ display: "inline-flex", cursor: "pointer" }}>
                              <UploadCloud size={13} />
                              {r.uploading ? "Uploading…" : r.fileName ? "Replace" : "Choose File"}
                              <input type="file" accept="image/jpeg,image/jpg,image/png,image/gif" style={{ display: "none" }} onChange={(e) => handleDocumentFile(r.localId, e)} disabled={r.uploading} />
                            </label>
                            {r.fileName && <div style={{ fontSize: 11, color: "var(--success)", marginTop: 4 }}>✓ {r.fileName}</div>}
                            {r.docErr && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>{r.docErr}</div>}
                          </td>
                          <td><button className="btn btn-ghost btn-sm" onClick={() => removeDocumentRow(r.localId)} disabled={documentRows.length === 1}><Trash2 size={13} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={addDocumentRow}><Plus size={13} /> Add More Details</button>

              <div className="eyebrow" style={{ margin: "22px 0 10px" }}>Admission Fee Payment</div>
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="card-body">
                  {payErr && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 12 }}>{payErr}</div>}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>Admission Fee: ₹{Number(f.amount || 0).toLocaleString("en-IN")}</div>
                      <div style={{ fontSize: 12, color: "var(--slate)", marginTop: 2 }}>
                        {paidNow
                          ? "Payment received — thank you."
                          : "Optional at this stage. You can also pay later from your Fees page after your account is approved."}
                      </div>
                    </div>
                    {paidNow ? (
                      <span className="seal seal-approved"><CheckCircle size={12} /> Paid</span>
                    ) : paymentsConfig?.available ? (
                      <button className="btn btn-primary" onClick={payAdmissionFee} disabled={paying || !f.amount}>
                        <Wallet size={14} /> {paying ? "Opening Payment…" : "Pay Now"}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--slate)" }}>Online payment isn't available right now.</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="eyebrow" style={{ marginBottom: 10 }}>घोषणा (Declaration)</div>
              <div className="card" style={{ marginBottom: 10 }}>
                <div className="card-body" style={{ fontSize: 13, lineHeight: 1.7 }}>
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", marginBottom: 14 }}>
                    <input type="checkbox" checked={declAccepted} onChange={(e) => setDeclAccepted(e.target.checked)} style={{ width: "auto", marginTop: 3 }} />
                    <span>
                      मैंने महाविद्यालय की प्रवेश नीति एवं नियमों को पढ़ लिया है तथा मुझे यह स्वीकार्य है। मैं महाविद्यालय के समस्त नियमों का पालन करूंगा/करूंगी तथा महाविद्यालय की संपत्ति को कोई क्षति नहीं पहुंचाऊंगा/पहुंचाऊंगी।
                      <br /><span style={{ color: "var(--slate)", fontSize: 11.5 }}>I have read and accept the college's admission policy and rules, and will abide by them.</span>
                    </span>
                  </label>
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="checkbox" checked={declTruth} onChange={(e) => setDeclTruth(e.target.checked)} style={{ width: "auto", marginTop: 3 }} />
                    <span>
                      मैं घोषणा करता/करती हूँ कि इस प्रार्थना पत्र में दी गई समस्त जानकारी सत्य एवं सही है। यदि कोई जानकारी असत्य पाई जाती है, तो महाविद्यालय मेरा प्रवेश निरस्त करने का अधिकार रखता है।
                      <br /><span style={{ color: "var(--slate)", fontSize: 11.5 }}>I declare that all information in this application is true and correct. The college may cancel my admission if any information is found false.</span>
                    </span>
                  </label>
                </div>
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "space-between" }}>
            <button className="btn btn-ghost" onClick={step === 1 ? onExit : goBack} disabled={saving}>{step === 1 ? "Exit" : "Back"}</button>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-outline" onClick={doSave} disabled={saving || (!dirty && savedUpTo >= step)}>
                {saving ? "Saving…" : "Save Step"}
              </button>
              {step < 7 ? (
                <button className="btn btn-primary" onClick={goNext} disabled={saving}>Next <ChevronRight size={14} /></button>
              ) : (
                <button className="btn btn-primary" onClick={submitFinal} disabled={saving}><FileText size={14} /> {saving ? "Submitting…" : "Submit Application"}</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== LOGIN ============================== */

function LoginScreen({ onLogin, onGoToAdmission, prefillEmail }) {
  const [tab, setTab] = useState("student");
  const [form, setForm] = useState({ id: prefillEmail || "", password: "" });
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const switchTab = (nextTab) => {
    setTab(nextTab);
    setForm({ id: nextTab === "student" && prefillEmail ? prefillEmail : "", password: "" });
    setErr("");
  };

  const submit = async () => {
    setErr("");
    const id = form.id.trim();
    if (!id || !form.password) { setErr("Please enter both your login ID and password."); return; }
    if (tab !== "admin" && !EMAIL_RE.test(id)) { setErr("Please enter a valid email address."); return; }

    setSubmitting(true);
    try {
      await onLogin(tab, id, form.password);
    } catch (e) {
      setErr(e.message || "Sign in failed. Please try again.");
    }
    setSubmitting(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ display: "inline-flex" }}><CollegeMark /></div>
        </div>
        <div className="card">
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
            {[["student", "Student"], ["teacher", "Staff"], ["admin", "Administrator"]].map(([k, l]) => (
              <button key={k} className={`tab-btn ${tab === k ? "active" : ""}`} style={{ flex: 1 }} onClick={() => switchTab(k)}>{l}</button>
            ))}
          </div>
          <div className="card-body">
            {err && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 14 }}>{err}</div>}
            <Field label={tab === "admin" ? "Username" : "Email Address"} inputProps={{
              value: form.id, onChange: (e) => setForm({ ...form, id: e.target.value }),
              placeholder: tab === "admin" ? "admin" : "you@example.com"
            }} />
            <Field label="Password" inputProps={{
              type: "password", value: form.password, onChange: (e) => setForm({ ...form, password: e.target.value }),
              onKeyDown: (e) => e.key === "Enter" && submit(),
            }} />
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} onClick={submit} disabled={submitting}>
              <Lock size={14} /> {submitting ? "Signing In…" : "Sign In"}
            </button>
            {tab === "admin" && (
              <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 10, textAlign: "center" }}>
                Demo credentials &mdash; admin / admin123
              </div>
            )}
            {tab === "student" && (
              <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--slate)" }}>
                New applicant?{" "}
                <span style={{ color: "var(--maroon)", fontWeight: 600, cursor: "pointer" }} onClick={onGoToAdmission}>
                  Apply for Admission
                </span>
              </div>
            )}
            {tab === "teacher" && (
              <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--slate)" }}>
                Faculty accounts are created by the Administrator.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== PORTAL SHELL ============================== */

function PortalShell({ roleLabel, userName, navItems, active, onNav, onLogout, children }) {
  const [navOpen, setNavOpen] = useState(false);
  const handleNav = (key) => { onNav(key); setNavOpen(false); };
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <button className="erp-hamburger" aria-label="Toggle navigation" onClick={() => setNavOpen((v) => !v)}>
        <Menu size={18} />
      </button>
      {navOpen && <div className="erp-backdrop open" onClick={() => setNavOpen(false)} />}
      <div style={{
        width: 232, background: "var(--ink)", flexShrink: 0, display: "flex",
        flexDirection: "column", position: "sticky", top: 0, height: "100vh",
      }} className={`erp-sidebar ${navOpen ? "open" : ""}`}>
        <div style={{ padding: "22px 18px" }}><CollegeMark light /></div>
        <div style={{ padding: "0 16px 8px" }}>
          <span className={`badge-role badge-${roleLabel.toLowerCase() === "administrator" ? "admin" : roleLabel.toLowerCase() === "faculty" ? "teacher" : "student"}`}>{roleLabel}</span>
        </div>
        <div style={{ flex: 1, marginTop: 8 }}>
          {navItems.map((n) => (
            <div key={n.key} className={`nav-item ${active === n.key ? "active" : ""}`} onClick={() => handleNav(n.key)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 11 }}>{n.icon}{n.label}</span>
              {!!n.count && (
                <span style={{
                  background: "var(--danger)", color: "#fff", borderRadius: 999,
                  minWidth: 18, height: 18, padding: "0 5px", fontSize: 11, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{n.count > 99 ? "99+" : n.count}</span>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: 16, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{userName}</div>
          <button className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center", color: "#fff", borderColor: "rgba(255,255,255,0.25)" }} onClick={onLogout}>
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </div>
      <div className="erp-main-content" style={{ flex: 1, minWidth: 0, background: "var(--parchment)", minHeight: "100vh", overflowX: "auto" }}>
        <div style={{ padding: "28px 32px", maxWidth: 1180 }}>{children}</div>
      </div>
    </div>
  );
}

function SectionHeader({ eyebrow, title, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2 style={{ fontSize: 24, marginTop: 4 }}>{title}</h2>
      </div>
      {action}
    </div>
  );
}

/* ============================== ADMIN PORTAL ============================== */

function AdminPortal({ user, store, actions, onLogout }) {
  const [page, setPage] = useState("overview");
  const { students, teachers, courses, notices, fees } = store;
  const isSuperAdmin = user.role === "super_admin";
  const perms = user.permissions || [];
  const has = (key) => isSuperAdmin || perms.includes(key);

  const allNav = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard size={16} /> },
    { key: "admissions", label: "Admissions Registry", icon: <UserPlus size={16} /> },
    { key: "students", label: "Students", icon: <GraduationCap size={16} /> },
    { key: "teachers", label: "Faculty & Staff", icon: <Users size={16} /> },
    { key: "courses", label: "Courses", icon: <BookOpen size={16} /> },
    { key: "fees", label: "Fees", icon: <Wallet size={16} /> },
    { key: "reports", label: "Reports", icon: <FileText size={16} /> },
    { key: "notices", label: "Notices", icon: <Bell size={16} /> },
  ];
  const nav = allNav.filter((n) => has(n.key));
  if (isSuperAdmin) nav.push({ key: "settings", label: "Staff Accounts", icon: <Lock size={16} /> });
  // Nav is already filtered by permission, so a restricted Admin can never
  // click into a page they don't have — this just covers the rare edge
  // case where permissions changed mid-session and the current page is no
  // longer in the (now smaller) allowed list.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!nav.some((n) => n.key === page) && nav.length > 0) setPage(nav[0].key);
  }, [nav.map((n) => n.key).join(",")]);

  const approvedStudents = students.filter((s) => (s.status || "").toLowerCase() === "approved");
  const pendingStudents = students.filter((s) => (s.status || "").toLowerCase() === "pending");
  const totalCollected = Object.values(fees).reduce((sum, f) => sum + (f.paid || 0), 0);

  return (
    <PortalShell roleLabel={isSuperAdmin ? "Super Admin" : "Administrator"} userName={user.name || "Administrator"} navItems={nav} active={page} onNav={setPage} onLogout={onLogout}>
      {page === "overview" && (
        <>
          <SectionHeader eyebrow="Dashboard" title="Institution Overview" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
            <StatCard icon={<GraduationCap size={22} />} value={approvedStudents.length} label="Enrolled Students" />
            <StatCard icon={<Clock size={22} />} value={pendingStudents.length} label="Pending Admissions" accent="var(--warn)" />
            <StatCard icon={<Users size={22} />} value={teachers.length} label="Faculty Members" />
            <StatCard icon={<Wallet size={22} />} value={`₹${totalCollected.toLocaleString("en-IN")}`} label="Fees Collected" accent="var(--success)" />
          </div>
          <div className="card">
            <div className="card-header"><h3 style={{ fontSize: 16 }}>Recent Notices</h3></div>
            <div className="card-body">
              {notices.length === 0 ? <EmptyState icon={<Bell size={30} />} title="No notices yet" note="Post one from the Notices tab." /> :
                notices.slice(0, 5).map((n) => (
                  <div key={n.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: "var(--slate)" }}>{fmtDate(n.date)} &middot; {n.postedByName}</div>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      {page === "admissions" && <AdmissionsRegistry students={students} courses={courses} actions={actions} academicDetails={store.academicDetails} documents={store.documents} />}
      {page === "students" && <StudentsDirectory students={approvedStudents} courses={courses} store={store} actions={actions} canImport />}
      {page === "teachers" && <FacultyDirectory teachers={teachers} students={students} actions={actions} />}
      {page === "courses" && <CoursesManager courses={courses} students={students} actions={actions} />}
      {page === "fees" && <FeesManager students={approvedStudents} courses={courses} fees={fees} actions={actions} role="admin" paymentsConfig={store.paymentsConfig} transactions={store.transactions} />}
      {page === "reports" && <ReportsCenter store={store} />}
      {page === "notices" && <NoticesBoard notices={notices} actions={actions} poster={{ id: "admin", name: "Administrator", role: "admin" }} canDelete />}
      {page === "settings" && isSuperAdmin && <AdminAccountsManager actions={actions} />}
    </PortalShell>
  );
}

const ALL_MODULES = ["overview", "admissions", "students", "teachers", "courses", "fees", "reports", "notices", "attendance", "grades", "hr", "settings"];
const MODULE_LABELS = {
  overview: "Overview", admissions: "Admissions Registry", students: "Students",
  teachers: "Faculty & Staff", courses: "Courses", fees: "Fees", reports: "Reports",
  notices: "Notices", attendance: "Attendance", grades: "Grades", hr: "HR", settings: "Staff Accounts (Super Admin only)",
};

function AdminAccountsManager({ actions }) {
  const [admins, setAdmins] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [editingPermsFor, setEditingPermsFor] = useState(null);
  const [f, setF] = useState({ name: "", username: "", password: "" });

  const load = async () => {
    try { setAdmins(await actions.listAdmins()); }
    catch (e) { setErr(e.message || "Could not load admin accounts."); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/set-state-in-effect

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setErr("");
    if (!f.name.trim() || !f.username.trim() || f.password.length < 6) {
      setErr("Name, username, and a password of at least 6 characters are required."); return;
    }
    try {
      await actions.createAdmin({ name: f.name.trim(), username: f.username.trim(), password: f.password });
      setF({ name: "", username: "", password: "" });
      setOpen(false);
      load();
    } catch (e) {
      setErr(e.message || "Could not create this admin account.");
    }
  };

  const toggleStatus = async (a) => {
    await actions.updateAdmin(a.id, { status: a.status === "active" ? "inactive" : "active" });
    load();
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete admin account "${a.name}"? This cannot be undone.`)) return;
    try { await actions.deleteAdmin(a.id); load(); }
    catch (e) { alert(e.message || "Could not delete this account."); }
  };

  if (admins === null) return <div className="card"><div className="card-body"><EmptyState icon={<Lock size={28} />} title="Loading…" note="" /></div></div>;

  return (
    <>
      <SectionHeader eyebrow="Super Admin" title="Staff Accounts" action={<button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={14} /> Add Admin</button>} />
      {err && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 14 }}>{err}</div>}
      <div className="card">
        <table className="ledger">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Permissions</th><th></th></tr></thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td style={{ fontWeight: 600 }}>{a.name}</td>
                <td>{a.username}</td>
                <td><span className="seal" style={{ fontSize: 10.5 }}>{a.role === "super_admin" ? "Super Admin" : "Admin"}</span></td>
                <td>
                  {a.role === "super_admin" ? <span style={{ fontSize: 11, color: "var(--slate)" }}>—</span> : (
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleStatus(a)} style={{ color: a.status === "active" ? "var(--success)" : "var(--slate)", fontWeight: 700, fontSize: 11 }}>
                      {a.status === "active" ? "Active" : "Inactive"}
                    </button>
                  )}
                </td>
                <td style={{ fontSize: 11.5, color: "var(--slate)" }}>
                  {a.role === "super_admin" ? "All (unrestricted)" : a.permissions ? `${a.permissions.length} of ${ALL_MODULES.length} modules` : "All (unrestricted)"}
                </td>
                <td>
                  {a.role !== "super_admin" && (
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingPermsFor(a)}><Lock size={13} /> Permissions</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(a)}><Trash2 size={13} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="Add Admin Account" onClose={() => setOpen(false)}>
          <Field label="Full Name *" inputProps={{ value: f.name, onChange: set("name") }} />
          <Field label="Username (login) *" inputProps={{ value: f.username, onChange: set("username") }} />
          <Field label="Password *" inputProps={{ type: "password", value: f.password, onChange: set("password") }} />
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginTop: -6 }}>New admins start unrestricted (full access). Restrict specific modules afterward via "Permissions".</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit}>Create Admin</button>
          </div>
        </Modal>
      )}

      {editingPermsFor && (
        <AdminPermissionsModal
          admin={editingPermsFor}
          actions={actions}
          onClose={() => setEditingPermsFor(null)}
          onSaved={() => { setEditingPermsFor(null); load(); }}
        />
      )}
    </>
  );
}

function AdminPermissionsModal({ admin, actions, onClose, onSaved }) {
  const [unrestricted, setUnrestricted] = useState(!admin.permissions);
  const [selected, setSelected] = useState(new Set(admin.permissions || ALL_MODULES));
  const [err, setErr] = useState("");

  const toggle = (m) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(m) ? next.delete(m) : next.add(m);
    return next;
  });

  const save = async () => {
    setErr("");
    try {
      await actions.updateAdminPermissions(admin.id, unrestricted ? null : Array.from(selected));
      onSaved();
    } catch (e) {
      setErr(e.message || "Could not save permissions.");
    }
  };

  return (
    <Modal title={`Permissions — ${admin.name}`} onClose={onClose}>
      {err && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 14 }}>{err}</div>}
      <label style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={unrestricted} onChange={(e) => setUnrestricted(e.target.checked)} style={{ width: "auto" }} />
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>Unrestricted (full access to everything)</span>
      </label>
      {!unrestricted && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {ALL_MODULES.filter((m) => m !== "settings").map((m) => (
            <label key={m} style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={selected.has(m)} onChange={() => toggle(m)} style={{ width: "auto" }} />
              {MODULE_LABELS[m]}
            </label>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save Permissions</button>
      </div>
    </Modal>
  );
}

function AdmissionsRegistry({ students, courses, actions, academicDetails, documents }) {
  const [filter, setFilter] = useState("pending");
  const [courseFilter, setCourseFilter] = useState("All");
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [viewingId, setViewingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);

  const list = students.filter((s) => (s.status || "").toLowerCase() === filter).filter((s) => courseFilter === "All" || s.courseId === courseFilter);
  const courseName = (id) => courses.find((c) => c.id === id)?.name || "—";

  const changeFilter = (f) => { setFilter(f); setSelected(new Set()); };
  const changeCourseFilter = (id) => { setCourseFilter(id); setSelected(new Set()); };

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allVisibleSelected = list.length > 0 && list.every((s) => selected.has(s.id));
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(list.map((s) => s.id)));

  const bulkDelete = () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected application${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    actions.deleteStudents(Array.from(selected));
    setSelected(new Set());
  };

  const viewingStudent = viewingId ? students.find((s) => s.id === viewingId) : null;
  const editingStudent = editingId ? students.find((s) => s.id === editingId) : null;

  return (
    <>
      <SectionHeader
        eyebrow="Registry" title="Admissions"
        action={<button className="btn btn-outline" onClick={() => setImporting(true)}><UploadCloud size={14} /> Import CSV</button>}
      />
      <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["pending", "approved", "rejected"].map((f) => (
            <button key={f} className={`tab-btn ${filter === f ? "active" : ""}`} onClick={() => changeFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)} ({students.filter((s) => (s.status || "").toLowerCase() === f).length})
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", minWidth: 220 }}>
          <select value={courseFilter} onChange={(e) => changeCourseFilter(e.target.value)}>
            <option value="All">All Courses</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="card" style={{ marginBottom: 14, background: "var(--danger-bg)", borderColor: "var(--danger)" }}>
          <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>{selected.size} selected</span>
            <button className="btn btn-danger btn-sm" onClick={bulkDelete}><Trash2 size={13} /> Delete Selected</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear Selection</button>
          </div>
        </div>
      )}

      <div className="card">
        {list.length === 0 ? (
          <div className="card-body"><EmptyState icon={<UserPlus size={30} />} title={`No ${filter} applications`} note="New submissions will appear here." /></div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="ledger">
              <thead><tr>
                <th style={{ width: 34 }}><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /></th>
                <th>Applicant</th><th>Course</th><th>Qualification</th><th>Contact</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)} /></td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {s.photoData ? (
                          <img src={s.photoData} alt={s.name} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)" }} />
                        ) : (
                          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--gold-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>
                            {s.name?.[0] || "?"}
                          </div>
                        )}
                        <div><div style={{ fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: 11.5, color: "var(--slate)" }}>{s.category} &middot; {fmtDate(s.appliedAt)}</div></div>
                      </div>
                    </td>
                    <td>{courseName(s.courseId)}</td>
                    <td>{s.qualification} ({s.percentage})</td>
                    <td style={{ fontSize: 12.5 }}>{s.email}<br />{s.phone}</td>
                    <td><Seal status={s.status} /></td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setViewingId(s.id)}><Eye size={13} /> View</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(s.id)}><Pencil size={13} /> Edit</button>
                        {(s.status || "").toLowerCase() === "pending" && (
                          <>
                            <button className="btn btn-success btn-sm" onClick={() => actions.approveStudent(s.id)}><CheckCircle size={13} /> Approve</button>
                            <button className="btn btn-danger btn-sm" onClick={() => { setRejecting(s.id); setReason(""); }}><XCircle size={13} /> Reject</button>
                          </>
                        )}
                        {(s.status || "").toLowerCase() === "approved" && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--ink)", alignSelf: "center" }}>{s.rollNo}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejecting && (
        <Modal title="Reject Application" onClose={() => setRejecting(null)}>
          <Field label="Reason (optional)" as="textarea" inputProps={{ value: reason, onChange: (e) => setReason(e.target.value), placeholder: "e.g. Incomplete documentation" }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => setRejecting(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={() => { actions.rejectStudent(rejecting, reason); setRejecting(null); }}>Confirm Rejection</button>
          </div>
        </Modal>
      )}

      {viewingStudent && (
        <Modal title="Application Details" onClose={() => setViewingId(null)} width={760}>
          <ModalErrorBoundary>
            <ApplicationSummary
              student={viewingStudent} course={courses.find((c) => c.id === viewingStudent.courseId)}
              academicDetails={academicDetails?.[viewingStudent.id] || []} documents={documents?.[viewingStudent.id] || []}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setViewingId(null)}>Close</button>
              {(viewingStudent.status || "").toLowerCase() === "pending" && (
                <>
                  <button className="btn btn-danger" onClick={() => { setViewingId(null); setRejecting(viewingStudent.id); setReason(""); }}><XCircle size={14} /> Reject</button>
                  <button className="btn btn-success" onClick={() => { actions.approveStudent(viewingStudent.id); setViewingId(null); }}><CheckCircle size={14} /> Approve</button>
                </>
              )}
            </div>
          </ModalErrorBoundary>
        </Modal>
      )}

      {editingStudent && (
        <ModalErrorBoundary>
          <EditApplicationModal student={editingStudent} courses={courses} actions={actions} onClose={() => setEditingId(null)} />
        </ModalErrorBoundary>
      )}

      {importing && (
        <CsvImportModal
          title="Import Students / Admissions (CSV)"
          hint="Upload a CSV of students or applicants. Columns like Name, Email, Phone, Course, etc. map automatically. Any column that doesn't match a known field (e.g. Blood Group, Bus Route) is kept as additional info on the student record instead of being discarded. Existing students are matched and updated by email; new emails create new records."
          onClose={() => setImporting(false)}
          onImport={actions.importStudentsCsv}
        />
      )}
    </>
  );
}

function EditApplicationModal({ student, courses, actions, onClose }) {
  const [f, setF] = useState({
    firstName: student.firstName || "", firstNameHi: student.firstNameHi || "",
    middleName: student.middleName || "", middleNameHi: student.middleNameHi || "",
    lastName: student.lastName || "", lastNameHi: student.lastNameHi || "",
    gender: student.gender || "Male", email: student.email || "",
    phone: student.phone || "", emergencyMobile: student.emergencyMobile || "",
    whatsapp: student.whatsapp || "", aadhar: student.aadhar || "", howKnow: student.howKnow || "",

    dob: student.dob || "", maritalStatus: student.maritalStatus || "Unmarried",
    spouseName: student.spouseName || "", spousePhone: student.spousePhone || "",
    caste: student.caste || student.category || "General",
    photoData: student.photoData || "", photoName: student.photoName || "",
    signatureData: student.signatureData || "", signatureName: student.signatureName || "",

    permanentAddress: student.permanentAddress || student.address || "",
    contactNo: student.contactNo || "", mobileNo: student.mobileNo || "",
    country: student.country || "India", state: student.state || "", city: student.city || "",
    pinCode: student.pinCode || "", stateDomicile: student.stateDomicile || "",
    addressType: student.addressType || "same",
    currentAddress: student.currentAddress || "", currentCity: student.currentCity || "",
    currentState: student.currentState || "", currentPinCode: student.currentPinCode || "",

    fatherFirstMiddle: student.fatherFirstMiddle || "", fatherFirstMiddleHi: student.fatherFirstMiddleHi || "",
    fatherLastName: student.fatherLastName || "", fatherLastNameHi: student.fatherLastNameHi || "",
    fatherPhone: student.fatherPhone || "", fatherEmail: student.fatherEmail || "",
    fatherOccupation: student.fatherOccupation || "Govt.", fatherOrg: student.fatherOrg || "", fatherPost: student.fatherPost || "",
    motherFirstMiddle: student.motherFirstMiddle || "", motherFirstMiddleHi: student.motherFirstMiddleHi || "",
    motherLastName: student.motherLastName || "", motherLastNameHi: student.motherLastNameHi || "",
    motherPhone: student.motherPhone || "", motherEmail: student.motherEmail || "",
    motherOccupation: student.motherOccupation || "Govt.", motherOrg: student.motherOrg || "", motherPost: student.motherPost || "",
    guardianName: student.guardianName || "", guardianRelation: student.guardianRelation || "",
    guardianPhoneResi: student.guardianPhoneResi || "", guardianMobile: student.guardianMobile || "",

    lastInstitution: student.lastInstitution || "", lastExamYear: student.lastExamYear || "",
    lastExamPercentage: student.lastExamPercentage || "", resultStatus: student.resultStatus || "Pass",
    gapInStudy: student.gapInStudy || "No", lateralEntry: student.lateralEntry || "No",
    courseGroup: student.courseGroup || courses.find((c) => c.id === student.courseId)?.group || "Graduation",
    courseId: student.courseId || "", medium: student.medium || "English", remarks: student.remarks || "",

    status: student.status || "pending", rollNo: student.rollNo || "", rejectReason: student.rejectReason || "",
  });
  const [err, setErr] = useState("");
  const [fileErr, setFileErr] = useState({ photo: "", signature: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setV = (k, v) => setF({ ...f, [k]: v });
  const groupCourses = courses.filter((c) => (c.group || "Graduation") === f.courseGroup);

  const handleFile = (e, kind) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    const maxBytes = kind === "photo" ? 512 * 1024 : 25 * 1024;
    if (!allowed.includes(file.type)) { setFileErr({ ...fileErr, [kind]: "Only JPG, JPEG or PNG files are allowed." }); return; }
    if (file.size > maxBytes) { setFileErr({ ...fileErr, [kind]: `File must be less than ${kind === "photo" ? "512KB" : "25KB"}.` }); return; }
    setFileErr({ ...fileErr, [kind]: "" });
    const reader = new FileReader();
    reader.onload = () => setF((prev) => ({ ...prev, [`${kind}Data`]: reader.result, [`${kind}Name`]: file.name }));
    reader.readAsDataURL(file);
  };

  const save = () => {
    if (!f.firstName.trim() || !f.lastName.trim() || !f.phone.trim() || !f.emergencyMobile.trim() || !f.courseId) {
      setErr("Please complete all required fields (First Name, Last Name, Phone, Emergency Mobile, Course)."); return;
    }
    if (!PHONE_RE.test(f.phone.trim())) { setErr("Phone number must be exactly 10 digits."); return; }
    if (!PHONE_RE.test(f.emergencyMobile.trim())) { setErr("Emergency mobile must be exactly 10 digits."); return; }
    if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) { setErr("Please enter a valid email address."); return; }
    const name = [f.firstName.trim(), f.middleName.trim(), f.lastName.trim()].filter(Boolean).join(" ");
    const statusChanged = f.status !== (student.status || "pending");
    const { status, rejectReason, ...rest } = f;
    actions.updateStudentProfile(student.id, {
      ...rest, name, category: f.caste,
      email: f.email.trim().toLowerCase(),
      phone: f.phone.trim(), emergencyMobile: f.emergencyMobile.trim(),
      address: f.permanentAddress,
    });
    // Route status changes through the dedicated actions instead of a plain field
    // update — approving/rejecting have side effects (roll number + fee record on
    // approval) that a raw status patch here wouldn't trigger, which would leave
    // an "approved" student with no roll number or fee record.
    if (statusChanged) {
      if (status === "approved") actions.approveStudent(student.id);
      else if (status === "rejected") actions.rejectStudent(student.id, rejectReason);
    }
    onClose();
  };

  return (
    <Modal title={`Edit Application — ${student.name}`} onClose={onClose} width={860}>
      {err && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 14 }}>{err}</div>}

      <div className="eyebrow" style={{ marginBottom: 10 }}>Basic Information</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <HiField label="First Name" required value={f.firstName} onChange={(v) => setV("firstName", v)} hiValue={f.firstNameHi} onHiChange={(v) => setV("firstNameHi", v)} />
        <HiField label="Middle Name" value={f.middleName} onChange={(v) => setV("middleName", v)} hiValue={f.middleNameHi} onHiChange={(v) => setV("middleNameHi", v)} />
        <HiField label="Last Name" required value={f.lastName} onChange={(v) => setV("lastName", v)} hiValue={f.lastNameHi} onHiChange={(v) => setV("lastNameHi", v)} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label>Gender</label>
        <Segmented options={["Male", "Female", "Transgender"]} value={f.gender} onChange={(v) => setV("gender", v)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Email" inputProps={{ type: "email", value: f.email, onChange: set("email") }} />
        <Field label="Phone Number *" inputProps={{ value: f.phone, onChange: set("phone") }} />
        <Field label="Emergency Mobile *" inputProps={{ value: f.emergencyMobile, onChange: set("emergencyMobile") }} />
        <Field label="WhatsApp No." inputProps={{ value: f.whatsapp, onChange: set("whatsapp") }} />
        <Field label="Aadhar Number" inputProps={{ value: f.aadhar, onChange: set("aadhar") }} />
        <Field label="How did you know about SPVM?" as="select" selectProps={{ value: f.howKnow, onChange: set("howKnow") }}>
          <option value="">Select an option</option>
          {HOW_KNOW_OPTIONS.map((o) => <option key={o}>{o}</option>)}
        </Field>
      </div>

      <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Personal Details</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Date of Birth" inputProps={{ type: "date", value: f.dob, onChange: set("dob") }} />
        <div>
          <label>Marital Status</label>
          <Segmented options={["Unmarried", "Married"]} value={f.maritalStatus} onChange={(v) => setV("maritalStatus", v)} />
        </div>
      </div>
      {f.maritalStatus === "Married" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Spouse Name" inputProps={{ value: f.spouseName, onChange: set("spouseName") }} />
          <Field label="Spouse Phone" inputProps={{ value: f.spousePhone, onChange: set("spousePhone") }} />
        </div>
      )}
      <div style={{ marginBottom: 18 }}>
        <label>Category</label>
        <Segmented options={["General", "OBC", "SC", "ST", "EWS"]} value={f.caste} onChange={(v) => setV("caste", v)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <FileUploadField label="Photo" hint="JPG / JPEG / PNG, under 512KB" value={f.photoData} fileName={f.photoName} onChange={(e) => handleFile(e, "photo")} error={fileErr.photo} />
        <FileUploadField label="Signature" hint="JPG / JPEG / PNG, under 25KB" value={f.signatureData} fileName={f.signatureName} onChange={(e) => handleFile(e, "signature")} error={fileErr.signature} />
      </div>

      <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Address</div>
      <Field label="Permanent Address" as="textarea" inputProps={{ value: f.permanentAddress, onChange: set("permanentAddress") }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Contact No." inputProps={{ value: f.contactNo, onChange: set("contactNo") }} />
        <Field label="Mobile No." inputProps={{ value: f.mobileNo, onChange: set("mobileNo") }} />
        <Field label="Country" inputProps={{ value: f.country, onChange: set("country") }} />
        <Field label="State" as="select" selectProps={{ value: f.state, onChange: set("state") }}>
          <option value="">Select State</option>
          {INDIA_STATES.map((s) => <option key={s}>{s}</option>)}
        </Field>
        <Field label="City" inputProps={{ value: f.city, onChange: set("city") }} />
        <Field label="PIN Code" inputProps={{ value: f.pinCode, onChange: set("pinCode") }} />
        <Field label="State of Domicile" as="select" selectProps={{ value: f.stateDomicile, onChange: set("stateDomicile") }}>
          <option value="">Select State</option>
          {INDIA_STATES.map((s) => <option key={s}>{s}</option>)}
        </Field>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label>Correspondence Address</label>
        <Segmented
          options={["Same as Permanent Address", "Different (Current) Address"]}
          value={f.addressType === "same" ? "Same as Permanent Address" : "Different (Current) Address"}
          onChange={(v) => setV("addressType", v === "Same as Permanent Address" ? "same" : "different")}
        />
      </div>
      {f.addressType === "different" && (
        <div style={{ marginBottom: 14 }}>
          <Field label="Current Address" as="textarea" inputProps={{ value: f.currentAddress, onChange: set("currentAddress") }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <Field label="Current City" inputProps={{ value: f.currentCity, onChange: set("currentCity") }} />
            <Field label="Current State" as="select" selectProps={{ value: f.currentState, onChange: set("currentState") }}>
              <option value="">Select State</option>
              {INDIA_STATES.map((s) => <option key={s}>{s}</option>)}
            </Field>
            <Field label="Current PIN Code" inputProps={{ value: f.currentPinCode, onChange: set("currentPinCode") }} />
          </div>
        </div>
      )}

      <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Father's Details</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <HiField label="Father's First & Middle Name" value={f.fatherFirstMiddle} onChange={(v) => setV("fatherFirstMiddle", v)} hiValue={f.fatherFirstMiddleHi} onHiChange={(v) => setV("fatherFirstMiddleHi", v)} />
        <HiField label="Father's Last Name" value={f.fatherLastName} onChange={(v) => setV("fatherLastName", v)} hiValue={f.fatherLastNameHi} onHiChange={(v) => setV("fatherLastNameHi", v)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Father's Phone" inputProps={{ value: f.fatherPhone, onChange: set("fatherPhone") }} />
        <Field label="Father's Email" inputProps={{ type: "email", value: f.fatherEmail, onChange: set("fatherEmail") }} />
        <Field label="Father's Occupation" as="select" selectProps={{ value: f.fatherOccupation, onChange: set("fatherOccupation") }}>
          {OCCUPATIONS.map((o) => <option key={o}>{o}</option>)}
        </Field>
        <Field label="Father's Organization" inputProps={{ value: f.fatherOrg, onChange: set("fatherOrg") }} />
        <Field label="Father's Post" inputProps={{ value: f.fatherPost, onChange: set("fatherPost") }} />
      </div>

      <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Mother's Details</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <HiField label="Mother's First & Middle Name" value={f.motherFirstMiddle} onChange={(v) => setV("motherFirstMiddle", v)} hiValue={f.motherFirstMiddleHi} onHiChange={(v) => setV("motherFirstMiddleHi", v)} />
        <HiField label="Mother's Last Name" value={f.motherLastName} onChange={(v) => setV("motherLastName", v)} hiValue={f.motherLastNameHi} onHiChange={(v) => setV("motherLastNameHi", v)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Mother's Phone" inputProps={{ value: f.motherPhone, onChange: set("motherPhone") }} />
        <Field label="Mother's Email" inputProps={{ type: "email", value: f.motherEmail, onChange: set("motherEmail") }} />
        <Field label="Mother's Occupation" as="select" selectProps={{ value: f.motherOccupation, onChange: set("motherOccupation") }}>
          {OCCUPATIONS.map((o) => <option key={o}>{o}</option>)}
        </Field>
        <Field label="Mother's Organization" inputProps={{ value: f.motherOrg, onChange: set("motherOrg") }} />
        <Field label="Mother's Post" inputProps={{ value: f.motherPost, onChange: set("motherPost") }} />
      </div>

      <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Guardian (optional)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Guardian Name" inputProps={{ value: f.guardianName, onChange: set("guardianName") }} />
        <Field label="Relationship with Student" inputProps={{ value: f.guardianRelation, onChange: set("guardianRelation") }} />
        <Field label="Guardian Phone (Resi.)" inputProps={{ value: f.guardianPhoneResi, onChange: set("guardianPhoneResi") }} />
        <Field label="Guardian Mobile No." inputProps={{ value: f.guardianMobile, onChange: set("guardianMobile") }} />
      </div>

      <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Educational Details</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Last Institution Attended" inputProps={{ value: f.lastInstitution, onChange: set("lastInstitution") }} />
        <Field label="Last Exam Passed Out Year" inputProps={{ value: f.lastExamYear, onChange: set("lastExamYear") }} />
        <Field label="Last Exam Percentage" inputProps={{ value: f.lastExamPercentage, onChange: set("lastExamPercentage") }} />
        <Field label="Result of Qualifying Exam" as="select" selectProps={{ value: f.resultStatus, onChange: set("resultStatus") }}>
          <option>Pass</option><option>Supplementary</option><option>Result Awaited</option>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 28, marginBottom: 18, flexWrap: "wrap" }}>
        <div><label>Gap Between Study</label><Segmented options={["No", "Yes"]} value={f.gapInStudy} onChange={(v) => setV("gapInStudy", v)} /></div>
        <div><label>Lateral Entry</label><Segmented options={["No", "Yes"]} value={f.lateralEntry} onChange={(v) => setV("lateralEntry", v)} /></div>
        <div><label>Medium</label><Segmented options={["English", "Hindi"]} value={f.medium} onChange={(v) => setV("medium", v)} /></div>
      </div>

      <div className="eyebrow" style={{ marginBottom: 10 }}>Course</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Course Group" as="select" selectProps={{ value: f.courseGroup, onChange: (e) => setF({ ...f, courseGroup: e.target.value, courseId: "" }) }}>
          {COURSE_GROUPS.map((g) => <option key={g}>{g}</option>)}
        </Field>
        <Field label="Course *" as="select" selectProps={{ value: f.courseId, onChange: set("courseId") }}>
          <option value="">Select Course</option>
          {groupCourses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Field>
      </div>
      <Field label="Remarks" as="textarea" inputProps={{ value: f.remarks, onChange: set("remarks") }} />

      <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Admissions Status</div>
      <div style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Changing status to Approved or Rejected here works the same as using the Approve/Reject buttons — a roll number and fee record are still created automatically on approval.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Status" as="select" selectProps={{ value: f.status, onChange: set("status") }}>
          <option value="draft">Draft</option><option value="pending">Pending</option>
          <option value="approved">Approved</option><option value="rejected">Rejected</option>
        </Field>
        <Field label="Roll Number" inputProps={{ value: f.rollNo, onChange: set("rollNo"), placeholder: "Only used once approved" }} />
      </div>
      {f.status === "rejected" && (
        <Field label="Rejection Reason" as="textarea" inputProps={{ value: f.rejectReason, onChange: set("rejectReason") }} />
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save Changes</button>
      </div>
    </Modal>
  );
}

function StudentsDirectory({ students, courses, store, actions, canImport }) {
  const [q, setQ] = useState("");
  const [resultFor, setResultFor] = useState(null);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const courseName = (id) => courses.find((c) => c.id === id)?.name || "—";
  const filtered = students.filter((s) => (s.name + s.rollNo).toLowerCase().includes(q.toLowerCase()));
  const resultStudent = resultFor ? students.find((s) => s.id === resultFor) : null;
  const isAdmin = !!canImport;

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allVisibleSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((s) => s.id)));

  const bulkDelete = () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected student${selected.size > 1 ? "s" : ""}? This removes their account and all admission data, and cannot be undone.`)) return;
    actions.deleteStudents(Array.from(selected));
    setSelected(new Set());
  };

  return (
    <>
      <SectionHeader eyebrow="Directory" title="Enrolled Students"
        action={<div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--slate)" }} />
            <input placeholder="Search name or roll no." value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 30, width: 220 }} />
          </div>
          {isAdmin && <button className="btn btn-outline" onClick={() => setImporting(true)}><UploadCloud size={14} /> Import CSV</button>}
        </div>} />

      {isAdmin && selected.size > 0 && (
        <div className="card" style={{ marginBottom: 14, background: "var(--danger-bg)", borderColor: "var(--danger)" }}>
          <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>{selected.size} selected</span>
            <button className="btn btn-danger btn-sm" onClick={bulkDelete}><Trash2 size={13} /> Delete Selected</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear Selection</button>
          </div>
        </div>
      )}

      <div className="card">
        {filtered.length === 0 ? <div className="card-body"><EmptyState icon={<GraduationCap size={30} />} title="No students found" note="Approve applications from the Admissions Registry." /></div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="ledger">
              <thead><tr>
                {isAdmin && <th style={{ width: 34 }}><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /></th>}
                <th>Roll No.</th><th>Name</th><th>Course</th><th>Attendance</th><th>Contact</th><th></th>
              </tr></thead>
              <tbody>
                {filtered.map((s) => {
                  const rec = store.attendance[s.id] || [];
                  const pct = rec.length ? Math.round((rec.filter((r) => r.status === "Present").length / rec.length) * 100) : null;
                  return (
                    <tr key={s.id}>
                      {isAdmin && <td><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)} /></td>}
                      <td className="num">{s.rollNo}</td>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td>{courseName(s.courseId)}</td>
                      <td>{pct === null ? "—" : `${pct}%`}</td>
                      <td style={{ fontSize: 12.5 }}>{s.email}</td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => setResultFor(s.id)}><Eye size={13} /> View Result</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {resultStudent && (
        <Modal title="Result Card" onClose={() => setResultFor(null)} width={760}>
          <ModalErrorBoundary>
            <ResultCard student={resultStudent} course={courses.find((c) => c.id === resultStudent.courseId)} grades={store.grades[resultStudent.id] || []} />
          </ModalErrorBoundary>
        </Modal>
      )}
      {isAdmin && importing && (
        <CsvImportModal
          title="Import Students (CSV)"
          hint="Upload a CSV of students. Columns like Name, Email, Phone, Course, etc. map automatically. Anything else (e.g. Blood Group, Bus Route) is kept as additional info instead of being discarded. Existing students are matched and updated by email; new emails create new records."
          onClose={() => setImporting(false)}
          onImport={actions.importStudentsCsv}
        />
      )}
    </>
  );
}

const STAFF_ROLES = [
  { value: "faculty", label: "Faculty" },
  { value: "hod", label: "HOD" },
  { value: "exam_incharge", label: "Examination Incharge" },
  { value: "accounts", label: "Accounts" },
  { value: "hr", label: "HR" },
];
const roleLabel = (v) => STAFF_ROLES.find((r) => r.value === v)?.label || v;

function FacultyDirectory({ teachers, students, actions, readOnly }) {
  const blank = {
    name: "", email: "", password: "", phone: "", gender: "Male", dob: "",
    qualification: "", experience: "", address: "", joiningDate: "",
    subject: "", department: "", designation: "", role: "faculty", status: "active",
    photoData: "", photoName: "",
  };
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [f, setF] = useState(blank);
  const [err, setErr] = useState("");
  const [photoErr, setPhotoErr] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [roleFilter, setRoleFilter] = useState("All");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const visible = roleFilter === "All" ? teachers : teachers.filter((t) => t.role === roleFilter);
  const allVisibleSelected = visible.length > 0 && visible.every((t) => selected.has(t.id));
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((t) => t.id)));

  const bulkDelete = () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected staff account${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    actions.deleteTeachers(Array.from(selected));
    setSelected(new Set());
  };

  const openAdd = () => { setEditingId(null); setF(blank); setErr(""); setPhotoErr(""); setOpen(true); };
  const openEdit = (t) => {
    setEditingId(t.id);
    setF({ ...blank, ...t, password: "" });
    setErr(""); setPhotoErr(""); setOpen(true);
  };

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowed.includes(file.type)) { setPhotoErr("Only JPG, JPEG or PNG files are allowed."); return; }
    if (file.size > 512 * 1024) { setPhotoErr("File must be less than 512KB."); return; }
    setPhotoErr("");
    const reader = new FileReader();
    reader.onload = () => setF((prev) => ({ ...prev, photoData: reader.result, photoName: file.name }));
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    setErr("");
    if (!f.name.trim() || !f.email.trim() || (!editingId && !f.password) || !f.department.trim() || !f.designation.trim() || !f.role) {
      setErr("Please complete all required fields."); return;
    }
    if (!EMAIL_RE.test(f.email.trim())) { setErr("Please enter a valid email address."); return; }
    if (!editingId && f.password.length < 6) { setErr("Password must be at least 6 characters."); return; }
    const emailLower = f.email.trim().toLowerCase();
    if (!editingId) {
      const clash = teachers.some((t) => t.email.toLowerCase() === emailLower) ||
        (students || []).some((s) => s.email.toLowerCase() === emailLower);
      if (clash) { setErr("An account with this email already exists."); return; }
    }
    try {
      if (editingId) {
        const { password, ...patch } = f;
        await actions.updateTeacher(editingId, { ...patch, name: f.name.trim(), email: emailLower });
      } else {
        await actions.addTeacher({ ...f, name: f.name.trim(), email: emailLower });
      }
      setF(blank);
      setOpen(false);
      setEditingId(null);
    } catch (ex) {
      setErr(ex.message || "Could not save this staff account.");
    }
  };

  return (
    <>
      <SectionHeader
        eyebrow="Staff" title="Faculty & Staff"
        action={<div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ width: 190 }}>
            <option value="All">All Roles</option>
            {STAFF_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {!readOnly && <button className="btn btn-primary" onClick={openAdd}><Plus size={14} /> Add Staff Member</button>}
        </div>}
      />

      {!readOnly && selected.size > 0 && (
        <div className="card" style={{ marginBottom: 14, background: "var(--danger-bg)", borderColor: "var(--danger)" }}>
          <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>{selected.size} selected</span>
            <button className="btn btn-danger btn-sm" onClick={bulkDelete}><Trash2 size={13} /> Delete Selected</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear Selection</button>
          </div>
        </div>
      )}

      <div className="card">
        {visible.length === 0 ? <div className="card-body"><EmptyState icon={<Users size={30} />} title="No staff found" note="Add a faculty or staff account to get started." /></div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="ledger">
              <thead><tr>
                {!readOnly && <th style={{ width: 34 }}><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /></th>}
                <th>Employee ID</th><th>Name</th><th>Role</th><th>Department</th><th>Designation</th>
                <th>Email</th><th>Mobile</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.id}>
                    {!readOnly && <td><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} /></td>}
                    <td className="num" style={{ fontSize: 12 }}>{t.employeeId || "—"}</td>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td><span className="seal" style={{ fontSize: 10.5 }}>{roleLabel(t.role)}</span></td>
                    <td>{t.department || "—"}</td>
                    <td>{t.designation || "—"}</td>
                    <td style={{ fontSize: 12.5 }}>{t.email}</td>
                    <td>{t.phone || "—"}</td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 700, color: t.status === "active" ? "var(--success)" : "var(--slate)" }}>
                        {t.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      {!readOnly && (
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}><Pencil size={13} /></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => actions.removeTeacher(t.id)}><Trash2 size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <Modal title={editingId ? "Edit Staff Member" : "Add Staff Member"} onClose={() => setOpen(false)} width={700}>
          {err && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 14 }}>{err}</div>}

          <div className="eyebrow" style={{ marginBottom: 10 }}>Personal Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Name *" inputProps={{ value: f.name, onChange: set("name") }} />
            <Field label="Employee ID" inputProps={{ value: editingId ? f.employeeId : "Auto-generated on save", disabled: true, style: { color: "var(--slate)" } }} />
            <Field label="Email / Username *" inputProps={{ type: "email", value: f.email, onChange: set("email") }} />
            <Field label="Mobile" inputProps={{ value: f.phone, onChange: set("phone") }} />
            <Field label="Gender" as="select" selectProps={{ value: f.gender, onChange: set("gender") }}>
              <option>Male</option><option>Female</option><option>Transgender</option>
            </Field>
            <Field label="Date of Birth" inputProps={{ type: "date", value: f.dob, onChange: set("dob") }} />
            <Field label="Qualification" inputProps={{ value: f.qualification, onChange: set("qualification"), placeholder: "e.g. LLM, PhD" }} />
            <Field label="Experience" inputProps={{ value: f.experience, onChange: set("experience"), placeholder: "e.g. 8 years" }} />
            <Field label="Joining Date" inputProps={{ type: "date", value: f.joiningDate, onChange: set("joiningDate") }} />
          </div>
          <Field label="Address" as="textarea" inputProps={{ value: f.address, onChange: set("address") }} />

          <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Professional Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Department *" inputProps={{ value: f.department, onChange: set("department"), placeholder: "e.g. Law" }} />
            <Field label="Designation *" inputProps={{ value: f.designation, onChange: set("designation"), placeholder: "e.g. Associate Professor" }} />
            <Field label="Role *" as="select" selectProps={{ value: f.role, onChange: set("role") }}>
              {STAFF_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Field>
            <Field label="Subject" inputProps={{ value: f.subject, onChange: set("subject"), placeholder: "For teaching faculty" }} />
            {!editingId && <Field label="Password *" inputProps={{ type: "password", value: f.password, onChange: set("password") }} />}
            <Field label="Status" as="select" selectProps={{ value: f.status, onChange: set("status") }}>
              <option value="active">Active</option><option value="inactive">Inactive</option>
            </Field>
          </div>

          <div style={{ marginTop: 6, marginBottom: 6 }}>
            <label>Photo</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {f.photoData && <img src={f.photoData} alt="" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)" }} />}
              <input type="file" accept="image/jpeg,image/jpg,image/png" onChange={handlePhoto} />
            </div>
            {photoErr && <div style={{ color: "var(--danger)", fontSize: 11.5, marginTop: 4 }}>{photoErr}</div>}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit}>Save</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function CoursesManager({ courses, students, actions }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", code: "", duration: "", seats: "", fee: "", admissionFee: "", group: "Graduation", department: "Law" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const enrolledCount = (id) => students.filter((s) => s.courseId === id && (s.status || "").toLowerCase() === "approved").length;

  const submit = () => {
    if (!f.name || !f.code) return;
    actions.addCourse({ ...f, id: uid("c"), seats: Number(f.seats) || 0, fee: Number(f.fee) || 0, admissionFee: Number(f.admissionFee) || 0 });
    setF({ name: "", code: "", duration: "", seats: "", fee: "", admissionFee: "", group: "Graduation" });
    setOpen(false);
  };

  return (
    <>
      <SectionHeader eyebrow="Programs" title="Courses Offered" action={<button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={14} /> Add Course</button>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {courses.map((c) => (
          <div className="card" key={c.id}>
            <div className="card-body">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div className="eyebrow">{c.code} &middot; {c.group || "Graduation"}</div>
                  <h3 style={{ fontSize: 16, marginTop: 4 }}>{c.name}</h3>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => actions.removeCourse(c.id)}><Trash2 size={13} /></button>
              </div>
              <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 12.5, color: "var(--slate)" }}>
                <div>Duration<br /><b style={{ color: "var(--charcoal)" }}>{c.duration}</b></div>
                <div>Seats<br /><b style={{ color: "var(--charcoal)" }}>{enrolledCount(c.id)}/{c.seats}</b></div>
                <div>Admission Fee<br /><b style={{ color: "var(--charcoal)" }}>₹{Number(c.admissionFee ?? 0).toLocaleString("en-IN")}</b></div>
                <div>Annual Fee<br /><b style={{ color: "var(--charcoal)" }}>₹{Number(c.fee).toLocaleString("en-IN")}</b></div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {open && (
        <Modal title="Add New Course" onClose={() => setOpen(false)}>
          <Field label="Course Name *" inputProps={{ value: f.name, onChange: set("name"), placeholder: "e.g. BA LLB (Integrated)" }} />
          <Field label="Short Code *" inputProps={{ value: f.code, onChange: set("code"), placeholder: "e.g. BALLB" }} />
          <Field label="Course Group *" as="select" selectProps={{ value: f.group, onChange: set("group") }}>
            {COURSE_GROUPS.map((g) => <option key={g}>{g}</option>)}
          </Field>
          <Field label="Department" inputProps={{ value: f.department, onChange: set("department"), placeholder: "e.g. Law" }} />
          <Field label="Duration" inputProps={{ value: f.duration, onChange: set("duration"), placeholder: "e.g. 5 Years" }} />
          <Field label="Total Seats" inputProps={{ type: "number", value: f.seats, onChange: set("seats") }} />
          <Field label="Admission Fee (₹)" inputProps={{ type: "number", value: f.admissionFee, onChange: set("admissionFee") }} />
          <Field label="Annual Fee (₹)" inputProps={{ type: "number", value: f.fee, onChange: set("fee") }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit}>Add Course</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function FeesManager({ students, courses, fees, actions, role, paymentsConfig, transactions }) {
  const [editing, setEditing] = useState(null);
  const [amount, setAmount] = useState("");
  const [dueDateInput, setDueDateInput] = useState("");
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [duePeriod, setDuePeriod] = useState("all");
  const [customMonth, setCustomMonth] = useState(todayISO().slice(0, 7));
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [viewingExtra, setViewingExtra] = useState(null);
  const [viewingTransactionsFor, setViewingTransactionsFor] = useState(null);
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const isAdmin = role === "admin";

  const courseName = (id) => courses.find((c) => c.id === id)?.name || "—";
  const statusLabel = (f) => !f ? "—" : f.paid >= f.totalFee ? "Paid in Full" : f.paid > 0 ? "Partially Paid" : "Due";
  const statusKey = (f) => !f ? "none" : f.paid >= f.totalFee ? "Paid" : f.paid > 0 ? "Partial" : "Due";

  const now = new Date();
  const filtered = students.filter((s) => {
    const f = fees[s.id];
    if (search.trim() && !s.name.toLowerCase().includes(search.trim().toLowerCase()) && !(s.rollNo || "").toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (courseFilter !== "All" && s.courseId !== courseFilter) return false;
    if (statusFilter !== "All" && statusKey(f) !== statusFilter) return false;
    if (duePeriod === "thisWeek" && !isInSameWeek(f?.dueDate, now)) return false;
    if (duePeriod === "thisMonth" && !isInSameMonth(f?.dueDate, now)) return false;
    if (duePeriod === "customMonth" && !isInMonthString(f?.dueDate, customMonth)) return false;
    return true;
  });

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allVisibleSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((s) => s.id)));

  const bulkDelete = () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Remove fee records for ${selected.size} selected student${selected.size > 1 ? "s" : ""}? This clears their fee tracking (not their enrollment) and cannot be undone.`)) return;
    actions.deleteFeeRecords(Array.from(selected));
    setSelected(new Set());
  };

  return (
    <>
      <SectionHeader
        eyebrow="Accounts" title="Fee Ledger"
        action={isAdmin && <button className="btn btn-outline" onClick={() => setImporting(true)}><UploadCloud size={14} /> Import CSV</button>}
      />

      {isAdmin && <PaymentGatewaySelector paymentsConfig={paymentsConfig} actions={actions} />}
      {isAdmin && <FeeReminderTrigger actions={actions} />}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 200 }}>
            <label>Search Student</label>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: "var(--slate)" }} />
              <input placeholder="Name or roll no." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
            </div>
          </div>
          <div style={{ minWidth: 190 }}>
            <label>Course</label>
            <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
              <option value="All">All Courses</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 150 }}>
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {["All", "Paid", "Partial", "Due"].map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 170 }}>
            <label>Due Period</label>
            <select value={duePeriod} onChange={(e) => setDuePeriod(e.target.value)}>
              <option value="all">All</option>
              <option value="thisWeek">Due This Week</option>
              <option value="thisMonth">Due This Month</option>
              <option value="customMonth">Choose Month…</option>
            </select>
          </div>
          {duePeriod === "customMonth" && (
            <div style={{ minWidth: 160 }}>
              <label>Month</label>
              <input type="month" value={customMonth} onChange={(e) => setCustomMonth(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {isAdmin && selected.size > 0 && (
        <div className="card" style={{ marginBottom: 14, background: "var(--danger-bg)", borderColor: "var(--danger)" }}>
          <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)" }}>{selected.size} selected</span>
            <button className="btn btn-danger btn-sm" onClick={bulkDelete}><Trash2 size={13} /> Delete Fee Records</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear Selection</button>
          </div>
        </div>
      )}

      <div className="card">
        {filtered.length === 0 ? (
          <div className="card-body"><EmptyState icon={<Wallet size={30} />} title="No matching fee records" note="Try adjusting the filters above." /></div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="ledger">
              <thead><tr>
                {isAdmin && <th style={{ width: 34 }}><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /></th>}
                <th>Student</th><th>Course</th><th>Total Fee</th><th>Paid</th><th>Balance</th><th>Due Date</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {filtered.map((s) => {
                  const f = fees[s.id];
                  const balance = f ? f.totalFee - f.paid : 0;
                  return (
                    <tr key={s.id}>
                      {isAdmin && <td><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)} /></td>}
                      <td style={{ fontWeight: 600 }}>{s.name}<div style={{ fontSize: 11, color: "var(--slate)", fontWeight: 400 }}>{s.rollNo}</div></td>
                      <td>{courseName(s.courseId)}</td>
                      <td className="num">₹{f ? f.totalFee.toLocaleString("en-IN") : "—"}</td>
                      <td className="num">₹{f ? f.paid.toLocaleString("en-IN") : 0}</td>
                      <td className="num">₹{balance.toLocaleString("en-IN")}</td>
                      <td style={{ fontSize: 12.5 }}>{f?.dueDate ? fmtDate(f.dueDate) : "—"}</td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                          background: balance <= 0 ? "var(--success-bg)" : f?.paid > 0 ? "var(--warn-bg)" : "var(--danger-bg)",
                          color: balance <= 0 ? "var(--success)" : f?.paid > 0 ? "var(--warn)" : "var(--danger)",
                        }}>{statusLabel(f)}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {f?.extraFields && Object.keys(f.extraFields).length > 0 && (
                            <button className="btn btn-ghost btn-sm" onClick={() => setViewingExtra(s.id)}><Eye size={13} /> Extra Info</button>
                          )}
                          <button className="btn btn-ghost btn-sm" onClick={() => setViewingTransactionsFor(s.id)}><FileText size={13} /> Payments</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(s.id); setAmount(f?.paid || 0); setDueDateInput(f?.dueDate || ""); }}>Update</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && (
        <Modal title="Update Fee" onClose={() => setEditing(null)}>
          <Field label="Amount Paid (₹)" inputProps={{ type: "number", value: amount, onChange: (e) => setAmount(e.target.value) }} />
          <Field label="Due Date" inputProps={{ type: "date", value: dueDateInput, onChange: (e) => setDueDateInput(e.target.value) }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => { actions.updateFeePaid(editing, Number(amount) || 0, dueDateInput); setEditing(null); }}>Save</button>
          </div>
        </Modal>
      )}

      {viewingExtra && fees[viewingExtra]?.extraFields && (
        <Modal title="Additional Fee Information" onClose={() => setViewingExtra(null)}>
          <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: -6, marginBottom: 14 }}>
            These columns came from a CSV import and didn't match a standard field, so they were kept here instead of being discarded.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13.5 }}>
            {Object.entries(fees[viewingExtra].extraFields).map(([k, v]) => (
              <SummaryRow key={k} label={k} value={String(v)} />
            ))}
          </div>
        </Modal>
      )}

      {importing && (
        <CsvImportModal
          title="Import Fees (CSV)"
          hint="Upload a CSV with a column identifying the student (Email or Roll No.) plus fee columns like Total Fee, Paid, Due Date. Any other column is kept as additional info on that student's fee record. Rows are matched to existing students only — this doesn't create new students."
          onClose={() => setImporting(false)}
          onImport={actions.importFeesCsv}
        />
      )}

      {viewingTransactionsFor && (() => {
        const s = students.find((x) => x.id === viewingTransactionsFor);
        const txns = (transactions || []).filter((t) => t.studentId === viewingTransactionsFor).sort((a, b) => new Date(b.date) - new Date(a.date));
        return (
          <Modal title={`Payment History — ${s?.name || ""}`} onClose={() => setViewingTransactionsFor(null)} width={680}>
            {txns.length === 0 ? (
              <EmptyState icon={<Wallet size={28} />} title="No payments recorded" note="This student hasn't made any payments yet." />
            ) : (
              <table className="ledger">
                <thead><tr><th>Date</th><th>Amount</th><th>Type</th><th>Mode</th><th>Recorded By</th><th></th></tr></thead>
                <tbody>{txns.map((t) => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.date)}</td>
                    <td className="num">₹{t.totalAmount.toLocaleString("en-IN")}</td>
                    <td>{t.paymentType}</td>
                    <td>{t.paymentMode}</td>
                    <td>{t.recordedByName}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setViewingReceipt(t)}><Eye size={13} /> View</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </Modal>
        );
      })()}

      {viewingReceipt && (
        <PaymentReceiptModal
          transaction={viewingReceipt}
          student={students.find((x) => x.id === viewingReceipt.studentId)}
          course={courses.find((c) => c.id === students.find((x) => x.id === viewingReceipt.studentId)?.courseId)}
          onClose={() => setViewingReceipt(null)}
        />
      )}
    </>
  );
}

function NoticesBoard({ notices, actions, poster, canDelete }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", content: "" });

  const submit = () => {
    if (!f.title || !f.content) return;
    actions.addNotice({ id: uid("n"), title: f.title, content: f.content, date: new Date().toISOString(), postedByName: poster.name, postedByRole: poster.role });
    setF({ title: "", content: "" });
    setOpen(false);
  };

  return (
    <>
      <SectionHeader eyebrow="Announcements" title="Notice Board" action={<button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={14} /> Post Notice</button>} />
      {notices.length === 0 ? (
        <div className="card"><div className="card-body"><EmptyState icon={<Bell size={30} />} title="No notices posted" note="Announcements will be listed here." /></div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {notices.map((n) => (
            <div className="card" key={n.id}>
              <div className="card-body">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h3 style={{ fontSize: 15.5 }}>{n.title}</h3>
                    <div style={{ fontSize: 11.5, color: "var(--slate)", margin: "4px 0 10px" }}>
                      {fmtDate(n.date)} &middot; <span className={`badge-role badge-${n.postedByRole === "admin" ? "admin" : "teacher"}`}>{n.postedByRole === "admin" ? "Administrator" : "Faculty"}</span> {n.postedByName}
                    </div>
                  </div>
                  {canDelete && <button className="btn btn-ghost btn-sm" onClick={() => actions.removeNotice(n.id)}><Trash2 size={13} /></button>}
                </div>
                <div style={{ fontSize: 13.5, color: "var(--charcoal)", lineHeight: 1.6 }}>{n.content}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && (
        <Modal title="Post a Notice" onClose={() => setOpen(false)}>
          <Field label="Title" inputProps={{ value: f.title, onChange: (e) => setF({ ...f, title: e.target.value }) }} />
          <Field label="Content" as="textarea" inputProps={{ value: f.content, onChange: (e) => setF({ ...f, content: e.target.value }) }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit}>Publish</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ============================== REPORTS ============================== */

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    // Fallback for sandboxed environments that block the anchor-download trick:
    // open the file in a new tab so the user can save it manually.
    window.open(url, "_blank", "noopener");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

function exportRowsToExcel(filename, rows) {
  if (!rows.length) { window.alert("There are no rows to export. Adjust the filters and try again."); return; }
  try {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    downloadBlob(blob, `${filename}.xlsx`);
  } catch (e) {
    console.error("Excel export failed:", e);
    window.alert("The Excel export could not be generated. Please try the CSV export instead, or use Print → Save as PDF.");
  }
}

function exportRowsToCSV(filename, rows) {
  if (!rows.length) { window.alert("There are no rows to export. Adjust the filters and try again."); return; }
  try {
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, `${filename}.csv`);
  } catch (e) {
    console.error("CSV export failed:", e);
    window.alert("The CSV export could not be generated. Please try the Excel export instead.");
  }
}

/* ============================== CSV IMPORT (dynamic columns) ============================== */

function CsvImportModal({ title, hint, onClose, onImport }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [parseErr, setParseErr] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setParseErr("");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (!res.data.length) { setParseErr("That file has no data rows."); return; }
        setRows(res.data);
        setHeaders(res.meta.fields || Object.keys(res.data[0]));
      },
      error: (err) => setParseErr(err.message || "Could not parse that CSV file."),
    });
  };

  const runImport = async () => {
    if (!rows || rows.length === 0) return;
    setImporting(true);
    try {
      const summary = await onImport(rows);
      setResult(summary);
    } catch (e) {
      setParseErr(e.message || "Import failed.");
    }
    setImporting(false);
  };

  return (
    <Modal title={title} onClose={onClose} width={640}>
      {hint && <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: -6, marginBottom: 14, lineHeight: 1.6 }}>{hint}</p>}
      {parseErr && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 14 }}>{parseErr}</div>}

      {!result && (
        <>
          <div
            onClick={() => inputRef.current && inputRef.current.click()}
            style={{ border: "1.5px dashed var(--border)", borderRadius: 6, padding: 20, textAlign: "center", cursor: "pointer", background: "#FBF9F4", marginBottom: 14 }}
          >
            <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 13.5 }}>{fileName || "Click to choose a CSV file"}</div>
            <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 4 }}>Any column headers are fine — recognized ones map automatically, anything else is kept as extra info.</div>
          </div>
          <input ref={inputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={handleFile} />

          {rows && (
            <>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Preview ({rows.length} row{rows.length === 1 ? "" : "s"} detected)</div>
              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ overflowX: "auto" }}>
                  <table className="ledger">
                    <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {rows.slice(0, 5).map((r, i) => (
                        <tr key={i}>{headers.map((h) => <td key={h}>{String(r[h] ?? "")}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 5 && <div style={{ padding: "8px 14px", fontSize: 11.5, color: "var(--slate)" }}>…and {rows.length - 5} more row{rows.length - 5 === 1 ? "" : "s"}</div>}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-primary" onClick={runImport} disabled={importing}>
                  <UploadCloud size={14} /> {importing ? "Importing…" : `Import ${rows.length} Row${rows.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {result && (
        <div>
          <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
            <div className="stat-card" style={{ flex: 1 }}>
              <div className="stat-value" style={{ color: "var(--success)" }}>{result.created}</div>
              <div className="stat-label">Created</div>
            </div>
            <div className="stat-card" style={{ flex: 1 }}>
              <div className="stat-value" style={{ color: "var(--warn)" }}>{result.updated}</div>
              <div className="stat-label">Updated</div>
            </div>
            <div className="stat-card" style={{ flex: 1 }}>
              <div className="stat-value" style={{ color: result.errors.length ? "var(--danger)" : "var(--slate)" }}>{result.errors.length}</div>
              <div className="stat-label">Skipped</div>
            </div>
          </div>

          {result.newLogins && result.newLogins.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="eyebrow" style={{ marginBottom: 6, color: "var(--danger)" }}>
                New Student Logins — save these now, they won't be shown again
              </div>
              <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 8, lineHeight: 1.5 }}>
                These students didn't have a password column in the CSV, so one was generated automatically.
                Share these credentials with each student — they can change their password afterward from Edit Profile.
              </p>
              <div className="card" style={{ maxHeight: 220, overflowY: "auto" }}>
                <table className="ledger">
                  <thead><tr><th>Name</th><th>Email (username)</th><th>Password</th></tr></thead>
                  <tbody>
                    {result.newLogins.map((l) => (
                      <tr key={l.email}>
                        <td>{l.name}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{l.email}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700 }}>{l.password}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
                onClick={() => {
                  const text = "Name,Email,Password\n" + result.newLogins.map((l) => `${l.name},${l.email},${l.password}`).join("\n");
                  navigator.clipboard?.writeText(text);
                }}
              >Copy as CSV</button>
            </div>
          )}

          {result.recognizedColumns.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Recognized Columns</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {result.recognizedColumns.map((c) => <span key={c} className="seal seal-approved" style={{ fontSize: 10.5 }}>{c}</span>)}
              </div>
            </div>
          )}
          {result.extraColumns.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Kept as Additional Info (not a standard field)</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {result.extraColumns.map((c) => <span key={c} className="seal seal-pending" style={{ fontSize: 10.5 }}>{c}</span>)}
              </div>
            </div>
          )}
          {result.errors.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="eyebrow" style={{ marginBottom: 6, color: "var(--danger)" }}>Skipped Rows</div>
              <div className="card" style={{ maxHeight: 160, overflowY: "auto" }}>
                <div className="card-body" style={{ fontSize: 12, lineHeight: 1.8 }}>
                  {result.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              </div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ExportBar({ filenamePrefix, rows, onPrint }) {
  return (
    <div className="no-print" style={{ display: "flex", gap: 8 }}>
      <button className="btn btn-ghost btn-sm" onClick={() => exportRowsToExcel(filenamePrefix, rows)} disabled={!rows.length}>
        <FileText size={13} /> Excel
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => exportRowsToCSV(filenamePrefix, rows)} disabled={!rows.length}>
        <FileText size={13} /> CSV
      </button>
      <button className="btn btn-ghost btn-sm" onClick={onPrint} disabled={!rows.length}>
        <FileText size={13} /> PDF
      </button>
    </div>
  );
}

function ReportView({ eyebrow, title, filenamePrefix, filters, columns, rows, footerNote }) {
  return (
    <>
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        action={<ExportBar filenamePrefix={filenamePrefix} rows={rows} onPrint={() => {
          try { window.print(); } catch { window.alert("Printing isn't available in this preview. Try opening the app in a new browser tab, then use Print → Save as PDF."); }
        }} />}
      />
      {filters && <div className="no-print card" style={{ marginBottom: 16 }}><div className="card-body" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>{filters}</div></div>}
      <div className="print-area">
        <div className="print-header">
          <CollegeMark />
          <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 11, color: "var(--slate)" }}>
            <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>{title}</div>
            <div>Generated {fmtDate(new Date())}</div>
          </div>
        </div>
        <div className="card">
          {rows.length === 0 ? (
            <div className="card-body"><EmptyState icon={<FileText size={28} />} title="No records found" note="Try adjusting the filters above." /></div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="ledger">
                <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>{columns.map((c) => <td key={c} className={typeof row[c] === "number" ? "num" : undefined}>{row[c]}</td>)}</tr>
                  ))}
                </tbody>
                {footerNote && <tfoot><tr><td colSpan={columns.length} style={{ fontWeight: 700, background: "#FBF9F4" }}>{footerNote}</td></tr></tfoot>}
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ReportsCenter({ store }) {
  const [tab, setTab] = useState("admission");
  const tabs = [
    ["admission", "Admission Report"],
    ["student", "Student Report"],
    ["fee", "Fee Report"],
    ["emi", "EMI Report"],
    ["pendingFee", "Pending Fee"],
    ["courseWise", "Course-Wise Report"],
    ["daily", "Daily Collection"],
  ];
  const courseName = (id) => store.courses.find((c) => c.id === id)?.name || "—";

  return (
    <>
      <SectionHeader eyebrow="Insights" title="Reports" />
      <div style={{ display: "flex", gap: 4, marginBottom: 18, flexWrap: "wrap" }} className="no-print">
        {tabs.map(([k, l]) => (
          <button key={k} className={`tab-btn ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "admission" && <AdmissionReport store={store} courseName={courseName} />}
      {tab === "student" && <StudentReport store={store} courseName={courseName} />}
      {tab === "fee" && <FeeReport store={store} courseName={courseName} />}
      {tab === "emi" && <EmiReport store={store} courseName={courseName} />}
      {tab === "pendingFee" && <PendingFeeReport store={store} courseName={courseName} />}
      {tab === "courseWise" && <CourseWiseReport store={store} />}
      {tab === "daily" && <DailyCollectionReport store={store} />}
    </>
  );
}

function AdmissionReport({ store, courseName }) {
  const [status, setStatus] = useState("All");
  const [courseId, setCourseId] = useState("All");
  const students = store.students.filter((s) => (s.status || "").toLowerCase() !== "draft")
    .filter((s) => status === "All" || s.status === status.toLowerCase())
    .filter((s) => courseId === "All" || s.courseId === courseId);
  const rows = students.map((s) => ({
    "Applied Date": (s.appliedAt || s.createdAt) ? fmtDate(s.appliedAt || s.createdAt) : "—",
    "Name": s.name, "Email": s.email, "Phone": s.phone,
    "Course": courseName(s.courseId), "Category": s.category || "—",
    "Status": s.status.charAt(0).toUpperCase() + s.status.slice(1),
    "Roll No": s.rollNo || "—",
  }));
  return (
    <ReportView
      eyebrow="Admissions" title="Admission Report" filenamePrefix="admission-report"
      columns={["Applied Date", "Name", "Email", "Phone", "Course", "Category", "Status", "Roll No"]}
      rows={rows}
      filters={<>
        <div><label>Status</label><select value={status} onChange={(e) => setStatus(e.target.value)}>{["All", "Pending", "Approved", "Rejected"].map((o) => <option key={o}>{o}</option>)}</select></div>
        <div><label>Course</label><select value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="All">All Courses</option>{store.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      </>}
    />
  );
}

function StudentReport({ store, courseName }) {
  const [courseId, setCourseId] = useState("All");
  const students = store.students.filter((s) => (s.status || "").toLowerCase() === "approved").filter((s) => courseId === "All" || s.courseId === courseId);
  const rows = students.map((s) => {
    const rec = store.attendance[s.id] || [];
    const pct = rec.length ? Math.round((rec.filter((r) => r.status === "Present").length / rec.length) * 100) : null;
    return {
      "Roll No": s.rollNo, "Name": s.name, "Course": courseName(s.courseId), "Gender": s.gender,
      "Category": s.category, "Email": s.email, "Phone": s.phone,
      "Attendance %": pct === null ? "—" : pct, "DOB": s.dob,
    };
  });
  return (
    <ReportView
      eyebrow="Directory" title="Student Report" filenamePrefix="student-report"
      columns={["Roll No", "Name", "Course", "Gender", "Category", "Email", "Phone", "Attendance %", "DOB"]}
      rows={rows}
      filters={<div><label>Course</label><select value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="All">All Courses</option>{store.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
    />
  );
}

function feeStatusLabel(fee) {
  if (!fee) return "No Record";
  if (fee.paid >= fee.totalFee) return "Paid";
  if (fee.paid > 0) return "Partial";
  return "Due";
}

function FeeReport({ store, courseName }) {
  const [courseId, setCourseId] = useState("All");
  const [status, setStatus] = useState("All");
  const students = store.students.filter((s) => (s.status || "").toLowerCase() === "approved").filter((s) => courseId === "All" || s.courseId === courseId);
  const rows = students.map((s) => {
    const fee = store.fees[s.id];
    return {
      "Roll No": s.rollNo, "Name": s.name, "Course": courseName(s.courseId),
      "Total Fee": fee?.totalFee || 0, "Paid": fee?.paid || 0, "Balance": (fee?.totalFee || 0) - (fee?.paid || 0),
      "Status": feeStatusLabel(fee),
    };
  }).filter((r) => status === "All" || r.Status === status);
  const total = rows.reduce((sum, r) => sum + r.Paid, 0);
  return (
    <ReportView
      eyebrow="Accounts" title="Fee Report" filenamePrefix="fee-report"
      columns={["Roll No", "Name", "Course", "Total Fee", "Paid", "Balance", "Status"]}
      rows={rows}
      footerNote={`Total Collected: ₹${total.toLocaleString("en-IN")}`}
      filters={<>
        <div><label>Course</label><select value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="All">All Courses</option>{store.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label>Status</label><select value={status} onChange={(e) => setStatus(e.target.value)}>{["All", "Paid", "Partial", "Due"].map((o) => <option key={o}>{o}</option>)}</select></div>
      </>}
    />
  );
}

function EmiReport({ store, courseName }) {
  const students = store.students.filter((s) => (s.status || "").toLowerCase() === "approved" && store.fees[s.id]?.plan);
  const rows = students.map((s) => {
    const plan = store.fees[s.id].plan;
    return {
      "Roll No": s.rollNo, "Name": s.name, "Course": courseName(s.courseId),
      "Total EMI Amount": plan.totalAmount, "Tenure (Months)": plan.tenureMonths,
      "Installment Amount": plan.installmentAmount, "EMIs Paid": plan.emisPaid,
      "EMIs Remaining": Math.max(0, plan.tenureMonths - plan.emisPaid),
      "Remaining Amount": Math.max(0, plan.totalAmount - plan.installmentAmount * plan.emisPaid),
    };
  });
  return (
    <ReportView
      eyebrow="Installments" title="EMI Report" filenamePrefix="emi-report"
      columns={["Roll No", "Name", "Course", "Total EMI Amount", "Tenure (Months)", "Installment Amount", "EMIs Paid", "EMIs Remaining", "Remaining Amount"]}
      rows={rows}
    />
  );
}

function PendingFeeReport({ store, courseName }) {
  const students = store.students.filter((s) => (s.status || "").toLowerCase() === "approved");
  const rows = students.map((s) => {
    const fee = store.fees[s.id];
    const balance = (fee?.totalFee || 0) - (fee?.paid || 0);
    return { s, balance, row: {
      "Roll No": s.rollNo, "Name": s.name, "Course": courseName(s.courseId), "Phone": s.phone,
      "Total Fee": fee?.totalFee || 0, "Paid": fee?.paid || 0, "Balance": balance,
    } };
  }).filter((r) => r.balance > 0).sort((a, b) => b.balance - a.balance).map((r) => r.row);
  const total = rows.reduce((sum, r) => sum + r.Balance, 0);
  return (
    <ReportView
      eyebrow="Follow-up" title="Pending Fee Report" filenamePrefix="pending-fee-report"
      columns={["Roll No", "Name", "Course", "Phone", "Total Fee", "Paid", "Balance"]}
      rows={rows}
      footerNote={`Total Outstanding: ₹${total.toLocaleString("en-IN")}`}
    />
  );
}

function CourseWiseReport({ store }) {
  const rows = store.courses.map((c) => {
    const enrolled = store.students.filter((s) => (s.status || "").toLowerCase() === "approved" && s.courseId === c.id);
    const collected = enrolled.reduce((sum, s) => sum + (store.fees[s.id]?.paid || 0), 0);
    const pending = enrolled.reduce((sum, s) => sum + ((store.fees[s.id]?.totalFee || 0) - (store.fees[s.id]?.paid || 0)), 0);
    return {
      "Course": c.name, "Group": c.group || "Graduation", "Total Seats": c.seats,
      "Enrolled": enrolled.length, "Available Seats": Math.max(0, c.seats - enrolled.length),
      "Fee Collected": collected, "Fee Pending": pending,
    };
  });
  return (
    <ReportView
      eyebrow="Programmes" title="Course-Wise Report" filenamePrefix="course-wise-report"
      columns={["Course", "Group", "Total Seats", "Enrolled", "Available Seats", "Fee Collected", "Fee Pending"]}
      rows={rows}
    />
  );
}

function DailyCollectionReport({ store }) {
  const [date, setDate] = useState(todayISO());
  const txns = store.transactions.filter((t) => t.date.slice(0, 10) === date);
  const rows = txns.map((t) => {
    const student = store.students.find((s) => s.id === t.studentId);
    return {
      "Date": fmtDate(t.date), "Student": student?.name || t.studentId, "Roll No": student?.rollNo || "—",
      "Amount": t.totalAmount, "Payment Type": t.paymentType, "Mode": t.paymentMode, "Recorded By": t.recordedByName,
    };
  });
  const total = rows.reduce((sum, r) => sum + r.Amount, 0);
  return (
    <ReportView
      eyebrow="Cash Book" title="Daily Collection Report" filenamePrefix={`daily-collection-${date}`}
      columns={["Date", "Student", "Roll No", "Amount", "Payment Type", "Mode", "Recorded By"]}
      rows={rows}
      footerNote={`Total Collected on ${fmtDate(date)}: ₹${total.toLocaleString("en-IN")}`}
      filters={<div><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>}
    />
  );
}



/* ============================== TEACHER PORTAL ============================== */

function TeacherPortal({ user, store, actions, onLogout }) {
  const [page, setPage] = useState("overview");
  const teacher = store.teachers.find((t) => t.id === user.id);
  const nav = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard size={16} /> },
    { key: "students", label: "My Students", icon: <GraduationCap size={16} /> },
    { key: "attendance", label: "Attendance", icon: <ClipboardCheck size={16} /> },
    { key: "grades", label: "Grades", icon: <Award size={16} /> },
    { key: "fees", label: "Fees", icon: <Wallet size={16} /> },
    { key: "notices", label: "Notices", icon: <Bell size={16} /> },
  ];
  const approvedStudents = store.students.filter((s) => (s.status || "").toLowerCase() === "approved");

  return (
    <PortalShell roleLabel="Faculty" userName={user.name} navItems={nav} active={page} onNav={setPage} onLogout={onLogout}>
      {page === "overview" && (
        <>
          <SectionHeader eyebrow="Dashboard" title={`Welcome, ${user.name}`} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
            <StatCard icon={<BookOpen size={22} />} value={teacher?.subject || "—"} label="Subject" />
            <StatCard icon={<GraduationCap size={22} />} value={approvedStudents.length} label="Total Students" />
            <StatCard icon={<Bell size={22} />} value={store.notices.length} label="Notices Posted" />
          </div>
          <div className="card"><div className="card-body">
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Profile</h3>
            <div style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.8 }}>
              Email: {teacher?.email}<br />Department: {teacher?.department || "—"}<br />Phone: {teacher?.phone || "—"}
            </div>
          </div></div>
        </>
      )}
      {page === "students" && <StudentsDirectory students={approvedStudents} courses={store.courses} store={store} actions={actions} canImport={false} />}
      {page === "attendance" && <AttendanceMarking courses={store.courses} students={approvedStudents} actions={actions} teacherSubject={teacher?.subject} />}
      {page === "grades" && <GradesEntry courses={store.courses} students={approvedStudents} grades={store.grades} actions={actions} />}
      {page === "fees" && <FeesManager students={approvedStudents} courses={store.courses} fees={store.fees} actions={actions} role="teacher" paymentsConfig={store.paymentsConfig} transactions={store.transactions} />}
      {page === "notices" && <NoticesBoard notices={store.notices} actions={actions} poster={{ id: user.id, name: user.name, role: "teacher" }} canDelete={false} />}
    </PortalShell>
  );
}

const LEAVE_TYPES = ["Casual Leave", "Sick Leave", "Earned Leave", "Other"];

function LeaveApplicationPanel({ user, actions }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ leaveType: "Casual Leave", startDate: "", endDate: "", reason: "" });
  const [err, setErr] = useState("");

  const load = async () => {
    try { setRows(await actions.listLeaveRequests(user.id)); }
    catch (e) { setErr(e.message || "Could not load your leave requests."); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/set-state-in-effect

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setErr("");
    if (!f.startDate || !f.endDate) { setErr("Please choose a start and end date."); return; }
    try {
      await actions.applyForLeave({ teacherId: user.id, ...f });
      setF({ leaveType: "Casual Leave", startDate: "", endDate: "", reason: "" });
      setOpen(false);
      load();
    } catch (e) {
      setErr(e.message || "Could not submit this leave request.");
    }
  };

  const statusColor = (s) => s === "approved" ? "var(--success)" : s === "rejected" ? "var(--danger)" : "var(--warn)";

  return (
    <>
      <SectionHeader eyebrow="My Leave" title="Leave Requests" action={<button className="btn btn-primary" onClick={() => setOpen(true)}><Plus size={14} /> Apply for Leave</button>} />
      {err && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 14 }}>{err}</div>}
      <div className="card">
        {!rows || rows.length === 0 ? <div className="card-body"><EmptyState icon={<Clock size={28} />} title="No leave requests yet" note="Apply for leave using the button above." /></div> : (
          <table className="ledger">
            <thead><tr><th>Type</th><th>From</th><th>To</th><th>Reason</th><th>Status</th><th>Decision Note</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td>{r.leaveType}</td><td>{fmtDate(r.startDate)}</td><td>{fmtDate(r.endDate)}</td>
                <td style={{ maxWidth: 200 }}>{r.reason || "—"}</td>
                <td><span style={{ fontWeight: 700, fontSize: 11.5, color: statusColor(r.status), textTransform: "capitalize" }}>{r.status}</span></td>
                <td style={{ fontSize: 12, color: "var(--slate)" }}>{r.decisionNote || "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {open && (
        <Modal title="Apply for Leave" onClose={() => setOpen(false)}>
          {err && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 14 }}>{err}</div>}
          <Field label="Leave Type" as="select" selectProps={{ value: f.leaveType, onChange: set("leaveType") }}>
            {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="From *" inputProps={{ type: "date", value: f.startDate, onChange: set("startDate") }} />
            <Field label="To *" inputProps={{ type: "date", value: f.endDate, onChange: set("endDate") }} />
          </div>
          <Field label="Reason" as="textarea" inputProps={{ value: f.reason, onChange: set("reason") }} />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit}>Submit Request</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function LeaveApprovalPanel({ teachers, actions }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [noteFor, setNoteFor] = useState(null);
  const [note, setNote] = useState("");

  const load = async () => {
    try { setRows(await actions.listLeaveRequests()); }
    catch (e) { setErr(e.message || "Could not load leave requests."); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/set-state-in-effect

  const teacherName = (id) => teachers.find((t) => t.id === id)?.name || "—";
  const decide = async (id, status) => {
    try { await actions.decideLeave(id, status, note); setNoteFor(null); setNote(""); load(); }
    catch (e) { alert(e.message || "Could not record this decision."); }
  };

  const pending = (rows || []).filter((r) => r.status === "pending");
  const decided = (rows || []).filter((r) => r.status !== "pending");

  return (
    <>
      <SectionHeader eyebrow="HR" title="Leave Requests" />
      {err && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 14 }}>{err}</div>}

      <div className="eyebrow" style={{ marginBottom: 10 }}>Pending ({pending.length})</div>
      <div className="card" style={{ marginBottom: 20 }}>
        {pending.length === 0 ? <div className="card-body"><EmptyState icon={<Clock size={28} />} title="Nothing pending" note="All caught up." /></div> : (
          <table className="ledger">
            <thead><tr><th>Staff</th><th>Type</th><th>From</th><th>To</th><th>Reason</th><th></th></tr></thead>
            <tbody>{pending.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{teacherName(r.teacherId)}</td>
                <td>{r.leaveType}</td><td>{fmtDate(r.startDate)}</td><td>{fmtDate(r.endDate)}</td>
                <td style={{ maxWidth: 200 }}>{r.reason || "—"}</td>
                <td>
                  {noteFor === r.id ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: 130 }} />
                      <button className="btn btn-success btn-sm" onClick={() => decide(r.id, "approved")}><CheckCircle size={13} /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => decide(r.id, "rejected")}><XCircle size={13} /></button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => { setNoteFor(r.id); setNote(""); }}>Decide</button>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <div className="eyebrow" style={{ marginBottom: 10 }}>Decided</div>
      <div className="card">
        {decided.length === 0 ? <div className="card-body"><EmptyState icon={<FileText size={28} />} title="No decisions yet" note="" /></div> : (
          <table className="ledger">
            <thead><tr><th>Staff</th><th>Type</th><th>From</th><th>To</th><th>Status</th><th>Decided By</th></tr></thead>
            <tbody>{decided.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{teacherName(r.teacherId)}</td>
                <td>{r.leaveType}</td><td>{fmtDate(r.startDate)}</td><td>{fmtDate(r.endDate)}</td>
                <td style={{ fontWeight: 700, fontSize: 11.5, color: r.status === "approved" ? "var(--success)" : "var(--danger)", textTransform: "capitalize" }}>{r.status}</td>
                <td style={{ fontSize: 12 }}>{r.decidedBy}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ============================== HR PORTAL ============================== */

function HRPortal({ user, store, actions, onLogout }) {
  const [page, setPage] = useState("overview");
  const nav = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard size={16} /> },
    { key: "records", label: "Employee Records", icon: <Users size={16} /> },
    { key: "leave", label: "Leave Requests", icon: <Clock size={16} /> },
    { key: "myLeave", label: "My Leave", icon: <User size={16} /> },
  ];

  return (
    <PortalShell roleLabel="HR" userName={user.name} navItems={nav} active={page} onNav={setPage} onLogout={onLogout}>
      {page === "overview" && (
        <>
          <SectionHeader eyebrow="Dashboard" title={`Welcome, ${user.name}`} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
            <StatCard icon={<Users size={22} />} value={store.teachers.length} label="Staff Members" />
            <StatCard icon={<Clock size={22} />} value={store.teachers.filter((t) => t.status === "active").length} label="Active" accent="var(--success)" />
            <StatCard icon={<Bell size={22} />} value={store.teachers.filter((t) => t.status === "inactive").length} label="Inactive" accent="var(--slate)" />
          </div>
          <div className="card" style={{ background: "#FBF9F4" }}>
            <div className="card-body" style={{ fontSize: 12.5, color: "var(--slate)" }}>
              <b style={{ color: "var(--ink)" }}>Note:</b> Payroll and staff Attendance tracking aren't built yet in this version — Employee Records and Leave Management are available now.
            </div>
          </div>
        </>
      )}
      {page === "records" && <FacultyDirectory teachers={store.teachers} students={store.students} actions={actions} readOnly />}
      {page === "leave" && <LeaveApprovalPanel teachers={store.teachers} actions={actions} />}
      {page === "myLeave" && <LeaveApplicationPanel user={user} actions={actions} />}
    </PortalShell>
  );
}

/* ============================== ACCOUNTS PORTAL ============================== */

function AccountsPortal({ user, store, actions, onLogout }) {
  const [page, setPage] = useState("overview");
  const approvedStudents = store.students.filter((s) => (s.status || "").toLowerCase() === "approved");
  const totalCollected = Object.values(store.fees).reduce((sum, f) => sum + (f.paid || 0), 0);
  const totalDue = Object.values(store.fees).reduce((sum, f) => sum + Math.max(0, (f.totalFee || 0) - (f.paid || 0)), 0);
  const nav = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard size={16} /> },
    { key: "fees", label: "Fees & Receipts", icon: <Wallet size={16} /> },
    { key: "reports", label: "Payment Reports", icon: <FileText size={16} /> },
    { key: "myLeave", label: "My Leave", icon: <User size={16} /> },
  ];

  return (
    <PortalShell roleLabel="Accounts" userName={user.name} navItems={nav} active={page} onNav={setPage} onLogout={onLogout}>
      {page === "overview" && (
        <>
          <SectionHeader eyebrow="Dashboard" title={`Welcome, ${user.name}`} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
            <StatCard icon={<GraduationCap size={22} />} value={approvedStudents.length} label="Enrolled Students" />
            <StatCard icon={<Wallet size={22} />} value={`₹${totalCollected.toLocaleString("en-IN")}`} label="Fees Collected" accent="var(--success)" />
            <StatCard icon={<Clock size={22} />} value={`₹${totalDue.toLocaleString("en-IN")}`} label="Outstanding Balance" accent="var(--danger)" />
          </div>
        </>
      )}
      {page === "fees" && <FeesManager students={approvedStudents} courses={store.courses} fees={store.fees} actions={actions} role="admin" paymentsConfig={store.paymentsConfig} transactions={store.transactions} />}
      {page === "reports" && <ReportsCenter store={store} />}
      {page === "myLeave" && <LeaveApplicationPanel user={user} actions={actions} />}
    </PortalShell>
  );
}

/* ============================== EXAMINATION INCHARGE PORTAL ============================== */

function ExamInchargePortal({ user, store, actions, onLogout }) {
  const [page, setPage] = useState("overview");
  const approvedStudents = store.students.filter((s) => (s.status || "").toLowerCase() === "approved");
  const nav = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard size={16} /> },
    { key: "grades", label: "Marks & Results", icon: <Award size={16} /> },
    { key: "reports", label: "Reports", icon: <FileText size={16} /> },
    { key: "myLeave", label: "My Leave", icon: <User size={16} /> },
  ];

  return (
    <PortalShell roleLabel="Examination Incharge" userName={user.name} navItems={nav} active={page} onNav={setPage} onLogout={onLogout}>
      {page === "overview" && (
        <>
          <SectionHeader eyebrow="Dashboard" title={`Welcome, ${user.name}`} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 24 }}>
            <StatCard icon={<GraduationCap size={22} />} value={approvedStudents.length} label="Enrolled Students" />
            <StatCard icon={<Award size={22} />} value={Object.values(store.grades).flat().length} label="Grade Entries Recorded" />
          </div>
          <div className="card" style={{ background: "#FBF9F4" }}>
            <div className="card-body" style={{ fontSize: 12.5, color: "var(--slate)" }}>
              <b style={{ color: "var(--ink)" }}>Note:</b> Hall Ticket generation and a distinct exam-scheduling module aren't built yet in this version — Marks entry (across all students/courses) and Reports are available now.
            </div>
          </div>
        </>
      )}
      {page === "grades" && <GradesEntry courses={store.courses} students={approvedStudents} grades={store.grades} actions={actions} />}
      {page === "reports" && <ReportsCenter store={store} />}
      {page === "myLeave" && <LeaveApplicationPanel user={user} actions={actions} />}
    </PortalShell>
  );
}

/* ============================== HOD PORTAL ============================== */

function HODPortal({ user, store, actions, onLogout }) {
  const [page, setPage] = useState("overview");
  // Students are already department-scoped server-side (see routes/students.js) —
  // store.students for a HOD user only ever contains their own department's students.
  const approvedStudents = store.students.filter((s) => (s.status || "").toLowerCase() === "approved");
  const deptTeachers = store.teachers.filter((t) => t.department === user.department);
  const nav = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard size={16} /> },
    { key: "faculty", label: "Faculty", icon: <Users size={16} /> },
    { key: "students", label: "Students", icon: <GraduationCap size={16} /> },
    { key: "attendance", label: "Attendance", icon: <ClipboardCheck size={16} /> },
    { key: "grades", label: "Internal Marks", icon: <Award size={16} /> },
    { key: "myLeave", label: "My Leave", icon: <User size={16} /> },
  ];

  return (
    <PortalShell roleLabel="HOD" userName={user.name} navItems={nav} active={page} onNav={setPage} onLogout={onLogout}>
      {page === "overview" && (
        <>
          <SectionHeader eyebrow={`${user.department || "Department"} · Dashboard`} title={`Welcome, ${user.name}`} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 24 }}>
            <StatCard icon={<GraduationCap size={22} />} value={approvedStudents.length} label={`Students in ${user.department || "your department"}`} />
            <StatCard icon={<Users size={22} />} value={deptTeachers.length} label="Faculty in your department" />
          </div>
          <p style={{ fontSize: 12, color: "var(--slate)" }}>
            You're viewing only students enrolled in courses under the <b>{user.department || "—"}</b> department, and only faculty assigned to it — enforced by the server, not just hidden in this view.
          </p>
        </>
      )}
      {page === "faculty" && <FacultyDirectory teachers={deptTeachers} students={approvedStudents} actions={actions} readOnly />}
      {page === "students" && <StudentsDirectory students={approvedStudents} courses={store.courses} store={store} actions={actions} canImport={false} />}
      {page === "attendance" && <AttendanceMarking courses={store.courses} students={approvedStudents} actions={actions} />}
      {page === "grades" && <GradesEntry courses={store.courses} students={approvedStudents} grades={store.grades} actions={actions} />}
      {page === "myLeave" && <LeaveApplicationPanel user={user} actions={actions} />}
    </PortalShell>
  );
}

function AttendanceMarking({ courses, students, actions, teacherSubject }) {
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [date, setDate] = useState(todayISO());
  const [marks, setMarks] = useState({});
  const [markedForCourse, setMarkedForCourse] = useState(courseId);
  const roster = students.filter((s) => s.courseId === courseId);

  if (courseId !== markedForCourse) {
    setMarkedForCourse(courseId);
    const init = {};
    roster.forEach((s) => (init[s.id] = "Present"));
    setMarks(init);
  }

  const save = () => {
    actions.markAttendance(courseId, date, teacherSubject || courses.find((c) => c.id === courseId)?.name, marks);
  };

  return (
    <>
      <SectionHeader eyebrow="Register" title="Mark Attendance" />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 220 }}><label>Course</label>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <button className="btn btn-primary" onClick={save} disabled={roster.length === 0}><ClipboardCheck size={14} /> Save Attendance</button>
        </div>
      </div>
      <div className="card">
        {roster.length === 0 ? <div className="card-body"><EmptyState icon={<ClipboardCheck size={30} />} title="No students in this course" note="Approve admissions for this course first." /></div> : (
          <table className="ledger">
            <thead><tr><th>Roll No.</th><th>Name</th><th style={{ textAlign: "right" }}>Status</th></tr></thead>
            <tbody>
              {roster.map((s) => (
                <tr key={s.id}>
                  <td className="num">{s.rollNo}</td>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 6 }}>
                      {["Present", "Absent"].map((st) => (
                        <button key={st} className={`btn btn-sm ${marks[s.id] === st ? (st === "Present" ? "btn-success" : "btn-danger") : "btn-ghost"}`}
                          onClick={() => setMarks({ ...marks, [s.id]: st })}>{st}</button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function GradesEntry({ courses, students, grades, actions }) {
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const roster = students.filter((s) => s.courseId === courseId);
  const [studentId, setStudentId] = useState(roster[0]?.id || "");
  const [studentsForCourse, setStudentsForCourse] = useState(courseId);
  const [examType, setExamType] = useState(EXAM_TYPES[0]);
  const [semester, setSemester] = useState("1");
  const [rows, setRows] = useState([{ rid: uid("row"), subject: "", marks: "", maxMarks: "100" }]);
  const [err, setErr] = useState("");

  if (courseId !== studentsForCourse) {
    setStudentsForCourse(courseId);
    setStudentId(roster[0]?.id || "");
  }

  const setRow = (rid, patch) => setRows((prev) => prev.map((r) => r.rid === rid ? { ...r, ...patch } : r));
  const addRow = () => setRows((prev) => [...prev, { rid: uid("row"), subject: "", marks: "", maxMarks: "100" }]);
  const removeRow = (rid) => setRows((prev) => prev.length > 1 ? prev.filter((r) => r.rid !== rid) : prev);

  const submit = () => {
    if (!studentId) { setErr("Please select a student."); return; }
    const validRows = rows.filter((r) => r.subject.trim() && r.marks !== "");
    if (validRows.length === 0) { setErr("Enter at least one subject with marks obtained."); return; }
    setErr("");
    validRows.forEach((r) => {
      actions.addGrade(studentId, {
        subject: r.subject.trim(),
        marks: Number(r.marks),
        maxMarks: Number(r.maxMarks) || 100,
        examType, semester: Number(semester) || 1,
        id: uid("g"),
      });
    });
    setRows([{ rid: uid("row"), subject: "", marks: "", maxMarks: "100" }]);
  };

  const studentGrades = grades[studentId] || [];

  return (
    <>
      <SectionHeader eyebrow="Assessment" title="Enter Grades" />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          {err && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 14 }}>{err}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 6 }}>
            <div><label>Course</label>
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label>Student Name</label>
              <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                {roster.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.rollNo})</option>)}
              </select>
            </div>
            <div><label>Exam Type</label>
              <select value={examType} onChange={(e) => setExamType(e.target.value)}>
                {EXAM_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label>Semester</label>
              <input type="number" value={semester} onChange={(e) => setSemester(e.target.value)} />
            </div>
          </div>

          <div className="eyebrow" style={{ margin: "14px 0 8px" }}>Subjects</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            {rows.map((r) => (
              <div key={r.rid} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, alignItems: "start" }}>
                <div><label>Subject</label>
                  <input value={r.subject} onChange={(e) => setRow(r.rid, { subject: e.target.value })} placeholder="e.g. Law of Contracts" />
                </div>
                <div><label>Marks Obtained</label>
                  <input type="number" value={r.marks} onChange={(e) => setRow(r.rid, { marks: e.target.value })} />
                </div>
                <div><label>Max Marks</label>
                  <input type="number" value={r.maxMarks} onChange={(e) => setRow(r.rid, { maxMarks: e.target.value })} />
                </div>
                <div style={{ paddingTop: 22 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => removeRow(r.rid)} disabled={rows.length === 1}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={addRow} style={{ marginBottom: 14 }}><Plus size={13} /> Add Another Subject</button>

          <div>
            <button className="btn btn-primary" onClick={submit} disabled={!studentId}><Plus size={14} /> Save Grade(s)</button>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><h3 style={{ fontSize: 15 }}>Grade History {roster.find((s) => s.id === studentId) ? `— ${roster.find((s) => s.id === studentId).name}` : ""}</h3></div>
        {studentGrades.length === 0 ? <div className="card-body"><EmptyState icon={<Award size={28} />} title="No grades recorded" note="Add the first grade above." /></div> : (
          <table className="ledger">
            <thead><tr><th>Semester</th><th>Subject</th><th>Exam</th><th>Score</th><th></th></tr></thead>
            <tbody>
              {studentGrades.map((g) => (
                <tr key={g.id}>
                  <td className="num">Sem {g.semester}</td>
                  <td>{g.subject}</td>
                  <td>{g.examType}</td>
                  <td className="num">{g.marks}/{g.maxMarks}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => actions.removeGrade(studentId, g.id)}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ============================== STUDENT PORTAL ============================== */

function StudentPortal({ user, store, actions, onLogout }) {
  const [page, setPage] = useState("overview");
  const [showResult, setShowResult] = useState(false);
  const [payingOnline, setPayingOnline] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const student = store.students.find((s) => s.id === user.id);

  if (!student) return null;

  const course = store.courses.find((c) => c.id === student.courseId);

  // ---- Draft: student is still filling out the application ----
  if ((student.status || "").toLowerCase() === "draft") {
    const existingEmails = [
      ...store.students.filter((s) => s.id !== student.id).map((s) => s.email.toLowerCase()),
      ...store.teachers.map((t) => t.email.toLowerCase()),
    ];
    return (
      <div style={{ minHeight: "100vh", padding: "32px 20px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="eyebrow">Continuing your saved application</div>
          <button className="btn btn-ghost btn-sm" onClick={onLogout}><LogOut size={13} /> Sign Out</button>
        </div>
        <AdmissionForm
          courses={store.courses}
          existingEmails={existingEmails}
          resumeStudent={student}
          resumeAcademic={store.academicDetails[student.id] || []}
          resumeDocuments={store.documents[student.id] || []}
          resumeFeePaid={(store.fees[student.id]?.paid || 0) > 0}
          paymentsConfig={store.paymentsConfig}
          onSaveStep={actions.saveDraftStep}
          onSaveAcademic={actions.saveAcademicDetails}
          onUploadDocument={actions.uploadDocument}
          onDeleteDocument={actions.deleteDocument}
          onPayNow={actions.payFeeOnline}
          onFinalSubmit={async (snap, finalId) => { await actions.finalizeApplication(snap, finalId); }}
          onExit={onLogout}
        />
      </div>
    );
  }

  // ---- Pending / Rejected: submitted, awaiting or declined ----
  if ((student.status || "").toLowerCase() !== "approved") {
    return <PendingOrRejectedScreen student={student} course={course} store={store} actions={actions} onLogout={onLogout} />;
  }

  const attendance = store.attendance[student.id] || [];
  const pct = attendance.length ? Math.round((attendance.filter((r) => r.status === "Present").length / attendance.length) * 100) : null;
  const fee = store.fees[student.id];
  const gradeList = store.grades[student.id] || [];
  const myTransactions = store.transactions.filter((t) => t.studentId === student.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const myMessages = store.messages.filter((m) => m.toStudentId === student.id);
  const unreadCount = myMessages.filter((m) => !m.isRead).length;

  useEffect(() => {
    if (page === "inbox" && unreadCount > 0) actions.markMessagesRead(student.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const nav = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard size={16} /> },
    { key: "application", label: "My Application", icon: <FileText size={16} /> },
    { key: "editProfile", label: "Edit Profile", icon: <User size={16} /> },
    { key: "attendance", label: "Attendance", icon: <ClipboardCheck size={16} /> },
    { key: "grades", label: "Grades", icon: <Award size={16} /> },
    { key: "fees", label: "Fees & Payments", icon: <Wallet size={16} /> },
    { key: "courses", label: "Courses", icon: <BookOpen size={16} /> },
    { key: "inbox", label: "Notifications", icon: <Bell size={16} />, count: unreadCount },
    { key: "notices", label: "Notice Board", icon: <Bell size={16} /> },
  ];

  return (
    <PortalShell roleLabel="Student" userName={student.name} navItems={nav} active={page} onNav={setPage} onLogout={onLogout}>
      {page === "overview" && (
        <>
          <SectionHeader eyebrow={student.rollNo} title={`Welcome, ${student.name.split(" ")[0]}`} />
          {(!fee || fee.paid === 0) && (
            <div className="card" style={{ marginBottom: 20, background: "var(--warn-bg)", borderColor: "var(--warn)" }}>
              <div className="card-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, padding: "14px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Clock size={20} color="var(--warn)" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>Payment Pending</div>
                    <div style={{ fontSize: 12, color: "var(--slate)" }}>You haven't made any fee payment yet. Complete your payment to avoid delays with your admission.</div>
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setPage("fees")}>Go to Fees & Payments</button>
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
            <StatCard icon={<BookOpen size={22} />} value={course?.name || "—"} label="Programme" />
            <StatCard icon={<ClipboardCheck size={22} />} value={pct === null ? "—" : `${pct}%`} label="Attendance" accent={pct !== null && pct < 75 ? "var(--danger)" : "var(--success)"} />
            <StatCard icon={<Wallet size={22} />} value={fee ? `₹${(fee.totalFee - fee.paid).toLocaleString("en-IN")}` : "—"} label="Fee Balance" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="card"><div className="card-header"><h3 style={{ fontSize: 15 }}>Latest Notices</h3></div>
              <div className="card-body">
                {store.notices.length === 0 ? <EmptyState icon={<Bell size={28} />} title="No notices" note="Check back later." /> :
                  store.notices.slice(0, 4).map((n) => (
                    <div key={n.id} style={{ padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{n.title}</div>
                      <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{fmtDate(n.date)}</div>
                    </div>
                  ))}
              </div>
            </div>
            <div className="card"><div className="card-header"><h3 style={{ fontSize: 15 }}>Notifications for You</h3></div>
              <div className="card-body">
                {myMessages.length === 0 ? <EmptyState icon={<Bell size={28} />} title="No notifications" note="Messages from faculty or admin appear here." /> :
                  myMessages.slice(0, 4).map((m) => (
                    <div key={m.id} style={{ padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.text}</div>
                      <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{fmtDate(m.date)} &middot; {m.fromName}</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}

      {page === "application" && (
        <>
          <SectionHeader eyebrow="Read Only" title="My Application" />
          <ApplicationSummary student={student} course={course} academicDetails={store.academicDetails[student.id] || []} documents={store.documents[student.id] || []} />
        </>
      )}

      {page === "editProfile" && <StudentEditProfile student={student} actions={actions} />}

      {page === "attendance" && (
        <>
          <SectionHeader eyebrow="Register" title="Attendance Record" />
          <div className="card">
            {attendance.length === 0 ? <div className="card-body"><EmptyState icon={<ClipboardCheck size={28} />} title="No attendance recorded yet" note="Your faculty will begin marking attendance shortly." /></div> : (
              <table className="ledger">
                <thead><tr><th>Date</th><th>Subject</th><th>Status</th></tr></thead>
                <tbody>{[...attendance].reverse().map((r, i) => (
                  <tr key={i}><td>{fmtDate(r.date)}</td><td>{r.subject}</td>
                    <td><span style={{ color: r.status === "Present" ? "var(--success)" : "var(--danger)", fontWeight: 700, fontSize: 12.5 }}>{r.status}</span></td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>
      )}

      {page === "grades" && (
        <>
          <SectionHeader
            eyebrow="Results" title="Academic Record"
            action={<button className="btn btn-outline" onClick={() => setShowResult(true)}><Eye size={14} /> View Result</button>}
          />
          <div className="card">
            {gradeList.length === 0 ? <div className="card-body"><EmptyState icon={<Award size={28} />} title="No results published" note="Grades will appear here once entered by faculty." /></div> : (
              <table className="ledger">
                <thead><tr><th>Semester</th><th>Subject</th><th>Exam</th><th>Score</th></tr></thead>
                <tbody>{gradeList.map((g) => (
                  <tr key={g.id}><td className="num">Sem {g.semester}</td><td>{g.subject}</td><td>{g.examType}</td><td className="num">{g.marks}/{g.maxMarks}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>
      )}

      {showResult && (
        <Modal title="Result Card" onClose={() => setShowResult(false)} width={760}>
          <ResultCard student={student} course={course} grades={gradeList} />
        </Modal>
      )}

      {page === "fees" && (
        <>
          {(() => {
            const balanceDue = fee ? fee.totalFee - fee.paid : 0;
            const daysUntilDue = fee?.dueDate ? Math.ceil((new Date(fee.dueDate) - new Date()) / 86400000) : null;
            const isOverdue = balanceDue > 0 && daysUntilDue !== null && daysUntilDue < 0;
            const isDueSoon = balanceDue > 0 && daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 7;
            const payLabel = fee?.plan ? "Pay EMI Now" : "Pay Now";
            return (
              <>
                <SectionHeader
                  eyebrow="Accounts" title="Fees & Payments"
                  action={balanceDue > 0 && (
                    store.paymentsConfig?.available ? (
                      <button className={`btn ${isOverdue || isDueSoon ? "btn-danger" : "btn-primary"}`} onClick={() => setPayingOnline(true)}>
                        <Wallet size={14} /> {isOverdue || isDueSoon ? payLabel : "Pay Online"}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--slate)" }}>Online payment isn't turned on right now — pay by cash at the accounts office.</span>
                    )
                  )}
                />
                {(isOverdue || isDueSoon) && (
                  <div className="card" style={{ marginBottom: 16, background: isOverdue ? "var(--danger-bg)" : "var(--warn-bg)", borderColor: isOverdue ? "var(--danger)" : "var(--warn)" }}>
                    <div className="card-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, padding: "14px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Clock size={20} color={isOverdue ? "var(--danger)" : "var(--warn)"} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>
                            {isOverdue
                              ? `Payment Overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? "" : "s"}`
                              : daysUntilDue === 0 ? "Payment Due Today" : `Payment Due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--slate)" }}>
                            {fee.plan ? `Next EMI of ₹${Number(fee.plan.installmentAmount).toLocaleString("en-IN")}` : `₹${balanceDue.toLocaleString("en-IN")}`} due on {fmtDate(fee.dueDate)}.
                          </div>
                        </div>
                      </div>
                      {store.paymentsConfig?.available && (
                        <button className="btn btn-danger btn-sm" onClick={() => setPayingOnline(true)}><Wallet size={13} /> {payLabel}</button>
                      )}
                    </div>
                  </div>
                )}
                <div className="card" style={{ marginBottom: 16 }}><div className="card-body">
                  {!fee ? <EmptyState icon={<Wallet size={28} />} title="No fee record" note="Please contact the accounts office." /> : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
                      <div><div style={{ fontSize: 11, color: "var(--slate)", textTransform: "uppercase" }}>Total Fee</div><div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700 }}>₹{fee.totalFee.toLocaleString("en-IN")}</div></div>
                      <div><div style={{ fontSize: 11, color: "var(--slate)", textTransform: "uppercase" }}>Paid</div><div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--success)" }}>₹{fee.paid.toLocaleString("en-IN")}</div></div>
                      <div><div style={{ fontSize: 11, color: "var(--slate)", textTransform: "uppercase" }}>Balance</div><div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--danger)" }}>₹{balanceDue.toLocaleString("en-IN")}</div></div>
                      <div><div style={{ fontSize: 11, color: "var(--slate)", textTransform: "uppercase" }}>Due Date</div><div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: isOverdue ? "var(--danger)" : "inherit" }}>{fee.dueDate ? fmtDate(fee.dueDate) : "—"}</div></div>
                    </div>
                  )}
                </div></div>
              </>
            );
          })()}

          {fee?.plan && (
            <div className="card" style={{ marginBottom: 16 }}><div className="card-body">
              <div className="eyebrow" style={{ marginBottom: 12 }}>EMI Plan</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, fontSize: 13.5 }}>
                <div><div style={{ fontSize: 11, color: "var(--slate)", textTransform: "uppercase" }}>Installment Amount</div><div style={{ fontWeight: 700, marginTop: 2 }}>₹{Number(fee.plan.installmentAmount).toLocaleString("en-IN")}</div></div>
                <div><div style={{ fontSize: 11, color: "var(--slate)", textTransform: "uppercase" }}>Tenure</div><div style={{ fontWeight: 700, marginTop: 2 }}>{fee.plan.tenureMonths} EMIs</div></div>
                <div><div style={{ fontSize: 11, color: "var(--slate)", textTransform: "uppercase" }}>EMIs Paid</div><div style={{ fontWeight: 700, marginTop: 2, color: "var(--success)" }}>{fee.plan.emisPaid}</div></div>
                <div><div style={{ fontSize: 11, color: "var(--slate)", textTransform: "uppercase" }}>EMIs Remaining</div><div style={{ fontWeight: 700, marginTop: 2, color: "var(--danger)" }}>{Math.max(0, fee.plan.tenureMonths - fee.plan.emisPaid)}</div></div>
              </div>
            </div></div>
          )}

          <div className="card">
            <div className="card-header"><h3 style={{ fontSize: 15 }}>Payment History</h3></div>
            {myTransactions.length === 0 ? <div className="card-body"><EmptyState icon={<Wallet size={28} />} title="No payments recorded" note="Your payment history will appear here." /></div> : (
              <table className="ledger">
                <thead><tr><th>Date</th><th>Amount</th><th>Type</th><th>Mode</th><th>Recorded By</th><th></th></tr></thead>
                <tbody>{myTransactions.map((t) => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.date)}</td>
                    <td className="num">₹{t.totalAmount.toLocaleString("en-IN")}</td>
                    <td>{t.paymentType}</td>
                    <td>{t.paymentMode}</td>
                    <td>{t.recordedByName}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setViewingReceipt(t)}><Eye size={13} /> View</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>
      )}

      {viewingReceipt && (
        <PaymentReceiptModal transaction={viewingReceipt} student={student} course={course} onClose={() => setViewingReceipt(null)} />
      )}

      {payingOnline && (
        <PayOnlineModal student={student} fee={fee} actions={actions} onClose={() => setPayingOnline(false)} />
      )}

      {page === "courses" && (
        <>
          <SectionHeader eyebrow="Published by Administrator" title="Courses Offered" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
            {store.courses.map((c) => (
              <div className="card" key={c.id} style={{ borderColor: c.id === student.courseId ? "var(--gold)" : "var(--border)" }}>
                <div className="card-body">
                  <div className="eyebrow">{c.code} &middot; {c.group || "Graduation"}{c.id === student.courseId ? " · Your Programme" : ""}</div>
                  <h3 style={{ fontSize: 16, marginTop: 4 }}>{c.name}</h3>
                  <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 12.5, color: "var(--slate)" }}>
                    <div>Duration<br /><b style={{ color: "var(--charcoal)" }}>{c.duration}</b></div>
                    <div>Admission Fee<br /><b style={{ color: "var(--charcoal)" }}>₹{Number(c.admissionFee ?? 0).toLocaleString("en-IN")}</b></div>
                    <div>Annual Fee<br /><b style={{ color: "var(--charcoal)" }}>₹{Number(c.fee).toLocaleString("en-IN")}</b></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {page === "inbox" && (
        <>
          <SectionHeader eyebrow="From Faculty & Administration" title="Notifications" />
          {myMessages.length === 0 ? <div className="card"><div className="card-body"><EmptyState icon={<Bell size={28} />} title="No notifications" note="Messages sent to you will appear here." /></div></div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {myMessages.map((m) => (
                <div className="card" key={m.id}><div className="card-body">
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--slate)", marginBottom: 6 }}>
                    <span className={`badge-role badge-${m.fromRole === "admin" ? "admin" : "teacher"}`}>{m.fromRole === "admin" ? "Administrator" : "Faculty"}</span>
                    <span>{fmtDate(m.date)}</span>
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{m.text}</div>
                  <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 6 }}>— {m.fromName}</div>
                </div></div>
              ))}
            </div>
          )}
        </>
      )}

      {page === "notices" && (
        <>
          <SectionHeader eyebrow="Announcements" title="Notice Board" />
          {store.notices.length === 0 ? <div className="card"><div className="card-body"><EmptyState icon={<Bell size={28} />} title="No notices" note="Check back later." /></div></div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {store.notices.map((n) => (
                <div className="card" key={n.id}><div className="card-body">
                  <h3 style={{ fontSize: 15 }}>{n.title}</h3>
                  <div style={{ fontSize: 11.5, color: "var(--slate)", margin: "4px 0 8px" }}>{fmtDate(n.date)} &middot; {n.postedByName}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{n.content}</div>
                </div></div>
              ))}
            </div>
          )}
        </>
      )}
    </PortalShell>
  );
}

function PendingOrRejectedScreen({ student, course, store, actions, onLogout }) {
  const [showApp, setShowApp] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState("");
  const myEmail = store.emails.filter((e) => e.to === student.email).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const isPending = (student.status || "").toLowerCase() === "pending";
  const fee = store.fees[student.id];
  const needsPayment = isPending && (!fee || fee.paid === 0) && Number(student.amount) > 0;

  const payNow = async () => {
    setPayErr(""); setPaying(true);
    try {
      await actions.payFeeOnline({ studentId: student.id, feeAmount: Number(student.amount) || 0, additionalFees: [], totalAmount: Number(student.amount) || 0, paymentMode: "Single" });
    } catch (ex) {
      setPayErr(ex.message || "Payment could not be completed.");
    }
    setPaying(false);
  };

  return (
    <div style={{ minHeight: "100vh", padding: "40px 20px" }}>
      <div className="card" style={{ maxWidth: 620, margin: "0 auto", textAlign: "center" }}>
        <div className="card-body">
          <div style={{ marginBottom: 14, display: "flex", justifyContent: "center" }}><CollegeMark /></div>
          <Seal status={student.status} />
          <h2 style={{ fontSize: 19, margin: "16px 0 8px" }}>
            {isPending ? "Application Under Review" : "Application Not Approved"}
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.6 }}>
            {isPending
              ? "Thank you for applying, " + student.name + ". The admissions office is reviewing your application. You'll gain full portal access once approved."
              : "Your application was not approved" + (student.rejectReason ? `: ${student.rejectReason}` : ".") + " Please contact the admissions office for details."}
          </p>
          {needsPayment && (
            <div className="card" style={{ textAlign: "left", marginTop: 16, background: "var(--warn-bg)", borderColor: "var(--warn)" }}>
              <div className="card-body" style={{ padding: "14px 16px" }}>
                {payErr && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "8px 12px", borderRadius: 4, fontSize: 12.5, marginBottom: 10 }}>{payErr}</div>}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Clock size={18} color="var(--warn)" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>Payment Pending</div>
                      <div style={{ fontSize: 11.5, color: "var(--slate)" }}>Admission Fee: ₹{Number(student.amount).toLocaleString("en-IN")}</div>
                    </div>
                  </div>
                  {store.paymentsConfig?.available ? (
                    <button className="btn btn-primary btn-sm" onClick={payNow} disabled={paying}>
                      <Wallet size={13} /> {paying ? "Opening Payment…" : "Pay Now"}
                    </button>
                  ) : (
                    <span style={{ fontSize: 11.5, color: "var(--slate)" }}>Online payment unavailable right now.</span>
                  )}
                </div>
              </div>
            </div>
          )}
          {myEmail && (
            <div className="card" style={{ textAlign: "left", marginTop: 16, background: "#FBF9F4" }}>
              <div className="card-body" style={{ fontSize: 12 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Registration Email Sent To {student.email}</div>
                <div style={{ whiteSpace: "pre-line", lineHeight: 1.6 }}>{myEmail.body}</div>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
            <button className="btn btn-outline" onClick={() => setShowApp((v) => !v)}>{showApp ? "Hide" : "View"} My Application</button>
            <button className="btn btn-ghost" onClick={onLogout}>Sign Out</button>
          </div>
        </div>
      </div>
      {showApp && (
        <div style={{ maxWidth: 620, margin: "20px auto 0" }}>
          <ApplicationSummary student={student} course={course} academicDetails={store.academicDetails[student.id] || []} documents={store.documents[student.id] || []} />
        </div>
      )}
    </div>
  );
}

function StatusBanner({ text }) {
  if (!text) return null;
  const isErr = text.startsWith("err:");
  return <div style={{ background: isErr ? "var(--danger-bg)" : "var(--success-bg)", color: isErr ? "var(--danger)" : "var(--success)", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 14 }}>{text.slice(4)}</div>;
}

function StudentEditProfile({ student, actions }) {
  const [f, setF] = useState({ phone: student.phone || "", permanentAddress: student.permanentAddress || student.address || "", emergencyMobile: student.emergencyMobile || "" });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [msg, setMsg] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  const saveContact = () => {
    if (!PHONE_RE.test(f.phone.trim())) { setMsg("err:Phone number must be exactly 10 digits."); return; }
    if (!f.permanentAddress.trim()) { setMsg("err:Address cannot be empty."); return; }
    if (!PHONE_RE.test(f.emergencyMobile.trim())) { setMsg("err:Emergency mobile must be exactly 10 digits."); return; }
    actions.updateStudentProfile(student.id, { phone: f.phone.trim(), permanentAddress: f.permanentAddress.trim(), address: f.permanentAddress.trim(), emergencyMobile: f.emergencyMobile.trim() });
    setMsg("ok:Contact details updated successfully.");
  };

  const savePassword = async () => {
    if (pw.next.length < 6) { setPwMsg("err:New password must be at least 6 characters."); return; }
    if (pw.next !== pw.confirm) { setPwMsg("err:New password and confirmation do not match."); return; }
    try {
      await actions.changePassword("student", student.id, pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      setPwMsg("ok:Password changed successfully.");
    } catch (e) {
      setPwMsg(`err:${e.message || "Could not change password."}`);
    }
  };

  return (
    <>
      <SectionHeader eyebrow="Self Service" title="Edit Profile" />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3 style={{ fontSize: 15 }}>Contact Details</h3></div>
        <div className="card-body">
          <StatusBanner text={msg} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Phone Number" inputProps={{ value: f.phone, onChange: (e) => setF({ ...f, phone: e.target.value }) }} />
            <Field label="Emergency Mobile No." inputProps={{ value: f.emergencyMobile, onChange: (e) => setF({ ...f, emergencyMobile: e.target.value }) }} />
          </div>
          <Field label="Permanent Address" as="textarea" inputProps={{ value: f.permanentAddress, onChange: (e) => setF({ ...f, permanentAddress: e.target.value }) }} />
          <button className="btn btn-primary" onClick={saveContact}>Save Contact Details</button>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><h3 style={{ fontSize: 15 }}>Reset Password</h3></div>
        <div className="card-body">
          <StatusBanner text={pwMsg} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <Field label="Current Password" inputProps={{ type: "password", value: pw.current, onChange: (e) => setPw({ ...pw, current: e.target.value }) }} />
            <Field label="New Password" inputProps={{ type: "password", value: pw.next, onChange: (e) => setPw({ ...pw, next: e.target.value }) }} />
            <Field label="Confirm New Password" inputProps={{ type: "password", value: pw.confirm, onChange: (e) => setPw({ ...pw, confirm: e.target.value }) }} />
          </div>
          <button className="btn btn-primary" onClick={savePassword}>Update Password</button>
        </div>
      </div>
    </>
  );
}

/* ============================== ROOT APP ============================== */

export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [user, setUser] = useState(null);
  const [paymentReturnStatus, setPaymentReturnStatus] = useState(null);
  const [view, setView] = useState("login");
  const [store, setStore] = useState({ students: [], teachers: [], courses: [], notices: [], attendance: {}, grades: {}, fees: {}, transactions: [], messages: [], emails: [], paymentsConfig: { provider: "none", razorpay: { configured: false, keyId: null }, payu: { configured: false }, available: false }, academicDetails: {}, documents: {} });

  const groupByStudent = (rows, mapFn) => {
    const out = {};
    rows.forEach((r) => { (out[r.studentId] ||= []).push(mapFn ? mapFn(r) : r); });
    return out;
  };

  const loadAll = async () => {
    try {
      const [students, teachers, courses, notices, attendanceRows, gradeRows, feeRows, transactions, messages, emails, academicRows, documentRows] = await Promise.all([
        api.get("/students"), api.get("/teachers"), api.get("/courses"), api.get("/notices"),
        api.get("/attendance"), api.get("/grades"), api.get("/fees"),
        api.get("/transactions"), api.get("/messages"), api.get("/emails"),
        api.get("/academic-details"), api.get("/documents"),
      ]);
      const attendance = groupByStudent(attendanceRows, (r) => ({ date: r.date, subject: r.subject, status: r.status }));
      const grades = groupByStudent(gradeRows);
      const academicDetails = groupByStudent(academicRows);
      const documents = groupByStudent(documentRows);
      const fees = {};
      feeRows.forEach((f) => { fees[f.studentId] = { totalFee: f.totalFee, paid: f.paid, dueDate: f.dueDate, plan: f.plan, extraFields: f.extraFields }; });
      const paymentsConfig = await api.get("/payments/config").catch(() => ({ provider: "none", razorpay: { configured: false, keyId: null }, payu: { configured: false }, available: false }));
      setStore({ students, teachers, courses, notices, attendance, grades, fees, transactions, messages, emails, paymentsConfig, academicDetails, documents });
      setLoadError("");
    } catch (e) {
      setLoadError(e.message || "Could not load data from the server.");
    }
    setLoading(false);
  };

  // On mount: if a token from a previous session is stored, try to restore
  // that session (fresh permissions in case Super Admin changed them since
  // the token was issued) and load data. Otherwise, nothing to load yet —
  // the app only fetches the full dataset AFTER a successful login, not
  // before (most endpoints now require authentication, and eagerly loading
  // everything for an anonymous visitor just looking at the login screen
  // would be both wasteful and, since this change, mostly just 401s anyway).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const restore = async () => {
      if (!getAuthToken()) { setLoading(false); return; }
      try {
        const me = await api.get("/auth/me");
        setUser({ role: me.role, id: me.id, name: me.name, department: me.department || null, permissions: me.permissions || null });
        await loadAll();
      } catch {
        setAuthToken(null); // stored token is invalid/expired
        setLoading(false);
      }
    };
    restore();
  }, []);

  // The admission form needs the list of courses before anyone has logged
  // in at all (a prospective student picks a course while applying) — that
  // one endpoint is intentionally public, so this fetches just that, rather
  // than the full loadAll().
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!user && view === "admission" && store.courses.length === 0) {
      api.get("/courses").then((courses) => setStore((prev) => ({ ...prev, courses }))).catch(() => {});
    }
  }, [user, view]);

  // Detects the browser landing back on the app after PayU's redirect flow
  // (?payment=success or ?payment=failed on the URL) — Razorpay doesn't need
  // this since it never leaves the page. Cleans the query string so a page
  // refresh doesn't re-trigger the banner, and refreshes fee/transaction
  // data so a successful payment shows up immediately.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (payment === "success" || payment === "failed") {
      setPaymentReturnStatus(payment);
      window.history.replaceState({}, "", window.location.pathname);
      if (payment === "success" && getAuthToken()) loadAll();
    }
  }, []);

  const emailsExcept = (excludeId) => [
    ...store.students.filter((s) => s.id !== excludeId).map((s) => s.email.toLowerCase()),
    ...store.teachers.map((t) => t.email.toLowerCase()),
  ];

  const login = async (role, id, password) => {
    const res = await api.post("/auth/login", { role, id, password }); // throws with server error message on failure
    setAuthToken(res.token);
    setUser({ role: res.role, id: res.id, name: res.name, department: res.department || null, permissions: res.permissions || null });
    await loadAll();
    return res;
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
    setStore({ students: [], teachers: [], courses: [], notices: [], attendance: {}, grades: {}, fees: {}, transactions: [], messages: [], emails: [], paymentsConfig: { provider: "none", razorpay: { configured: false, keyId: null }, payu: { configured: false }, available: false }, academicDetails: {}, documents: {} });
    setView("login");
  };

  const actions = useMemo(() => ({
    approveStudent: async (studentId) => {
      const student = await api.patch(`/students/${studentId}/approve`);
      const fee = await api.get("/fees").then((rows) => rows.find((f) => f.studentId === studentId));
      setStore((prev) => ({
        ...prev,
        students: prev.students.map((s) => s.id === studentId ? student : s),
        fees: fee ? { ...prev.fees, [studentId]: { totalFee: fee.totalFee, paid: fee.paid, dueDate: fee.dueDate, plan: fee.plan, extraFields: fee.extraFields } } : prev.fees,
      }));
    },
    rejectStudent: async (studentId, reason) => {
      const student = await api.patch(`/students/${studentId}/reject`, { reason });
      setStore((prev) => ({ ...prev, students: prev.students.map((s) => s.id === studentId ? student : s) }));
    },
    addTeacher: async (t) => {
      const created = await api.post("/teachers", t);
      setStore((prev) => ({ ...prev, teachers: [...prev.teachers, created] }));
    },
    updateTeacher: async (id, patch) => {
      const updated = await api.patch(`/teachers/${id}`, patch);
      setStore((prev) => ({ ...prev, teachers: prev.teachers.map((t) => t.id === id ? updated : t) }));
    },
    removeTeacher: async (id) => {
      await api.del(`/teachers/${id}`);
      setStore((prev) => ({ ...prev, teachers: prev.teachers.filter((t) => t.id !== id) }));
    },
    deleteTeachers: async (ids) => {
      await api.post("/teachers/bulk-delete", { ids });
      setStore((prev) => ({ ...prev, teachers: prev.teachers.filter((t) => !ids.includes(t.id)) }));
    },
    addCourse: async (c) => {
      const created = await api.post("/courses", c);
      setStore((prev) => ({ ...prev, courses: [...prev.courses, created] }));
    },
    removeCourse: async (id) => {
      await api.del(`/courses/${id}`);
      setStore((prev) => ({ ...prev, courses: prev.courses.filter((c) => c.id !== id) }));
    },
    addNotice: async (n) => {
      const created = await api.post("/notices", n);
      setStore((prev) => ({ ...prev, notices: [created, ...prev.notices] }));
    },
    removeNotice: async (id) => {
      await api.del(`/notices/${id}`);
      setStore((prev) => ({ ...prev, notices: prev.notices.filter((n) => n.id !== id) }));
    },
    updateFeePaid: async (studentId, paid, dueDate) => {
      const fee = await api.patch(`/fees/${studentId}`, { paid, dueDate });
      setStore((prev) => ({ ...prev, fees: { ...prev.fees, [studentId]: { totalFee: fee.totalFee, paid: fee.paid, dueDate: fee.dueDate, plan: fee.plan, extraFields: fee.extraFields } } }));
    },
    deleteFeeRecords: async (studentIds) => {
      await api.post("/fees/bulk-delete", { studentIds });
      setStore((prev) => {
        const fees = { ...prev.fees };
        studentIds.forEach((id) => delete fees[id]);
        return { ...prev, fees };
      });
    },
    markAttendance: async (courseId, date, subject, marksMap) => {
      await api.post("/attendance/mark", { date, subject, marks: marksMap });
      setStore((prev) => {
        const next = { ...prev.attendance };
        Object.keys(marksMap).forEach((studentId) => {
          const list = (next[studentId] || []).filter((r) => !(r.date === date && r.subject === subject));
          next[studentId] = [...list, { date, subject, status: marksMap[studentId] }];
        });
        return { ...prev, attendance: next };
      });
    },
    addGrade: async (studentId, grade) => {
      const created = await api.post("/grades", { studentId, ...grade });
      setStore((prev) => ({ ...prev, grades: { ...prev.grades, [studentId]: [...(prev.grades[studentId] || []), created] } }));
    },
    removeGrade: async (studentId, gradeId) => {
      await api.del(`/grades/${gradeId}`);
      setStore((prev) => ({ ...prev, grades: { ...prev.grades, [studentId]: (prev.grades[studentId] || []).filter((g) => g.id !== gradeId) } }));
    },
    updateStudentProfile: async (studentId, patch) => {
      const student = await api.patch(`/students/${studentId}`, patch);
      setStore((prev) => ({ ...prev, students: prev.students.map((s) => s.id === studentId ? student : s) }));
    },
    changePassword: async (role, id, currentPassword, newPassword) => {
      await api.post("/auth/change-password", { role, id, currentPassword, newPassword });
    },
    deleteStudents: async (ids) => {
      await api.post("/students/bulk-delete", { ids });
      setStore((prev) => ({ ...prev, students: prev.students.filter((s) => !ids.includes(s.id)) }));
    },

    // ---- Draft admission workflow ----
    saveDraftStep: async (snapshot, step, existingDraftId) => {
      const password = snapshot.password;
      const rest = omitCreds(snapshot);
      const body = existingDraftId ? { draftId: existingDraftId, step, ...rest } : { step, ...rest, password };
      const res = await api.post("/students/draft", body);
      setStore((prev) => {
        const exists = prev.students.some((s) => s.id === res.id);
        const students = exists
          ? prev.students.map((s) => s.id === res.id ? { ...s, ...rest, savedUpTo: Math.max(s.savedUpTo || 0, step) } : s)
          : [...prev.students, { id: res.id, ...rest, status: "draft", savedUpTo: step, createdAt: new Date().toISOString() }];
        return { ...prev, students };
      });
      return res.id;
    },
    finalizeApplication: async (snapshot, finalId) => {
      const password = snapshot.password;
      const rest = omitCreds(snapshot);
      const student = await api.post(`/students/${finalId}/finalize`, { ...rest, password });
      setStore((prev) => ({ ...prev, students: prev.students.map((s) => s.id === finalId ? student : s) }));
      const email = composeRegistrationEmail({ ...student, password }); // client-side preview only; server already stored the authoritative copy
      setStore((prev) => ({ ...prev, emails: [{ ...email, to: student.email }, ...prev.emails] }));
      return { ...student, password };
    },

    // ---- Fee transactions (admin/faculty only) ----
    recordTransaction: async (txn) => {
      const created = await api.post("/transactions", txn);
      const [feeRows, student] = await Promise.all([api.get("/fees"), Promise.resolve(store.students.find((s) => s.id === txn.studentId))]);
      const fee = feeRows.find((f) => f.studentId === txn.studentId);
      setStore((prev) => ({
        ...prev,
        transactions: [created, ...prev.transactions],
        fees: fee ? { ...prev.fees, [txn.studentId]: { totalFee: fee.totalFee, paid: fee.paid, dueDate: fee.dueDate, plan: fee.plan, extraFields: fee.extraFields } } : prev.fees,
        emails: student ? [composeFeeReceiptEmail(student, created), ...prev.emails] : prev.emails,
      }));
    },

    // ---- Online payment (student self-service, via Razorpay) ----
    payFeeOnline: async ({ studentId, feeAmount, additionalFees, totalAmount, paymentMode, planTotalAmount, tenureMonths }) => {
      const provider = store.paymentsConfig?.provider;

      if (provider === "payu") {
        // PayU isn't a JS popup — the browser has to physically navigate to
        // PayU's payment page via a real form POST. This call never
        // "returns" a result the normal way; the page leaves and comes back
        // later at ?payment=success/failed (handled in the App component).
        const order = await api.post("/payments/payu/create-order", {
          studentId, feeAmount, additionalFees, totalAmount, paymentMode, planTotalAmount, tenureMonths,
        });
        submitPayuRedirectForm(order.payuUrl, order.fields);
        return { redirecting: true };
      }

      // Default / "razorpay": JS checkout popup, resolves in-page.
      const order = await api.post("/payments/razorpay/create-order", {
        studentId, feeAmount, additionalFees, totalAmount, paymentMode, planTotalAmount, tenureMonths,
      });
      await loadRazorpayScript();

      const created = await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.orderId,
          name: COLLEGE_NAME,
          description: "Fee Payment",
          prefill: { name: order.studentName, email: order.studentEmail, contact: order.studentPhone || "" },
          theme: { color: "#7A2E2E" },
          handler: async (response) => {
            try {
              const txn = await api.post("/payments/razorpay/verify", {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              resolve(txn);
            } catch (e) {
              reject(e);
            }
          },
          modal: { ondismiss: () => reject(new Error("Payment cancelled.")) },
        });
        rzp.on("payment.failed", (resp) => reject(new Error(resp?.error?.description || "Payment failed.")));
        rzp.open();
      });

      const feeRows = await api.get("/fees");
      const fee = feeRows.find((f) => f.studentId === studentId);
      const student = store.students.find((s) => s.id === studentId);
      setStore((prev) => ({
        ...prev,
        transactions: [created, ...prev.transactions],
        fees: fee ? { ...prev.fees, [studentId]: { totalFee: fee.totalFee, paid: fee.paid, dueDate: fee.dueDate, plan: fee.plan, extraFields: fee.extraFields } } : prev.fees,
        emails: student ? [composeFeeReceiptEmail(student, created), ...prev.emails] : prev.emails,
      }));
      return created;
    },
    setPaymentProvider: async (provider) => {
      await api.patch("/payments/config", { provider });
      const paymentsConfig = await api.get("/payments/config").catch(() => store.paymentsConfig);
      setStore((prev) => ({ ...prev, paymentsConfig }));
    },
    sendFeeReminders: async () => {
      const result = await api.post("/fees/send-due-reminders");
      // Refresh messages/emails so admin sees the newly-sent reminders immediately.
      const [messages, emails] = await Promise.all([api.get("/messages"), api.get("/emails")]);
      setStore((prev) => ({ ...prev, messages, emails }));
      return result;
    },

    // ---- Leave requests ----
    listLeaveRequests: async (teacherId) => api.get(teacherId ? `/leave?teacherId=${encodeURIComponent(teacherId)}` : "/leave"),
    applyForLeave: async (payload) => api.post("/leave", payload),
    decideLeave: async (id, status, decisionNote) => api.patch(`/leave/${id}`, { status, decisionNote }),

    // ---- Super Admin: manage Admin accounts ----
    listAdmins: async () => api.get("/admins"),
    createAdmin: async (payload) => api.post("/admins", payload),
    updateAdmin: async (id, patch) => api.patch(`/admins/${id}`, patch),
    updateAdminPermissions: async (id, permissions) => api.patch(`/admins/${id}/permissions`, { permissions }),
    resetAdminPassword: async (id, newPassword) => api.post(`/admins/${id}/reset-password`, { newPassword }),
    deleteAdmin: async (id) => api.del(`/admins/${id}`),

    // ---- Academic details (admission wizard step 6) ----
    saveAcademicDetails: async (studentId, rows) => {
      const result = await api.post("/academic-details/sync", { studentId, rows });
      setStore((prev) => ({ ...prev, academicDetails: { ...prev.academicDetails, [studentId]: result.rows } }));
      return result;
    },
    deleteAcademicRow: async (id) => {
      await api.del(`/academic-details/${id}`);
      setStore((prev) => {
        const next = { ...prev.academicDetails };
        Object.keys(next).forEach((sid) => { next[sid] = next[sid].filter((r) => r.id !== id); });
        return { ...prev, academicDetails: next };
      });
    },

    // ---- Documents (admission wizard step 7) — real files, stored in a per-student folder server-side ----
    uploadDocument: async (studentId, meta, file) => {
      const formData = new FormData();
      formData.append("studentId", studentId);
      formData.append("sno", meta.sno);
      formData.append("documentType", meta.documentType);
      formData.append("originalPhotocopy", meta.originalPhotocopy);
      formData.append("documentNo", meta.documentNo || "");
      formData.append("file", file);
      const created = await api.upload("/documents/upload", formData);
      setStore((prev) => ({ ...prev, documents: { ...prev.documents, [studentId]: [...(prev.documents[studentId] || []), created] } }));
      return created;
    },
    deleteDocument: async (id) => {
      await api.del(`/documents/${id}`);
      setStore((prev) => {
        const next = { ...prev.documents };
        Object.keys(next).forEach((sid) => { next[sid] = next[sid].filter((d) => d.id !== id); });
        return { ...prev, documents: next };
      });
    },

    // ---- Targeted notifications ----
    sendMessage: async (msg) => {
      const created = await api.post("/messages", msg);
      setStore((prev) => ({ ...prev, messages: [created, ...prev.messages] }));
    },

    markMessagesRead: async (studentId) => {
      await api.patch("/messages/mark-all-read", { studentId });
      setStore((prev) => ({
        ...prev,
        messages: prev.messages.map((m) => (m.toStudentId === studentId ? { ...m, isRead: true } : m)),
      }));
    },

    // ---- Dynamic CSV import (admin only) ----
    importStudentsCsv: async (rows) => {
      const summary = await api.post("/import/students", { rows });
      const [students, fees] = await Promise.all([api.get("/students"), api.get("/fees")]);
      const feesMap = {};
      fees.forEach((f) => { feesMap[f.studentId] = { totalFee: f.totalFee, paid: f.paid, dueDate: f.dueDate, plan: f.plan, extraFields: f.extraFields }; });
      setStore((prev) => ({ ...prev, students, fees: feesMap }));
      return summary;
    },
    importFeesCsv: async (rows) => {
      const summary = await api.post("/import/fees", { rows });
      const fees = await api.get("/fees");
      const feesMap = {};
      fees.forEach((f) => { feesMap[f.studentId] = { totalFee: f.totalFee, paid: f.paid, dueDate: f.dueDate, plan: f.plan, extraFields: f.extraFields }; });
      setStore((prev) => ({ ...prev, fees: feesMap }));
      return summary;
    },
  }), [store.students]);

  const [justApplied, setJustApplied] = useState(null);

  if (loading) {
    return (
      <div className="erp-root">
        <GlobalStyles />
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: "var(--slate)" }}>
            <Scale size={26} style={{ marginBottom: 8 }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>Loading registry…</div>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="erp-root">
        <GlobalStyles />
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div className="card" style={{ maxWidth: 480, textAlign: "center" }}>
            <div className="card-body">
              <div style={{ marginBottom: 14, display: "flex", justifyContent: "center" }}><CollegeMark /></div>
              <h2 style={{ fontSize: 18, marginBottom: 8, color: "var(--danger)" }}>Can't Reach the Server</h2>
              <p style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.6 }}>{loadError}</p>
              <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 10 }}>
                Make sure the backend is running: open a terminal in the <code>/server</code> folder and run <code>npm start</code>.
              </p>
              <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => { setLoading(true); loadAll(); }}>Retry</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="erp-root">
      <GlobalStyles />
      {paymentReturnStatus && (
        <div style={{
          position: "sticky", top: 0, zIndex: 200, padding: "10px 20px",
          background: paymentReturnStatus === "success" ? "var(--success-bg)" : "var(--danger-bg)",
          color: paymentReturnStatus === "success" ? "var(--success)" : "var(--danger)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 13, fontWeight: 600,
        }}>
          {paymentReturnStatus === "success" ? <CheckCircle size={15} /> : <XCircle size={15} />}
          {paymentReturnStatus === "success" ? "Payment successful — your fee record has been updated." : "Payment failed or was cancelled. Please try again or pay by cash."}
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }} onClick={() => setPaymentReturnStatus(null)}>Dismiss</button>
        </div>
      )}
      {!user ? (
        view === "admission" ? (
          <div style={{ padding: "40px 20px" }}>
            <AdmissionForm
              courses={store.courses}
              existingEmails={emailsExcept(null)}
              paymentsConfig={store.paymentsConfig}
              resumeFeePaid={false}
              onSaveStep={actions.saveDraftStep}
              onSaveAcademic={actions.saveAcademicDetails}
              onUploadDocument={actions.uploadDocument}
              onDeleteDocument={actions.deleteDocument}
              onPayNow={actions.payFeeOnline}
              onFinalSubmit={async (snap, finalId) => {
                const rec = await actions.finalizeApplication(snap, finalId);
                setJustApplied(rec);
                setView("applied");
              }}
              onExit={() => setView("login")}
            />
          </div>
        ) : view === "applied" ? (
          <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div className="card" style={{ maxWidth: 520, textAlign: "center" }}>
              <div className="card-body">
                <div style={{ marginBottom: 14, display: "flex", justifyContent: "center" }}><CollegeMark /></div>
                <Seal status="pending" />
                <h2 style={{ fontSize: 19, margin: "16px 0 8px" }}>Thank You! Application Submitted</h2>
                <p style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.6 }}>
                  Thank you, {justApplied?.name}. Your application has been submitted successfully and is now under review
                  by our admissions office. A registration confirmation has been sent to <b>{justApplied?.email}</b>.
                </p>
                <div className="card" style={{ textAlign: "left", marginTop: 16, background: "#FBF9F4" }}>
                  <div className="card-body" style={{ fontSize: 12.5 }}>
                    <div className="eyebrow" style={{ marginBottom: 8 }}>Simulated Email Preview</div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Registration Successful — {COLLEGE_NAME}</div>
                    <div style={{ whiteSpace: "pre-line", lineHeight: 1.6, color: "var(--charcoal)" }}>
                      {justApplied ? composeRegistrationEmail(justApplied).body : ""}
                    </div>
                  </div>
                </div>
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setView("login")}>Go to Sign In</button>
              </div>
            </div>
          </div>
        ) : (
          <LoginScreen onLogin={login} onGoToAdmission={() => setView("admission")} prefillEmail={justApplied?.email} />
        )
      ) : (user.role === "admin" || user.role === "super_admin") ? (
        <AdminPortal user={user} store={store} actions={actions} onLogout={logout} />
      ) : user.role === "hr" ? (
        <HRPortal user={user} store={store} actions={actions} onLogout={logout} />
      ) : user.role === "accounts" ? (
        <AccountsPortal user={user} store={store} actions={actions} onLogout={logout} />
      ) : user.role === "exam_incharge" ? (
        <ExamInchargePortal user={user} store={store} actions={actions} onLogout={logout} />
      ) : user.role === "hod" ? (
        <HODPortal user={user} store={store} actions={actions} onLogout={logout} />
      ) : user.role === "faculty" ? (
        <TeacherPortal user={user} store={store} actions={actions} onLogout={logout} />
      ) : (
        <StudentPortal user={user} store={store} actions={actions} onLogout={logout} />
      )}
    </div>
  );
}
