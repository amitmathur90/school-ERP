import 'fee_plan.dart';

/// Mirrors a row from `fees` as returned by GET /api/fees
/// (server/routes/fees.js rowToFee) — a flat array the client groups by
/// studentId (one fee record per student).
class Fee {
  Fee({
    required this.studentId,
    required this.totalFee,
    required this.paid,
    required this.admissionFeePaid,
    this.dueDate,
    this.plan,
    this.extraFields,
  });

  factory Fee.fromJson(Map<String, dynamic> json) {
    num asNum(Object? v) => num.tryParse(v?.toString() ?? '') ?? 0;
    return Fee(
      studentId: json['studentId'].toString(),
      totalFee: asNum(json['totalFee']),
      paid: asNum(json['paid']),
      admissionFeePaid: asNum(json['admissionFeePaid']),
      dueDate: json['dueDate'] as String?,
      plan: json['plan'] != null ? FeePlan.fromJson(json['plan'] as Map<String, dynamic>) : null,
      extraFields: json['extraFields'] as Map<String, dynamic>?,
    );
  }

  final String studentId;
  final num totalFee;
  final num paid;
  final num admissionFeePaid;
  final String? dueDate;
  final FeePlan? plan;
  final Map<String, dynamic>? extraFields;

  num get balance => totalFee - paid;

  /// Mirrors FeesManager's statusLabel/statusKey (law-college-erp.jsx:3290-91).
  String get statusLabel => paid >= totalFee ? 'Paid in Full' : paid > 0 ? 'Partially Paid' : 'Due';
  String get statusKey => paid >= totalFee ? 'Paid' : paid > 0 ? 'Partial' : 'Due';
}
