/// Nested EMI plan on a Fee record (server/routes/fees.js rowToFee -> plan).
class FeePlan {
  FeePlan({
    required this.totalAmount,
    required this.tenureMonths,
    required this.installmentAmount,
    required this.emisPaid,
  });

  factory FeePlan.fromJson(Map<String, dynamic> json) {
    num asNum(Object? v) => num.tryParse(v?.toString() ?? '') ?? 0;
    return FeePlan(
      totalAmount: asNum(json['totalAmount']),
      tenureMonths: int.tryParse(json['tenureMonths']?.toString() ?? '') ?? 0,
      installmentAmount: asNum(json['installmentAmount']),
      emisPaid: int.tryParse(json['emisPaid']?.toString() ?? '') ?? 0,
    );
  }

  final num totalAmount;
  final int tenureMonths;
  final num installmentAmount;
  final int emisPaid;

  int get emisRemaining => (tenureMonths - emisPaid).clamp(0, tenureMonths);
  num get remainingAmount => (totalAmount - installmentAmount * emisPaid).clamp(0, totalAmount);
}
