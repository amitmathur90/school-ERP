// csvImport.js — the "dynamic CSV import" brain.
//
// The frontend parses the uploaded CSV into an array of plain objects
// (one per row, keyed by whatever the CSV's header row said) and posts that
// array here. This module then, for each row:
//   1. Normalizes every header (case/spacing/punctuation-insensitive) and
//      checks it against a table of known field names + common aliases.
//   2. Anything that matches becomes a real column value.
//   3. Anything that DOESN'T match is preserved as-is in an `extra_fields`
//      JSON blob, rather than being dropped — so no data is ever lost, and
//      the "unknown" columns still show up in the UI (see ApplicationSummary
//      / the fee ledger's "Extra Info" button on the frontend).

function normalizeHeader(h) {
  return String(h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Build a normalized-header -> camelCase-field lookup from a field list plus
// a few human-friendly aliases people commonly use in spreadsheets.
function buildAliasMap(fieldNames, aliases) {
  const map = {};
  for (const name of fieldNames) map[normalizeHeader(name)] = name;
  for (const [alias, target] of Object.entries(aliases)) map[normalizeHeader(alias)] = target;
  return map;
}

const STUDENT_FIELD_NAMES = [
  "firstName", "firstNameHi", "middleName", "middleNameHi", "lastName", "lastNameHi", "name",
  "gender", "email", "phone",
  "emergencyMobile", "whatsapp", "aadhar", "howKnow", "dob", "maritalStatus",
  "spouseName", "spousePhone", "caste", "category",
  "permanentAddress", "contactNo", "mobileNo", "country", "state", "city", "pinCode", "stateDomicile",
  "addressType", "currentAddress", "currentCity", "currentState", "currentPinCode",
  "fatherFirstMiddle", "fatherFirstMiddleHi", "fatherLastName", "fatherLastNameHi",
  "fatherPhone", "fatherEmail", "fatherOccupation", "fatherOrg", "fatherPost",
  "motherFirstMiddle", "motherFirstMiddleHi", "motherLastName", "motherLastNameHi",
  "motherPhone", "motherEmail", "motherOccupation", "motherOrg", "motherPost",
  "guardianName", "guardianRelation", "guardianPhoneResi", "guardianMobile",
  "lastInstitution", "lastExamYear", "lastExamPercentage", "resultStatus", "gapInStudy", "lateralEntry",
  "courseGroup", "courseId", "amount", "medium", "remarks", "status", "rollNo", "password",
];

const STUDENT_ALIASES = {
  "first name": "firstName", "given name": "firstName",
  "first name (hindi)": "firstNameHi", "first name hindi": "firstNameHi",
  "middle name": "middleName",
  "middle name (hindi)": "middleNameHi",
  "last name": "lastName", "surname": "lastName", "family name": "lastName",
  "last name (hindi)": "lastNameHi",
  "full name": "name", "student name": "name",
  "email address": "email", "e-mail": "email", "mail": "email",
  "phone number": "phone", "mobile": "phone", "mobile number": "phone", "contact number": "phone",
  "emergency contact": "emergencyMobile", "emergency number": "emergencyMobile",
  "whatsapp number": "whatsapp",
  "aadhaar": "aadhar", "aadhaar number": "aadhar", "aadhar number": "aadhar", "aadhar no": "aadhar",
  "date of birth": "dob", "birth date": "dob",
  "category (caste)": "caste", "caste category": "caste",
  "address": "permanentAddress", "permanent address": "permanentAddress", "home address": "permanentAddress",
  "pin code": "pinCode", "pincode": "pinCode", "zip": "pinCode", "zip code": "pinCode",
  "state of domicile": "stateDomicile", "domicile": "stateDomicile", "domicile state": "stateDomicile",
  "correspondence address type": "addressType",
  "father's name": "fatherFirstMiddle", "father name": "fatherFirstMiddle", "fathers name": "fatherFirstMiddle",
  "father's name (hindi)": "fatherFirstMiddleHi",
  "father's last name": "fatherLastName",
  "father's phone": "fatherPhone", "father's phone no": "fatherPhone", "father phone": "fatherPhone",
  "father's email": "fatherEmail",
  "father's occupation": "fatherOccupation",
  "father's organization": "fatherOrg", "father's organisation": "fatherOrg",
  "father's post": "fatherPost",
  "mother's name": "motherFirstMiddle", "mother name": "motherFirstMiddle", "mothers name": "motherFirstMiddle",
  "mother's name (hindi)": "motherFirstMiddleHi",
  "mother's last name": "motherLastName",
  "mother's phone": "motherPhone", "mother's phone no": "motherPhone", "mother phone": "motherPhone",
  "mother's email": "motherEmail",
  "mother's occupation": "motherOccupation",
  "mother's organization": "motherOrg", "mother's organisation": "motherOrg",
  "mother's post": "motherPost",
  "guardian phone (resi.)": "guardianPhoneResi", "guardian phone resi": "guardianPhoneResi", "guardian residence phone": "guardianPhoneResi",
  "guardian mobile no": "guardianMobile", "relationship with student": "guardianRelation",
  "course": "courseName", "course name": "courseName", "programme": "courseName", "program": "courseName",
  "roll no": "rollNo", "roll number": "rollNo", "roll": "rollNo",
  "percentage": "lastExamPercentage", "last percentage": "lastExamPercentage", "last exam percentage": "lastExamPercentage",
  "passing year": "lastExamYear", "year of passing": "lastExamYear", "last exam passed out year": "lastExamYear",
  "last institution attended": "lastInstitution",
  "result of qualifying exam": "resultStatus",
  "gap between study": "gapInStudy", "gap in study": "gapInStudy",
  "lateral entry": "lateralEntry",
  "course group": "courseGroup",
  "notes": "remarks",
};

const STUDENT_ALIAS_MAP = buildAliasMap(STUDENT_FIELD_NAMES, STUDENT_ALIASES);

const FEE_FIELD_NAMES = ["email", "rollNo", "totalFee", "paid", "dueDate"];
const FEE_ALIASES = {
  "roll no": "rollNo", "roll number": "rollNo", "roll": "rollNo",
  "email address": "email",
  "total fee": "totalFee", "fee": "totalFee", "total amount": "totalFee",
  "paid amount": "paid", "amount paid": "paid",
  "due date": "dueDate", "due": "dueDate",
};
const FEE_ALIAS_MAP = buildAliasMap(FEE_FIELD_NAMES, FEE_ALIASES);

/**
 * Splits one CSV row (a plain object keyed by raw header text) into:
 *  - mapped: recognized fields, in camelCase, ready to write to real columns
 *  - extra:  everything else, keyed by the ORIGINAL header text from the CSV
 */
function mapRow(row, aliasMap) {
  const mapped = {};
  const extra = {};
  for (const [rawHeader, value] of Object.entries(row)) {
    if (value === "" || value === undefined || value === null) continue;
    const norm = normalizeHeader(rawHeader);
    const known = aliasMap[norm];
    if (known) {
      mapped[known] = typeof value === "string" ? value.trim() : value;
    } else {
      extra[rawHeader.trim()] = value;
    }
  }
  return { mapped, extra };
}

module.exports = { normalizeHeader, mapRow, STUDENT_ALIAS_MAP, FEE_ALIAS_MAP };
