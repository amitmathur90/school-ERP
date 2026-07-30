import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/attendance_repository.dart';
import '../../core/courses_repository.dart';
import '../../core/fees_repository.dart';
import '../../core/theme.dart';
import '../../core/transactions_repository.dart';
import '../../shared/models/attendance_record.dart';
import '../../shared/models/course.dart';
import '../../shared/models/fee.dart';
import '../../shared/models/transaction.dart';
import '../admissions/admission.dart';
import '../admissions/admissions_repository.dart';

final _inr = NumberFormat.decimalPattern('en_IN');
String _money(num v) => '₹${_inr.format(v)}';

const _reportTabs = [
  ('admission', 'Admission Report'),
  ('student', 'Student Report'),
  ('fee', 'Fee Report'),
  ('emi', 'EMI Report'),
  ('pendingFee', 'Pending Fee'),
  ('courseWise', 'Course-Wise Report'),
  ('daily', 'Daily Collection'),
];

/// Mirrors ReportsCenter and its per-report tabs (src/law-college-erp.jsx
/// :3840-4036) — all computed client-side over data already loaded by the
/// Admissions/Fees screens (same providers, so no extra network cost).
class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});

  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  String _tab = 'admission';

  @override
  Widget build(BuildContext context) {
    final admissionsAsync = ref.watch(admissionsProvider);
    final coursesAsync = ref.watch(coursesProvider);
    final feesAsync = ref.watch(feesProvider);
    final transactionsAsync = ref.watch(transactionsProvider);
    final attendanceAsync = ref.watch(attendanceProvider);

    final loading = admissionsAsync.isLoading || coursesAsync.isLoading;
    final error = admissionsAsync.error ?? coursesAsync.error;

    return Scaffold(
      appBar: AppBar(title: const Text('Reports')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: Text('Could not load: $error'))
              : Column(
                  children: [
                    SizedBox(
                      height: 48,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        itemCount: _reportTabs.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                        itemBuilder: (context, i) {
                          final (key, label) = _reportTabs[i];
                          return ChoiceChip(
                            label: Text(label),
                            selected: _tab == key,
                            onSelected: (_) => setState(() => _tab = key),
                          );
                        },
                      ),
                    ),
                    const Divider(height: 1),
                    Expanded(
                      child: _buildReport(
                        students: admissionsAsync.value ?? const [],
                        courses: coursesAsync.value ?? const [],
                        fees: feesAsync.valueOrNull ?? const [],
                        transactions: transactionsAsync.valueOrNull ?? const [],
                        attendance: attendanceAsync.valueOrNull ?? const [],
                      ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildReport({
    required List<Admission> students,
    required List<Course> courses,
    required List<Fee> fees,
    required List<PaymentTransaction> transactions,
    required List<AttendanceRecord> attendance,
  }) {
    switch (_tab) {
      case 'admission':
        return _AdmissionReport(students: students, courses: courses);
      case 'student':
        return _StudentReport(students: students, courses: courses, attendance: attendance);
      case 'fee':
        return _FeeReport(students: students, courses: courses, fees: fees);
      case 'emi':
        return _EmiReport(students: students, courses: courses, fees: fees);
      case 'pendingFee':
        return _PendingFeeReport(students: students, courses: courses, fees: fees);
      case 'courseWise':
        return _CourseWiseReport(students: students, courses: courses, fees: fees);
      case 'daily':
        return _DailyCollectionReport(students: students, transactions: transactions);
      default:
        return const SizedBox.shrink();
    }
  }
}

/// Shared shell: a filter row (optional) above a horizontally-scrollable
/// DataTable, matching ReportView's layout (law-college-erp.jsx:3799).
class _ReportTable extends StatelessWidget {
  const _ReportTable({required this.columns, required this.rows, this.filters, this.footerNote});
  final List<String> columns;
  final List<List<String>> rows;
  final Widget? filters;
  final String? footerNote;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (filters != null) Padding(padding: const EdgeInsets.all(12), child: filters),
        if (rows.isEmpty)
          Expanded(
            child: Center(child: Text('No data for this report.', style: const TextStyle(color: AppColors.slate))),
          )
        else
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(12),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  headingRowHeight: 36,
                  dataRowMinHeight: 36,
                  dataRowMaxHeight: 48,
                  columnSpacing: 20,
                  columns: [for (final c in columns) DataColumn(label: Text(c))],
                  rows: [for (final r in rows) DataRow(cells: [for (final v in r) DataCell(Text(v))])],
                ),
              ),
            ),
          ),
        if (footerNote != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Text(footerNote!, style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
      ],
    );
  }
}

class _CourseDropdown extends StatelessWidget {
  const _CourseDropdown({required this.courses, required this.value, required this.onChanged});
  final List<Course> courses;
  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String?>(
      value: value,
      isDense: true,
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'Course'),
      items: [
        const DropdownMenuItem(value: null, child: Text('All Courses', overflow: TextOverflow.ellipsis)),
        for (final c in courses) DropdownMenuItem(value: c.id, child: Text(c.name, overflow: TextOverflow.ellipsis)),
      ],
      onChanged: onChanged,
    );
  }
}

class _AdmissionReport extends StatefulWidget {
  const _AdmissionReport({required this.students, required this.courses});
  final List<Admission> students;
  final List<Course> courses;

  @override
  State<_AdmissionReport> createState() => _AdmissionReportState();
}

class _AdmissionReportState extends State<_AdmissionReport> {
  AdmissionStatus? _status;
  String? _courseId;

  @override
  Widget build(BuildContext context) {
    final courseNames = {for (final c in widget.courses) c.id: c.name};
    final list = widget.students
        .where((s) => s.status != AdmissionStatus.draft)
        .where((s) => _status == null || s.status == _status)
        .where((s) => _courseId == null || s.courseId == _courseId)
        .toList();

    return _ReportTable(
      filters: Row(
        children: [
          Expanded(
            child: DropdownButtonFormField<AdmissionStatus?>(
              value: _status,
              isDense: true,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Status'),
              items: const [
                DropdownMenuItem(value: null, child: Text('All')),
                DropdownMenuItem(value: AdmissionStatus.pending, child: Text('Pending')),
                DropdownMenuItem(value: AdmissionStatus.approved, child: Text('Approved')),
                DropdownMenuItem(value: AdmissionStatus.rejected, child: Text('Rejected')),
              ],
              onChanged: (v) => setState(() => _status = v),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(child: _CourseDropdown(courses: widget.courses, value: _courseId, onChanged: (v) => setState(() => _courseId = v))),
        ],
      ),
      columns: const ['Applied Date', 'Name', 'Email', 'Phone', 'Course', 'Category', 'Status', 'Roll No'],
      rows: [
        for (final s in list)
          [
            s.appliedAt != null
                ? DateFormat('d MMM yyyy').format(s.appliedAt!)
                : s.createdAt != null
                    ? DateFormat('d MMM yyyy').format(s.createdAt!)
                    : '—',
            s.name,
            s.email ?? '—',
            s.contactPhone.isEmpty ? '—' : s.contactPhone,
            courseNames[s.courseId] ?? '—',
            s.category ?? '—',
            s.status.name[0].toUpperCase() + s.status.name.substring(1),
            s.rollNo ?? '—',
          ],
      ],
    );
  }
}

class _StudentReport extends StatefulWidget {
  const _StudentReport({required this.students, required this.courses, required this.attendance});
  final List<Admission> students;
  final List<Course> courses;
  final List<AttendanceRecord> attendance;

  @override
  State<_StudentReport> createState() => _StudentReportState();
}

class _StudentReportState extends State<_StudentReport> {
  String? _courseId;

  @override
  Widget build(BuildContext context) {
    final courseNames = {for (final c in widget.courses) c.id: c.name};
    final list = widget.students
        .where((s) => s.status == AdmissionStatus.approved)
        .where((s) => _courseId == null || s.courseId == _courseId)
        .toList();

    String pctFor(String studentId) {
      final rec = widget.attendance.where((r) => r.studentId == studentId).toList();
      if (rec.isEmpty) return '—';
      return '${(rec.where((r) => r.isPresent).length / rec.length * 100).round()}';
    }

    return _ReportTable(
      filters: _CourseDropdown(courses: widget.courses, value: _courseId, onChanged: (v) => setState(() => _courseId = v)),
      columns: const ['Roll No', 'Name', 'Course', 'Gender', 'Category', 'Email', 'Phone', 'Attendance %', 'DOB'],
      rows: [
        for (final s in list)
          [
            s.rollNo ?? '—',
            s.name,
            courseNames[s.courseId] ?? '—',
            s.gender ?? '—',
            s.category ?? '—',
            s.email ?? '—',
            s.contactPhone.isEmpty ? '—' : s.contactPhone,
            pctFor(s.id),
            s.dob ?? '—',
          ],
      ],
    );
  }
}

class _FeeReport extends StatefulWidget {
  const _FeeReport({required this.students, required this.courses, required this.fees});
  final List<Admission> students;
  final List<Course> courses;
  final List<Fee> fees;

  @override
  State<_FeeReport> createState() => _FeeReportState();
}

class _FeeReportState extends State<_FeeReport> {
  String? _courseId;
  String _status = 'All';

  @override
  Widget build(BuildContext context) {
    final courseNames = {for (final c in widget.courses) c.id: c.name};
    final feeByStudent = {for (final f in widget.fees) f.studentId: f};
    final list = widget.students
        .where((s) => s.status == AdmissionStatus.approved)
        .where((s) => _courseId == null || s.courseId == _courseId)
        .where((s) => _status == 'All' || (feeByStudent[s.id]?.statusLabel ?? 'No Record') == _status)
        .toList();
    final total = list.fold<num>(0, (sum, s) => sum + (feeByStudent[s.id]?.paid ?? 0));

    return _ReportTable(
      filters: Row(
        children: [
          Expanded(child: _CourseDropdown(courses: widget.courses, value: _courseId, onChanged: (v) => setState(() => _courseId = v))),
          const SizedBox(width: 12),
          Expanded(
            child: DropdownButtonFormField<String>(
              value: _status,
              isDense: true,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Status'),
              items: const [
                DropdownMenuItem(value: 'All', child: Text('All')),
                DropdownMenuItem(value: 'Paid in Full', child: Text('Paid')),
                DropdownMenuItem(value: 'Partially Paid', child: Text('Partial')),
                DropdownMenuItem(value: 'Due', child: Text('Due')),
              ],
              onChanged: (v) => setState(() => _status = v!),
            ),
          ),
        ],
      ),
      footerNote: 'Total Collected: ${_money(total)}',
      columns: const ['Roll No', 'Name', 'Course', 'Total Fee', 'Paid', 'Balance', 'Status'],
      rows: [
        for (final s in list)
          [
            s.rollNo ?? '—',
            s.name,
            courseNames[s.courseId] ?? '—',
            _money(feeByStudent[s.id]?.totalFee ?? 0),
            _money(feeByStudent[s.id]?.paid ?? 0),
            _money(feeByStudent[s.id]?.balance ?? 0),
            feeByStudent[s.id]?.statusLabel ?? 'No Record',
          ],
      ],
    );
  }
}

class _EmiReport extends StatelessWidget {
  const _EmiReport({required this.students, required this.courses, required this.fees});
  final List<Admission> students;
  final List<Course> courses;
  final List<Fee> fees;

  @override
  Widget build(BuildContext context) {
    final courseNames = {for (final c in courses) c.id: c.name};
    final feeByStudent = {for (final f in fees) f.studentId: f};
    final list = students.where((s) => s.status == AdmissionStatus.approved && feeByStudent[s.id]?.plan != null).toList();

    return _ReportTable(
      columns: const ['Roll No', 'Name', 'Course', 'Total EMI', 'Tenure (Mo.)', 'Installment', 'EMIs Paid', 'Remaining', 'Remaining Amt'],
      rows: [
        for (final s in list)
          () {
            final plan = feeByStudent[s.id]!.plan!;
            return [
              s.rollNo ?? '—',
              s.name,
              courseNames[s.courseId] ?? '—',
              _money(plan.totalAmount),
              '${plan.tenureMonths}',
              _money(plan.installmentAmount),
              '${plan.emisPaid}',
              '${plan.emisRemaining}',
              _money(plan.remainingAmount),
            ];
          }(),
      ],
    );
  }
}

class _PendingFeeReport extends StatelessWidget {
  const _PendingFeeReport({required this.students, required this.courses, required this.fees});
  final List<Admission> students;
  final List<Course> courses;
  final List<Fee> fees;

  @override
  Widget build(BuildContext context) {
    final courseNames = {for (final c in courses) c.id: c.name};
    final feeByStudent = {for (final f in fees) f.studentId: f};
    final entries = students
        .where((s) => s.status == AdmissionStatus.approved)
        .map((s) => (student: s, balance: feeByStudent[s.id]?.balance ?? 0))
        .where((e) => e.balance > 0)
        .toList()
      ..sort((a, b) => b.balance.compareTo(a.balance));
    final total = entries.fold<num>(0, (sum, e) => sum + e.balance);

    return _ReportTable(
      footerNote: entries.isEmpty ? null : 'Total Outstanding: ${_money(total)}',
      columns: const ['Roll No', 'Name', 'Course', 'Phone', 'Total Fee', 'Paid', 'Balance'],
      rows: [
        for (final e in entries)
          [
            e.student.rollNo ?? '—',
            e.student.name,
            courseNames[e.student.courseId] ?? '—',
            e.student.contactPhone.isEmpty ? '—' : e.student.contactPhone,
            _money(feeByStudent[e.student.id]?.totalFee ?? 0),
            _money(feeByStudent[e.student.id]?.paid ?? 0),
            _money(e.balance),
          ],
      ],
    );
  }
}

class _CourseWiseReport extends StatelessWidget {
  const _CourseWiseReport({required this.students, required this.courses, required this.fees});
  final List<Admission> students;
  final List<Course> courses;
  final List<Fee> fees;

  @override
  Widget build(BuildContext context) {
    final feeByStudent = {for (final f in fees) f.studentId: f};
    final approved = students.where((s) => s.status == AdmissionStatus.approved).toList();

    return _ReportTable(
      columns: const ['Course', 'Group', 'Total Seats', 'Enrolled', 'Available', 'Fee Collected', 'Fee Pending'],
      rows: [
        for (final c in courses)
          () {
            final enrolled = approved.where((s) => s.courseId == c.id).toList();
            final seats = int.tryParse(c.seats ?? '0') ?? 0;
            final collected = enrolled.fold<num>(0, (sum, s) => sum + (feeByStudent[s.id]?.paid ?? 0));
            final pending = enrolled.fold<num>(0, (sum, s) => sum + (feeByStudent[s.id]?.balance ?? 0));
            return [
              c.name,
              c.group ?? 'Graduation',
              '$seats',
              '${enrolled.length}',
              '${(seats - enrolled.length).clamp(0, seats)}',
              _money(collected),
              _money(pending),
            ];
          }(),
      ],
    );
  }
}

class _DailyCollectionReport extends StatefulWidget {
  const _DailyCollectionReport({required this.students, required this.transactions});
  final List<Admission> students;
  final List<PaymentTransaction> transactions;

  @override
  State<_DailyCollectionReport> createState() => _DailyCollectionReportState();
}

class _DailyCollectionReportState extends State<_DailyCollectionReport> {
  DateTime _date = DateTime.now();

  @override
  Widget build(BuildContext context) {
    final studentNames = {for (final s in widget.students) s.id: (s.name, s.rollNo)};
    final dayKey = DateFormat('yyyy-MM-dd').format(_date);
    final txns = widget.transactions.where((t) => DateFormat('yyyy-MM-dd').format(t.date) == dayKey).toList();
    final total = txns.fold<num>(0, (sum, t) => sum + t.totalAmount);

    return _ReportTable(
      filters: InkWell(
        onTap: () async {
          final picked = await showDatePicker(context: context, initialDate: _date, firstDate: DateTime(2000), lastDate: DateTime(2100));
          if (picked != null) setState(() => _date = picked);
        },
        child: InputDecorator(
          decoration: const InputDecoration(labelText: 'Date'),
          child: Text(DateFormat('d MMM yyyy').format(_date)),
        ),
      ),
      footerNote: txns.isEmpty ? null : 'Total Collected on ${DateFormat('d MMM yyyy').format(_date)}: ${_money(total)}',
      columns: const ['Student', 'Roll No', 'Amount', 'Payment Type', 'Mode', 'Recorded By'],
      rows: [
        for (final t in txns)
          [
            studentNames[t.studentId]?.$1 ?? t.studentId,
            studentNames[t.studentId]?.$2 ?? '—',
            _money(t.totalAmount),
            t.paymentType ?? '—',
            t.paymentMode ?? '—',
            t.recordedByName ?? '—',
          ],
      ],
    );
  }
}
