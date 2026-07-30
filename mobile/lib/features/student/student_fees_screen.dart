import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../core/api_client.dart';
import '../../core/fees_repository.dart';
import '../../core/theme.dart';
import '../../core/transactions_repository.dart';
import '../../shared/models/fee.dart';
import '../fees/pay_online_dialog.dart';
import '../fees/payment_history_screen.dart';
import '../fees/payments_repository.dart';

final _inr = NumberFormat.decimalPattern('en_IN');

/// Mirrors the student "Fees & Payments" page (law-college-erp.jsx
/// :4869-4959) — this student's own fee summary, EMI plan (if any), a
/// Razorpay "Pay Now" when online payment is turned on, and payment history.
class StudentFeesScreen extends ConsumerStatefulWidget {
  const StudentFeesScreen({super.key, required this.studentId, required this.studentName});
  final String studentId;
  final String studentName;

  @override
  ConsumerState<StudentFeesScreen> createState() => _StudentFeesScreenState();
}

class _StudentFeesScreenState extends ConsumerState<StudentFeesScreen> {
  late final Razorpay _razorpay;
  bool _paying = false;

  @override
  void initState() {
    super.initState();
    _razorpay = Razorpay();
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onPaymentSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _onPaymentError);
    _razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, _onExternalWallet);
  }

  @override
  void dispose() {
    _razorpay.clear();
    super.dispose();
  }

  Future<void> _payOnline(Fee fee) async {
    final request = await showDialog<PayOnlineRequest>(
      context: context,
      builder: (_) => PayOnlineDialog(fee: fee),
    );
    if (request == null) return;

    setState(() => _paying = true);
    try {
      final order = await ref.read(paymentsRepositoryProvider).createRazorpayOrder(
            studentId: widget.studentId,
            feeAmount: request.amount,
            totalAmount: request.amount,
            paymentMode: request.mode,
            planTotalAmount: request.mode == 'EMI' && fee.plan == null ? fee.balance : null,
            tenureMonths: request.tenureMonths,
          );
      _openCheckout(order);
    } catch (e) {
      setState(() => _paying = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
      }
    }
  }

  void _openCheckout(RazorpayOrder order) {
    final options = {
      'key': order.keyId,
      'amount': order.amountPaise,
      'order_id': order.orderId,
      'currency': order.currency,
      'name': 'SPVM Law College',
      'description': 'Course Fee Payment',
      'prefill': {
        if (order.studentEmail != null) 'email': order.studentEmail,
        if (order.studentPhone != null) 'contact': order.studentPhone,
      },
    };
    try {
      _razorpay.open(options);
    } catch (e) {
      setState(() => _paying = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not open payment: $e'), backgroundColor: AppColors.danger));
      }
    }
  }

  Future<void> _onPaymentSuccess(PaymentSuccessResponse response) async {
    try {
      await ref.read(paymentsRepositoryProvider).verifyRazorpayPayment(
            orderId: response.orderId!,
            paymentId: response.paymentId!,
            signature: response.signature!,
          );
      ref.invalidate(feesProvider);
      ref.invalidate(transactionsProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Payment successful.')));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  void _onPaymentError(PaymentFailureResponse response) {
    if (mounted) setState(() => _paying = false);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(response.message ?? 'Payment failed or was cancelled.'), backgroundColor: AppColors.danger),
      );
    }
  }

  void _onExternalWallet(ExternalWalletResponse response) {
    if (mounted) setState(() => _paying = false);
  }

  @override
  Widget build(BuildContext context) {
    final feesAsync = ref.watch(feesProvider);
    final paymentsConfigAsync = ref.watch(paymentsConfigProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Fees & Payments')),
      body: feesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load fees: $error')),
        data: (all) {
          final fee = all.where((f) => f.studentId == widget.studentId).firstOrNull;
          if (fee == null) {
            return const Center(child: Text('No fee record found. Please contact the accounts office.', style: TextStyle(color: AppColors.slate), textAlign: TextAlign.center));
          }
          final balance = fee.balance;
          final config = paymentsConfigAsync.valueOrNull;

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(feesProvider);
              ref.invalidate(paymentsConfigProvider);
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: GridView.count(
                      crossAxisCount: 2,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      childAspectRatio: 2.4,
                      children: [
                        _FeeStat(label: 'Total Fee', value: '₹${_inr.format(fee.totalFee)}'),
                        _FeeStat(label: 'Paid', value: '₹${_inr.format(fee.paid)}', color: AppColors.success),
                        _FeeStat(label: 'Balance', value: '₹${_inr.format(balance)}', color: balance > 0 ? AppColors.danger : AppColors.success),
                        _FeeStat(label: 'Due Date', value: fee.dueDate ?? '—'),
                      ],
                    ),
                  ),
                ),
                if (balance > 0) ...[
                  const SizedBox(height: 12),
                  if (config != null && config.isRazorpay && config.available)
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _paying ? null : () => _payOnline(fee),
                        icon: _paying
                            ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Icon(Icons.account_balance_wallet),
                        label: Text(_paying ? 'Opening Payment…' : (fee.plan != null ? 'Pay EMI Now' : 'Pay Now')),
                      ),
                    )
                  else if (config != null && config.available && !config.isRazorpay)
                    const Text(
                      "Online payment is currently set to PayU, which isn't supported in the app yet — please pay via the website or contact the accounts office.",
                      style: TextStyle(color: AppColors.slate, fontSize: 12.5),
                    )
                  else if (paymentsConfigAsync is! AsyncLoading)
                    const Text(
                      "Online payment isn't turned on right now — pay by cash at the accounts office.",
                      style: TextStyle(color: AppColors.slate, fontSize: 12.5),
                    ),
                ],
                if (fee.plan != null) ...[
                  const SizedBox(height: 12),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('EMI Plan', style: TextStyle(fontWeight: FontWeight.w600)),
                          const SizedBox(height: 10),
                          GridView.count(
                            crossAxisCount: 2,
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            childAspectRatio: 2.4,
                            children: [
                              _FeeStat(label: 'Installment', value: '₹${_inr.format(fee.plan!.installmentAmount)}'),
                              _FeeStat(label: 'Tenure', value: '${fee.plan!.tenureMonths} EMIs'),
                              _FeeStat(label: 'EMIs Paid', value: '${fee.plan!.emisPaid}', color: AppColors.success),
                              _FeeStat(label: 'Remaining', value: '${fee.plan!.emisRemaining}', color: AppColors.danger),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.receipt_long_outlined, color: AppColors.maroon),
                    title: const Text('Payment History'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => PaymentHistoryScreen(studentId: widget.studentId, studentName: widget.studentName)),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _FeeStat extends StatelessWidget {
  const _FeeStat({required this.label, required this.value, this.color});
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(label, style: const TextStyle(color: AppColors.slate, fontSize: 11)),
        Text(value, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: color ?? AppColors.ink)),
      ],
    );
  }
}
