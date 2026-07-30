/// Mirrors a row from `grades` as returned by GET /api/grades
/// (server/routes/grades.js, fieldMap.js GRADE_FIELDS).
class Grade {
  Grade({
    required this.id,
    required this.studentId,
    required this.subject,
    required this.examType,
    required this.semester,
    required this.marks,
    required this.maxMarks,
  });

  factory Grade.fromJson(Map<String, dynamic> json) {
    num asNum(Object? v) => num.tryParse(v?.toString() ?? '') ?? 0;
    return Grade(
      id: json['id'].toString(),
      studentId: json['studentId'].toString(),
      subject: json['subject'] as String? ?? '',
      examType: json['examType'] as String? ?? '',
      semester: int.tryParse(json['semester']?.toString() ?? '') ?? 1,
      marks: asNum(json['marks']),
      maxMarks: asNum(json['maxMarks']),
    );
  }

  final String id;
  final String studentId;
  final String subject;
  final String examType;
  final int semester;
  final num marks;
  final num maxMarks;

  double? get percentage => maxMarks == 0 ? null : (marks / maxMarks) * 100;
}
