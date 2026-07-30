/// Mirrors server/fieldMap.js COURSE_FIELDS, as returned by GET /api/courses.
class Course {
  Course({
    required this.id,
    required this.name,
    this.code,
    this.duration,
    this.seats,
    this.fee,
    this.admissionFee,
    this.group,
  });

  factory Course.fromJson(Map<String, dynamic> json) {
    return Course(
      id: json['id'].toString(),
      name: json['name'] as String? ?? '',
      code: json['code'] as String?,
      duration: json['duration']?.toString(),
      seats: json['seats']?.toString(),
      fee: json['fee']?.toString(),
      admissionFee: json['admissionFee']?.toString(),
      group: json['group'] as String?,
    );
  }

  final String id;
  final String name;
  final String? code;
  final String? duration;
  final String? seats;
  final String? fee;
  final String? admissionFee;
  final String? group;
}
