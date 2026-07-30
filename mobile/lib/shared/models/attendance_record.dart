/// Mirrors an entry from GET /api/attendance (server/routes/attendance.js)
/// — a flat array of `{ studentId, date, subject, status }`.
class AttendanceRecord {
  AttendanceRecord({
    required this.studentId,
    required this.date,
    required this.subject,
    required this.status,
  });

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    return AttendanceRecord(
      studentId: json['studentId'].toString(),
      date: json['date'] as String? ?? '',
      subject: json['subject'] as String? ?? '',
      status: json['status'] as String? ?? '',
    );
  }

  final String studentId;
  final String date;
  final String subject;
  final String status;

  bool get isPresent => status == 'Present';
}
