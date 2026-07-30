import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../shared/models/transaction.dart';

/// Mirrors GET /api/payments/config (server/routes/payments.js) — which ONE
/// gateway (if any) is active, and whether it's actually usable right now.
class PaymentsConfig {
  PaymentsConfig({required this.provider, required this.razorpayConfigured, required this.razorpayKeyId, required this.payuConfigured, required this.available});

  factory PaymentsConfig.fromJson(Map<String, dynamic> json) {
    final razorpay = json['razorpay'] as Map<String, dynamic>? ?? const {};
    final payu = json['payu'] as Map<String, dynamic>? ?? const {};
    return PaymentsConfig(
      provider: json['provider'] as String? ?? 'none',
      razorpayConfigured: razorpay['configured'] as bool? ?? false,
      razorpayKeyId: razorpay['keyId'] as String?,
      payuConfigured: payu['configured'] as bool? ?? false,
      available: json['available'] as bool? ?? false,
    );
  }

  final String provider;
  final bool razorpayConfigured;
  final String? razorpayKeyId;
  final bool payuConfigured;
  final bool available;

  bool get isRazorpay => provider == 'razorpay';
}

/// A Razorpay order ready to hand to the checkout popup
/// (server/routes/payments.js POST /razorpay/create-order response).
class RazorpayOrder {
  RazorpayOrder({required this.orderId, required this.amountPaise, required this.currency, required this.keyId, required this.studentName, this.studentEmail, this.studentPhone});

  factory RazorpayOrder.fromJson(Map<String, dynamic> json) {
    return RazorpayOrder(
      orderId: json['orderId'] as String,
      amountPaise: json['amount'] as int,
      currency: json['currency'] as String? ?? 'INR',
      keyId: json['keyId'] as String,
      studentName: json['studentName'] as String? ?? '',
      studentEmail: json['studentEmail'] as String?,
      studentPhone: json['studentPhone'] as String?,
    );
  }

  final String orderId;
  final int amountPaise;
  final String currency;
  final String keyId;
  final String studentName;
  final String? studentEmail;
  final String? studentPhone;
}

class PaymentsRepository {
  PaymentsRepository(this._ref);
  final Ref _ref;

  Future<PaymentsConfig> fetchConfig() async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/payments/config');
    return PaymentsConfig.fromJson(response.data as Map<String, dynamic>);
  }

  /// Mirrors PayOnlineModal.pay's payFeeOnline call (law-college-erp.jsx:1044).
  Future<RazorpayOrder> createRazorpayOrder({
    required String studentId,
    required num feeAmount,
    required num totalAmount,
    required String paymentMode,
    num? planTotalAmount,
    int? tenureMonths,
    String purpose = 'course',
  }) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/payments/razorpay/create-order', data: {
      'studentId': studentId,
      'feeAmount': feeAmount,
      'additionalFees': const [],
      'totalAmount': totalAmount,
      'paymentMode': paymentMode,
      if (planTotalAmount != null) 'planTotalAmount': planTotalAmount,
      if (tenureMonths != null) 'tenureMonths': tenureMonths,
      'purpose': purpose,
    });
    return RazorpayOrder.fromJson(response.data as Map<String, dynamic>);
  }

  Future<PaymentTransaction> verifyRazorpayPayment({
    required String orderId,
    required String paymentId,
    required String signature,
  }) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/payments/razorpay/verify', data: {
      'razorpay_order_id': orderId,
      'razorpay_payment_id': paymentId,
      'razorpay_signature': signature,
    });
    return PaymentTransaction.fromJson(response.data as Map<String, dynamic>);
  }
}

final paymentsRepositoryProvider = Provider((ref) => PaymentsRepository(ref));

final paymentsConfigProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(paymentsRepositoryProvider).fetchConfig();
});
