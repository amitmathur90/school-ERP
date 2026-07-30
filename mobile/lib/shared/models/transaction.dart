/// Mirrors a row from `transactions` as returned by GET /api/transactions
/// (server/routes/transactions.js, fieldMap.js TRANSACTION_FIELDS).
class PaymentTransaction {
  PaymentTransaction({
    required this.id,
    required this.studentId,
    required this.totalAmount,
    required this.date,
    this.feeAmount,
    this.paymentType,
    this.paymentMode,
    this.recordedByName,
    this.recordedByRole,
    this.purpose,
  });

  factory PaymentTransaction.fromJson(Map<String, dynamic> json) {
    num asNum(Object? v) => num.tryParse(v?.toString() ?? '') ?? 0;
    return PaymentTransaction(
      id: json['id'].toString(),
      studentId: json['studentId'].toString(),
      totalAmount: asNum(json['totalAmount']),
      date: DateTime.tryParse(json['date'] as String? ?? '') ?? DateTime.now(),
      feeAmount: json['feeAmount'] != null ? asNum(json['feeAmount']) : null,
      paymentType: json['paymentType'] as String?,
      paymentMode: json['paymentMode'] as String?,
      recordedByName: json['recordedByName'] as String?,
      recordedByRole: json['recordedByRole'] as String?,
      purpose: json['purpose'] as String?,
    );
  }

  final String id;
  final String studentId;
  final num totalAmount;
  final DateTime date;
  final num? feeAmount;
  final String? paymentType;
  final String? paymentMode;
  final String? recordedByName;
  final String? recordedByRole;
  final String? purpose;

  String get purposeLabel => purpose == 'admission' ? 'Admission Fee' : 'Course Fee';
}
