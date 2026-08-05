// authMiddleware.js — real request authentication (this app previously had
// none: every endpoint trusted whatever the client claimed). Issues and
// verifies JWTs, and enforces the role hierarchy / module permissions
// described in the app's staff hierarchy.

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";
if (!process.env.JWT_SECRET) {
  console.warn("WARNING: JWT_SECRET is not set in .env — using an insecure default. Set a real secret before deploying anywhere real.");
}

// Every module a staff-tier user could be granted access to. Kept aligned
// with the admin sidebar's nav `key`s so permission checks and UI visibility
// use the exact same vocabulary.
const MODULES = [
  "overview", "admissions", "students", "teachers", "courses",
  "fees", "reports", "notices", "attendance", "grades", "hr", "settings", "support", "library", "parents",
];

// Default module access per business role, used whenever that user doesn't
// have an explicit `permissions` override set. Super Admin is always
// unrestricted and isn't in this map — it's handled specially below.
const DEFAULT_MODULES = {
  admin: MODULES,                                                   // full access unless Super Admin restricts it
  hr: ["overview", "hr", "teachers"],
  accounts: ["overview", "fees", "reports"],
  exam_incharge: ["overview", "grades", "reports"],
  hod: ["overview", "teachers", "students", "attendance", "grades"], // also department-scoped, enforced separately
  faculty: ["overview", "students", "attendance", "grades", "notices", "library"],
  librarian: ["overview", "library"],
};

function effectivePermissions(user) {
  if (user.role === "super_admin") return MODULES;
  if (user.permissions && Array.isArray(user.permissions) && user.permissions.length > 0) return user.permissions;
  return DEFAULT_MODULES[user.role] || [];
}

function signToken(user) {
  // Keep the token payload minimal — id, role, department (for HOD scoping),
  // and permissions (so the frontend can build the right nav without an
  // extra round-trip). Never put the password hash or anything sensitive here.
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      role: user.role,
      department: user.department || null,
      permissions: effectivePermissions(user),
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

/** Verifies the Authorization: Bearer <token> header and attaches req.user.
 *  Also accepts ?token=... as a fallback — needed for plain <a href> file
 *  download links (e.g. viewing an uploaded document), which browsers
 *  navigate to directly and can't attach a custom header to. */
function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = (header.startsWith("Bearer ") ? header.slice(7) : null) || req.query.token || null;
  if (!token) return res.status(401).json({ error: "Not signed in." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

/** Restricts a route to specific business roles, e.g. authorizeRoles("super_admin", "admin"). */
function authorizeRoles(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not signed in." });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "You don't have permission to do this." });
    }
    next();
  };
}

/** Restricts a route to users whose permissions include the given module key. */
function requireModule(moduleKey) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not signed in." });
    if (req.user.role === "super_admin") return next(); // always unrestricted
    if ((req.user.permissions || []).includes(moduleKey)) return next();
    return res.status(403).json({ error: `You don't have access to ${moduleKey}.` });
  };
}

module.exports = { MODULES, DEFAULT_MODULES, effectivePermissions, signToken, authenticate, authorizeRoles, requireModule, JWT_SECRET };
