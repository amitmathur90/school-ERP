import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/theme.dart';
import '../../shared/models/fee.dart';

final _inr = NumberFormat.decimalPattern('en_IN');

/// What the caller needs to create a Razorpay order for.
class PayOnlineRequest {
  PayOnlineRequest({required this.amount, required this.mode, this.tenureMonths});
  final num amount;
  final String mode; // 'Single' | 'EMI'
  final int? tenureMonths;
}

/// Mirrors PayOnlineModal (law-college-erp.jsx:1016) — lets the student pick
/// a single payment or a new EMI plan (or, if already on a plan, just
/// confirms the next installment) before an order is created.
class PayOnlineDialog extends StatefulWidget {
  const PayOnlineDialog({super.key, required this.fee});
  final Fee fee;

  @override
  State<PayOnlineDialog> createState() => _PayOnlineDialogState();
}

class _PayOnlineDialogState extends State<PayOnlineDialog> {
  late final bool _hasPlan = widget.fee.plan != null;
  late final num _balance = widget.fee.balance.clamp(0, widget.fee.totalFee);
  late String _mode = _hasPlan ? 'EMI' : 'Single';
  late final _tenureController = TextEditingController(text: '6');
  late final _amountController = TextEditingController(
    text: (_hasPlan ? widget.fee.plan!.installmentAmount : _balance).toString(),
  );
  String? _error;

  int get _tenure => int.tryParse(_tenureController.text) ?? 0;

  bool get _amountLocked => _hasPlan || _mode == 'EMI';

  void _recomputeAmount() {
    if (_hasPlan) return;
    final amount = _mode == 'EMI' ? (_balance / (_tenure == 0 ? 1 : _tenure)).round() : _balance;
    _amountController.text = amount.toString();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _tenureController.dispose();
    super.dispose();
  }

  void _submit() {
    final amount = num.tryParse(_amountController.text) ?? 0;
    if (amount <= 0) {
      setState(() => _error = 'Enter a valid amount.');
      return;
    }
    if (amount > _balance) {
      setState(() => _error = "Amount can't exceed your outstanding balance of ₹${_inr.format(_balance)}.");
      return;
    }
    Navigator.of(context).pop(
      PayOnlineRequest(amount: amount, mode: _mode, tenureMonths: _mode == 'EMI' && !_hasPlan ? _tenure : null),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Pay Fees Online'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_error != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(color: AppColors.dangerBg, borderRadius: BorderRadius.circular(8)),
                child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
              ),
              const SizedBox(height: 14),
            ],
            Text('Outstanding balance: ₹${_inr.format(_balance)}'),
            const SizedBox(height: 14),
            if (!_hasPlan) ...[
              const Text('Payment Mode', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5)),
              const SizedBox(height: 6),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'Single', label: Text('Single')),
                  ButtonSegment(value: 'EMI', label: Text('EMI')),
                ],
                selected: {_mode},
                onSelectionChanged: (s) => setState(() {
                  _mode = s.first;
                  _recomputeAmount();
                }),
              ),
              const SizedBox(height: 14),
            ],
            if (_mode == 'EMI' && !_hasPlan) ...[
              TextField(
                controller: _tenureController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Number of Installments'),
                onChanged: (_) => setState(_recomputeAmount),
              ),
              const SizedBox(height: 6),
              if (_tenure > 0)
                Text(
                  '$_tenure equal installments of ₹${_inr.format((_balance / _tenure).round())} each.',
                  style: const TextStyle(color: AppColors.slate, fontSize: 12.5),
                ),
              const SizedBox(height: 14),
            ],
            if (_hasPlan) ...[
              const Text("You're on an EMI plan — this pays your next installment.", style: TextStyle(color: AppColors.slate, fontSize: 12.5)),
              const SizedBox(height: 14),
            ],
            TextField(
              controller: _amountController,
              keyboardType: TextInputType.number,
              enabled: !_amountLocked,
              decoration: const InputDecoration(labelText: 'Amount to Pay (₹)'),
              onChanged: (_) => setState(() {}),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: _balance <= 0 ? null : _submit,
          child: Text('Pay ₹${_inr.format(num.tryParse(_amountController.text) ?? 0)} with Razorpay'),
        ),
      ],
    );
  }
}
