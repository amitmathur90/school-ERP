import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/courses_repository.dart';
import '../../core/fees_repository.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../shared/models/course.dart';
import '../../shared/models/fee.dart';
import '../admissions/admission.dart';
import '../admissions/admissions_repository.dart';
import 'payment_history_screen.dart';

const _statuses = ['All', 'Paid', 'Partial', 'Due'];

/// Mirrors FeesManager (src/law-college-erp.jsx:3273): the fee ledger over
/// enrolled (approved) students, with search/course/status filters, a
/// Payment History drill-down, and an admin-only Update action.
class FeesListScreen extends ConsumerStatefulWidget {
  const FeesListScreen({super.key});

  @override
  ConsumerState<FeesListScreen> createState() => _FeesListScreenState();
}

class _FeesListScreenState extends ConsumerState<FeesListScreen> {
  final _searchController = TextEditingController();
  String _search = '';
  String? _courseId;
  String _status = 'All';
  bool _busy = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _updateFee(Admission student, Fee? fee) async {
    final amountController = TextEditingController(text: fee?.paid.toString() ?? '0');
    DateTime? dueDate = fee?.dueDate != null ? DateTime.tryParse(fee!.dueDate!) : null;

    final result = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text('Update Fee — ${student.name}'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: amountController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Amount Paid (₹)'),
                ),
                const SizedBox(height: 12),
                InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: dueDate ?? DateTime.now(),
                      firstDate: DateTime(2000),
                      lastDate: DateTime(2100),
                    );
                    if (picked != null) setDialogState(() => dueDate = picked);
                  },
                  child: InputDecorator(
                    decoration: const InputDecoration(labelText: 'Due Date'),
                    child: Text(dueDate != null ? DateFormat('d MMM yyyy').format(dueDate!) : 'Not set'),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Save')),
          ],
        ),
      ),
    );
    if (result != true) return;

    setState(() => _busy = true);
    try {
      await ref.read(feesRepositoryProvider).updatePaid(
            student.id,
            paid: num.tryParse(amountController.text) ?? 0,
            dueDate: dueDate != null ? DateFormat('yyyy-MM-dd').format(dueDate!) : null,
          );
      ref.invalidate(feesProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Fee updated.')));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static const _statusColors = {
    'Paid': (fg: AppColors.success, bg: AppColors.successBg),
    'Partial': (fg: AppColors.warn, bg: AppColors.warnBg),
    'Due': (fg: AppColors.danger, bg: AppColors.dangerBg),
  };

  @override
  Widget build(BuildContext context) {
    final admissionsAsync = ref.watch(admissionsProvider);
    final coursesAsync = ref.watch(coursesProvider);
    final feesAsync = ref.watch(feesProvider);
    final session = ref.watch(sessionControllerProvider).value;
    final isAdmin = session?.isAdmin ?? false;

    return Scaffold(
      appBar: AppBar(title: const Text('Fee Ledger')),
      body: admissionsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load: $error')),
        data: (all) {
          final courses = coursesAsync.valueOrNull ?? const <Course>[];
          final courseNames = {for (final c in courses) c.id: c.name};
          final fees = feesAsync.valueOrNull ?? const <Fee>[];
          final feeByStudent = {for (final f in fees) f.studentId: f};

          var students = all.where((a) => a.status == AdmissionStatus.approved).toList();
          if (_search.trim().isNotEmpty) {
            final q = _search.trim().toLowerCase();
            students = students.where((s) => (s.name + (s.rollNo ?? '')).toLowerCase().contains(q)).toList();
          }
          if (_courseId != null) {
            students = students.where((s) => s.courseId == _courseId).toList();
          }
          if (_status != 'All') {
            students = students.where((s) {
              final f = feeByStudent[s.id];
              return (f?.statusKey ?? 'Due') == _status;
            }).toList();
          }

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                child: TextField(
                  controller: _searchController,
                  decoration: const InputDecoration(
                    isDense: true,
                    prefixIcon: Icon(Icons.search),
                    hintText: 'Search name or roll no.',
                  ),
                  onChanged: (v) => setState(() => _search = v),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String?>(
                        value: _courseId,
                        isDense: true,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Class'),
                        items: [
                          const DropdownMenuItem(value: null, child: Text('All Classes', overflow: TextOverflow.ellipsis)),
                          for (final c in courses)
                            DropdownMenuItem(value: c.id, child: Text(c.name, overflow: TextOverflow.ellipsis)),
                        ],
                        onChanged: (v) => setState(() => _courseId = v),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: _status,
                        isDense: true,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Status'),
                        items: [for (final s in _statuses) DropdownMenuItem(value: s, child: Text(s, overflow: TextOverflow.ellipsis))],
                        onChanged: (v) => setState(() => _status = v!),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: students.isEmpty
                    ? const Center(child: Text('No matching fee records.', style: TextStyle(color: AppColors.slate)))
                    : RefreshIndicator(
                        onRefresh: () async {
                          ref.invalidate(admissionsProvider);
                          ref.invalidate(feesProvider);
                        },
                        child: ListView.separated(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          itemCount: students.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final s = students[index];
                            final fee = feeByStudent[s.id];
                            final statusKey = fee?.statusKey ?? 'Due';
                            final colors = _statusColors[statusKey]!;
                            final fmt = NumberFormat.decimalPattern('en_IN');

                            return ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                              subtitle: Text(
                                '${s.rollNo ?? ''} · ${courseNames[s.courseId] ?? ''}\n'
                                '₹${fmt.format(fee?.paid ?? 0)} of ₹${fmt.format(fee?.totalFee ?? 0)} paid'
                                '${fee?.dueDate != null ? ' · Due ${fee!.dueDate}' : ''}',
                              ),
                              isThreeLine: true,
                              trailing: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Chip(
                                    label: Text(fee == null ? 'No Record' : fee.statusLabel, style: TextStyle(color: colors.fg, fontSize: 11)),
                                    backgroundColor: colors.bg,
                                    side: BorderSide.none,
                                    visualDensity: VisualDensity.compact,
                                  ),
                                  PopupMenuButton<String>(
                                    enabled: !_busy,
                                    onSelected: (value) {
                                      if (value == 'history') {
                                        Navigator.of(context).push(
                                          MaterialPageRoute(builder: (_) => PaymentHistoryScreen(studentId: s.id, studentName: s.name)),
                                        );
                                      } else if (value == 'update') {
                                        _updateFee(s, fee);
                                      }
                                    },
                                    itemBuilder: (context) => [
                                      const PopupMenuItem(value: 'history', child: Text('Payment History')),
                                      if (isAdmin) const PopupMenuItem(value: 'update', child: Text('Update Fee')),
                                    ],
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}
