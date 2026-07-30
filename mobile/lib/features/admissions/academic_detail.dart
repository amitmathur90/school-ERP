/// Mirrors a row from `academic_details` as returned by GET
/// /api/academic-details (server/routes/academicDetails.js, fieldMap.js
/// ACADEMIC_FIELDS) — a flat list the client groups by studentId.
class AcademicDetail {
  AcademicDetail({
    required this.id,
    required this.studentId,
    required this.sno,
    required this.name,
    required this.board,
    required this.passingYear,
    required this.grade,
    required this.subject,
  });

  factory AcademicDetail.fromJson(Map<String, dynamic> json) {
    return AcademicDetail(
      id: json['id'].toString(),
      studentId: json['studentId'].toString(),
      sno: int.tryParse(json['sno']?.toString() ?? '') ?? 0,
      name: json['name'] as String? ?? '',
      board: json['board'] as String? ?? '',
      passingYear: json['passingYear'] as String? ?? '',
      grade: json['grade'] as String? ?? '',
      subject: json['subject'] as String? ?? '',
    );
  }

  final String id;
  final String studentId;
  final int sno;
  final String name;
  final String board;
  final String passingYear;
  final String grade;
  final String subject;
}
