import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/theme.dart';
import '../../core/transactions_repository.dart';
import '../../shared/models/transaction.dart';

/// Mirrors the "Payment History" modal in FeesManager
/// (src/law-college-erp.jsx:3460-3485).
class PaymentHistoryScreen extends ConsumerWidget {
  const PaymentHistoryScreen({super.key, required this.studentId, required this.studentName});
  final String studentId;
  final String studentName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final transactionsAsync = ref.watch(transactionsProvider);

    return Scaffold(
      appBar: AppBar(title: Text('Payments — $studentName')),
      body: transactionsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load payments: $error')),
        data: (all) {
          final txns = all.where((t) => t.studentId == studentId).toList()..sort((a, b) => b.date.compareTo(a.date));
          if (txns.isEmpty) {
            return const Center(
              child: Text("This student hasn't made any payments yet.", style: TextStyle(color: AppColors.slate)),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: txns.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, index) => _TransactionCard(t: txns[index]),
          );
        },
      ),
    );
  }
}

class _TransactionCard extends StatelessWidget {
  const _TransactionCard({required this.t});
  final PaymentTransaction t;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(t.purposeLabel, style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(
                  '₹${NumberFormat.decimalPattern('en_IN').format(t.totalAmount)}',
                  style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.maroon),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(DateFormat('d MMM yyyy, h:mm a').format(t.date), style: const TextStyle(color: AppColors.slate, fontSize: 12)),
            if (t.paymentType != null || t.paymentMode != null)
              Text(
                [t.paymentType, t.paymentMode].where((s) => s != null && s.isNotEmpty).join(' · '),
                style: const TextStyle(color: AppColors.slate, fontSize: 12),
              ),
            if (t.recordedByName != null && t.recordedByName!.isNotEmpty)
              Text('Recorded by ${t.recordedByName}', style: const TextStyle(color: AppColors.slate, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
