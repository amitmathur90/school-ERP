// fieldMap.js — generic helpers to convert between the DB's snake_case
// columns and the camelCase JSON shape the React frontend already expects.
// This means the frontend's rendering code doesn't need to change at all —
// only how it fetches/saves data.

function rowToCamel(row, fields) {
  if (!row) return null;
  const out = {};
  for (const [camel, snake] of fields) {
    out[camel] = row[snake] === undefined ? null : row[snake];
  }
  return out;
}

// PostgreSQL is strict about types: an empty string ("") is not valid input
// for a NUMERIC/INTEGER column. The frontend sends its whole form state on
// every save (fields from later steps the user hasn't reached yet are still
// ""), so without this, saving an early step of the admission form would
// fail as soon as it hit a numeric column like `amount`. NULL is the
// correct "no value yet" representation here regardless of column type, so
// this conversion is safe to apply universally.
function sanitizeValue(v) {
  return v === "" ? null : v;
}

function camelToSnakeParams(obj, fields) {
  const columns = [];
  const placeholders = [];
  const values = [];
  for (const [camel, snake] of fields) {
    if (obj[camel] !== undefined) {
      columns.push(snake);
      placeholders.push("?");
      values.push(sanitizeValue(obj[camel]));
    }
  }
  return { columns, placeholders, values };
}

function camelToSnakeSet(obj, fields) {
  const sets = [];
  const values = [];
  for (const [camel, snake] of fields) {
    if (obj[camel] !== undefined) {
      sets.push(`${snake} = ?`);
      values.push(sanitizeValue(obj[camel]));
    }
  }
  return { sets, values };
}

const STUDENT_FIELDS = [
  ["id", "id"],
  ["firstName", "first_name"], ["firstNameHi", "first_name_hi"],
  ["middleName", "middle_name"], ["middleNameHi", "middle_name_hi"],
  ["lastName", "last_name"], ["lastNameHi", "last_name_hi"],
  ["name", "name"], ["gender", "gender"],
  ["email", "email"], ["phone", "phone"],
  ["emergencyMobile", "emergency_mobile"], ["whatsapp", "whatsapp"],
  ["aadhar", "aadhar"], ["howKnow", "how_know"],
  ["dob", "dob"], ["maritalStatus", "marital_status"],
  ["spouseName", "spouse_name"], ["spousePhone", "spouse_phone"],
  ["caste", "caste"], ["category", "category"],
  ["photoData", "photo_data"], ["photoName", "photo_name"],
  ["signatureData", "signature_data"], ["signatureName", "signature_name"],
  ["permanentAddress", "permanent_address"], ["contactNo", "contact_no"],
  ["mobileNo", "mobile_no"], ["country", "country"],
  ["state", "state"], ["city", "city"],
  ["pinCode", "pin_code"], ["stateDomicile", "state_domicile"],
  ["addressType", "address_type"], ["currentAddress", "current_address"],
  ["currentCity", "current_city"], ["currentState", "current_state"],
  ["currentPinCode", "current_pin_code"],
  ["fatherFirstMiddle", "father_first_middle"], ["fatherFirstMiddleHi", "father_first_middle_hi"],
  ["fatherLastName", "father_last_name"], ["fatherLastNameHi", "father_last_name_hi"],
  ["fatherPhone", "father_phone"], ["fatherEmail", "father_email"],
  ["fatherOccupation", "father_occupation"], ["fatherOrg", "father_org"], ["fatherPost", "father_post"],
  ["motherFirstMiddle", "mother_first_middle"], ["motherFirstMiddleHi", "mother_first_middle_hi"],
  ["motherLastName", "mother_last_name"], ["motherLastNameHi", "mother_last_name_hi"],
  ["motherPhone", "mother_phone"], ["motherEmail", "mother_email"],
  ["motherOccupation", "mother_occupation"], ["motherOrg", "mother_org"], ["motherPost", "mother_post"],
  ["guardianName", "guardian_name"], ["guardianRelation", "guardian_relation"],
  ["guardianPhoneResi", "guardian_phone_resi"], ["guardianMobile", "guardian_mobile"],
  ["lastInstitution", "last_institution"], ["lastExamYear", "last_exam_year"],
  ["lastExamPercentage", "last_exam_percentage"], ["resultStatus", "result_status"],
  ["gapInStudy", "gap_in_study"], ["lateralEntry", "lateral_entry"],
  ["courseGroup", "course_group"], ["courseId", "course_id"],
  ["amount", "amount"], ["medium", "medium"], ["remarks", "remarks"],
  ["status", "status"], ["rollNo", "roll_no"], ["rejectReason", "reject_reason"],
  ["savedUpTo", "saved_up_to"], ["createdAt", "created_at"], ["appliedAt", "applied_at"],
];

const COURSE_FIELDS = [
  ["id", "id"], ["name", "name"], ["code", "code"], ["duration", "duration"],
  ["seats", "seats"], ["fee", "fee"], ["admissionFee", "admission_fee"], ["group", "course_group"],
];

const TEACHER_FIELDS = [
  ["id", "id"], ["employeeId", "employee_id"], ["name", "name"], ["email", "email"],
  ["subject", "subject"], ["department", "department"], ["phone", "phone"],
  ["gender", "gender"], ["dob", "dob"], ["qualification", "qualification"],
  ["experience", "experience"], ["address", "address"], ["joiningDate", "joining_date"],
  ["designation", "designation"], ["role", "role"], ["status", "status"],
  ["photoData", "photo_data"], ["photoName", "photo_name"],
];

const NOTICE_FIELDS = [
  ["id", "id"], ["title", "title"], ["content", "content"], ["date", "date"],
  ["postedByName", "posted_by_name"], ["postedByRole", "posted_by_role"],
];

const GRADE_FIELDS = [
  ["id", "id"], ["studentId", "student_id"], ["subject", "subject"],
  ["examType", "exam_type"], ["semester", "semester"], ["marks", "marks"], ["maxMarks", "max_marks"],
];

const TRANSACTION_FIELDS = [
  ["id", "id"], ["studentId", "student_id"], ["feeAmount", "fee_amount"],
  ["additionalFees", "additional_fees"], ["totalAmount", "total_amount"],
  ["paymentType", "payment_type"], ["paymentMode", "payment_mode"],
  ["planTotalAmount", "plan_total_amount"], ["tenureMonths", "tenure_months"],
  ["installmentAmount", "installment_amount"], ["date", "date"],
  ["recordedByName", "recorded_by_name"], ["recordedByRole", "recorded_by_role"],
  ["gateway", "gateway"], ["gatewayPaymentId", "gateway_payment_id"], ["gatewayOrderId", "gateway_order_id"],
];

const MESSAGE_FIELDS = [
  ["id", "id"], ["toStudentId", "to_student_id"], ["fromName", "from_name"],
  ["fromRole", "from_role"], ["text", "text"], ["date", "date"], ["isRead", "is_read"],
];

const SUPPORT_TICKET_FIELDS = [
  ["id", "id"], ["studentId", "student_id"], ["subject", "subject"],
  ["status", "status"], ["studentUnread", "student_unread"], ["adminUnread", "admin_unread"],
  ["createdAt", "created_at"], ["updatedAt", "updated_at"],
];

const SUPPORT_REPLY_FIELDS = [
  ["id", "id"], ["ticketId", "ticket_id"], ["fromRole", "from_role"],
  ["fromName", "from_name"], ["text", "text"], ["date", "date"],
  ["attachmentName", "attachment_name"], ["attachmentSize", "attachment_size"], ["attachmentMime", "attachment_mime"],
];

const EMAIL_FIELDS = [
  ["id", "id"], ["to", "to_email"], ["subject", "subject"], ["body", "body"], ["date", "date"],
];

const ACADEMIC_FIELDS = [
  ["id", "id"], ["studentId", "student_id"], ["sno", "sno"], ["name", "name"],
  ["board", "board"], ["passingYear", "passing_year"], ["grade", "grade"], ["subject", "subject"],
];

const DOCUMENT_FIELDS = [
  ["id", "id"], ["studentId", "student_id"], ["sno", "sno"], ["documentType", "document_type"],
  ["originalPhotocopy", "original_photocopy"], ["documentNo", "document_no"],
  ["fileName", "file_name"], ["filePath", "file_path"], ["fileSize", "file_size"],
  ["mimeType", "mime_type"], ["uploadedAt", "uploaded_at"],
];

module.exports = {
  rowToCamel, camelToSnakeParams, camelToSnakeSet,
  STUDENT_FIELDS, COURSE_FIELDS, TEACHER_FIELDS, NOTICE_FIELDS,
  GRADE_FIELDS, TRANSACTION_FIELDS, MESSAGE_FIELDS, EMAIL_FIELDS,
  ACADEMIC_FIELDS, DOCUMENT_FIELDS, SUPPORT_TICKET_FIELDS, SUPPORT_REPLY_FIELDS,
};
