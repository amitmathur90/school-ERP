/// Mirrors a row from `students` as returned by GET /api/students
/// (server/routes/students.js, server/fieldMap.js STUDENT_FIELDS). The web
/// app's Admissions Registry treats every student row as an "admission";
/// status distinguishes a submitted application from an enrolled student.
enum AdmissionStatus { draft, pending, approved, rejected }

AdmissionStatus _statusFromWire(String? value) {
  switch (value) {
    case 'approved':
      return AdmissionStatus.approved;
    case 'rejected':
      return AdmissionStatus.rejected;
    case 'draft':
      return AdmissionStatus.draft;
    case 'pending':
    default:
      return AdmissionStatus.pending;
  }
}

class Admission {
  Admission({
    required this.id,
    required this.name,
    required this.status,
    this.firstName,
    this.middleName,
    this.lastName,
    this.email,
    this.phone,
    this.emergencyMobile,
    this.whatsapp,
    this.aadhar,
    this.howKnow,
    this.mobileNo,
    this.courseId,
    this.courseGroup,
    this.caste,
    this.category,
    this.gender,
    this.dob,
    this.maritalStatus,
    this.spouseName,
    this.spousePhone,
    this.photoData,
    this.signatureData,
    this.lastInstitution,
    this.lastExamYear,
    this.lastExamPercentage,
    this.resultStatus,
    this.gapInStudy,
    this.lateralEntry,
    this.permanentAddress,
    this.currentAddress,
    this.addressType,
    this.city,
    this.state,
    this.pinCode,
    this.stateDomicile,
    this.country,
    this.fatherFirstMiddle,
    this.fatherLastName,
    this.fatherPhone,
    this.fatherEmail,
    this.fatherOccupation,
    this.fatherOrg,
    this.fatherPost,
    this.motherFirstMiddle,
    this.motherLastName,
    this.motherPhone,
    this.motherEmail,
    this.motherOccupation,
    this.motherOrg,
    this.motherPost,
    this.guardianName,
    this.guardianRelation,
    this.guardianPhoneResi,
    this.guardianMobile,
    this.rollNo,
    this.rejectReason,
    this.medium,
    this.remarks,
    this.amount,
    this.appliedAt,
    this.createdAt,
    this.extraFields,
  });

  factory Admission.fromJson(Map<String, dynamic> json) {
    String? str(String key) => json[key] as String?;
    DateTime? date(String key) {
      final raw = json[key] as String?;
      if (raw == null || raw.isEmpty) return null;
      return DateTime.tryParse(raw);
    }

    return Admission(
      id: json['id'].toString(),
      name: str('name') ?? '',
      status: _statusFromWire(str('status')),
      firstName: str('firstName'),
      middleName: str('middleName'),
      lastName: str('lastName'),
      email: str('email'),
      phone: str('phone'),
      emergencyMobile: str('emergencyMobile'),
      whatsapp: str('whatsapp'),
      aadhar: str('aadhar'),
      howKnow: str('howKnow'),
      mobileNo: str('mobileNo'),
      courseId: str('courseId'),
      courseGroup: str('courseGroup'),
      caste: str('caste'),
      category: str('category'),
      gender: str('gender'),
      dob: str('dob'),
      maritalStatus: str('maritalStatus'),
      spouseName: str('spouseName'),
      spousePhone: str('spousePhone'),
      photoData: str('photoData'),
      signatureData: str('signatureData'),
      lastInstitution: str('lastInstitution'),
      lastExamYear: str('lastExamYear'),
      lastExamPercentage: str('lastExamPercentage'),
      resultStatus: str('resultStatus'),
      gapInStudy: str('gapInStudy'),
      lateralEntry: str('lateralEntry'),
      permanentAddress: str('permanentAddress'),
      currentAddress: str('currentAddress'),
      addressType: str('addressType'),
      city: str('city'),
      state: str('state'),
      pinCode: str('pinCode'),
      stateDomicile: str('stateDomicile'),
      country: str('country'),
      fatherFirstMiddle: str('fatherFirstMiddle'),
      fatherLastName: str('fatherLastName'),
      fatherPhone: str('fatherPhone'),
      fatherEmail: str('fatherEmail'),
      fatherOccupation: str('fatherOccupation'),
      fatherOrg: str('fatherOrg'),
      fatherPost: str('fatherPost'),
      motherFirstMiddle: str('motherFirstMiddle'),
      motherLastName: str('motherLastName'),
      motherPhone: str('motherPhone'),
      motherEmail: str('motherEmail'),
      motherOccupation: str('motherOccupation'),
      motherOrg: str('motherOrg'),
      motherPost: str('motherPost'),
      guardianName: str('guardianName'),
      guardianRelation: str('guardianRelation'),
      guardianPhoneResi: str('guardianPhoneResi'),
      guardianMobile: str('guardianMobile'),
      rollNo: str('rollNo'),
      rejectReason: str('rejectReason'),
      medium: str('medium'),
      remarks: str('remarks'),
      amount: json['amount']?.toString(),
      appliedAt: date('appliedAt'),
      createdAt: date('createdAt'),
      extraFields: json['extraFields'] as Map<String, dynamic>?,
    );
  }

  final String id;
  final String name;
  final AdmissionStatus status;
  final String? firstName;
  final String? middleName;
  final String? lastName;
  final String? email;
  final String? phone;
  final String? emergencyMobile;
  final String? whatsapp;
  final String? aadhar;
  final String? howKnow;
  final String? mobileNo;
  final String? courseId;
  final String? courseGroup;
  final String? caste;
  final String? category;
  final String? gender;
  final String? dob;
  final String? maritalStatus;
  final String? spouseName;
  final String? spousePhone;
  final String? photoData;
  final String? signatureData;
  final String? lastInstitution;
  final String? lastExamYear;
  final String? lastExamPercentage;
  final String? resultStatus;
  final String? gapInStudy;
  final String? lateralEntry;
  final String? permanentAddress;
  final String? currentAddress;
  final String? addressType;
  final String? city;
  final String? state;
  final String? pinCode;
  final String? stateDomicile;
  final String? country;
  final String? fatherFirstMiddle;
  final String? fatherLastName;
  final String? fatherPhone;
  final String? fatherEmail;
  final String? fatherOccupation;
  final String? fatherOrg;
  final String? fatherPost;
  final String? motherFirstMiddle;
  final String? motherLastName;
  final String? motherPhone;
  final String? motherEmail;
  final String? motherOccupation;
  final String? motherOrg;
  final String? motherPost;
  final String? guardianName;
  final String? guardianRelation;
  final String? guardianPhoneResi;
  final String? guardianMobile;
  final String? rollNo;
  final String? rejectReason;
  final String? medium;
  final String? remarks;
  final String? amount;
  final DateTime? appliedAt;
  final DateTime? createdAt;
  final Map<String, dynamic>? extraFields;

  String get fatherName => [fatherFirstMiddle, fatherLastName].where((s) => s != null && s.isNotEmpty).join(' ');
  String get motherName => [motherFirstMiddle, motherLastName].where((s) => s != null && s.isNotEmpty).join(' ');
  String get contactPhone => phone ?? mobileNo ?? '';
  String get fatherOccupationLine {
    final parts = [fatherOccupation, fatherOrg].where((s) => s != null && s.isNotEmpty).toList();
    return parts.join(' · ');
  }

  String get motherOccupationLine {
    final parts = [motherOccupation, motherOrg].where((s) => s != null && s.isNotEmpty).toList();
    return parts.join(' · ');
  }

  String get correspondenceAddress =>
      addressType == 'different' ? (currentAddress ?? '') : 'Same as Permanent';
}
