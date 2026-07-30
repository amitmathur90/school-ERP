/// Mirrors a row from `teachers` as returned by GET /api/teachers
/// (server/routes/teachers.js, fieldMap.js TEACHER_FIELDS).
class Teacher {
  Teacher({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.status,
    this.employeeId,
    this.subject,
    this.department,
    this.phone,
    this.gender,
    this.dob,
    this.qualification,
    this.experience,
    this.address,
    this.joiningDate,
    this.designation,
    this.photoData,
  });

  factory Teacher.fromJson(Map<String, dynamic> json) {
    String? str(String key) => json[key] as String?;
    return Teacher(
      id: json['id'].toString(),
      name: str('name') ?? '',
      email: str('email') ?? '',
      role: str('role') ?? 'faculty',
      status: str('status') ?? 'active',
      employeeId: str('employeeId'),
      subject: str('subject'),
      department: str('department'),
      phone: str('phone'),
      gender: str('gender'),
      dob: str('dob'),
      qualification: str('qualification'),
      experience: str('experience'),
      address: str('address'),
      joiningDate: str('joiningDate'),
      designation: str('designation'),
      photoData: str('photoData'),
    );
  }

  final String id;
  final String name;
  final String email;
  final String role;
  final String status;
  final String? employeeId;
  final String? subject;
  final String? department;
  final String? phone;
  final String? gender;
  final String? dob;
  final String? qualification;
  final String? experience;
  final String? address;
  final String? joiningDate;
  final String? designation;
  final String? photoData;

  bool get isActive => status == 'active';
}

const staffRoles = [
  ('faculty', 'Faculty'),
  ('hod', 'HOD'),
  ('exam_incharge', 'Examination Incharge'),
  ('accounts', 'Accounts'),
  ('hr', 'HR'),
  ('librarian', 'Librarian'),
];

String staffRoleLabel(String value) => staffRoles.firstWhere((r) => r.$1 == value, orElse: () => (value, value)).$2;
