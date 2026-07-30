import 'dart:convert';
import 'dart:typed_data';

import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/courses_repository.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../shared/models/course.dart';
import 'academic_detail.dart';
import 'academic_details_repository.dart';
import 'admission.dart';
import 'admissions_repository.dart';

/// Mirrors ApplicationSummary (src/law-college-erp.jsx:670): the full
/// applicant profile plus Approve/Reject actions for whoever has the
/// "admissions" module and an admin/super_admin role (server enforces the
/// same via authorizeRoles + requireModule on the approve/reject routes).
class AdmissionDetailScreen extends ConsumerStatefulWidget {
  const AdmissionDetailScreen({super.key, required this.admissionId});
  final String admissionId;

  @override
  ConsumerState<AdmissionDetailScreen> createState() => _AdmissionDetailScreenState();
}

class _AdmissionDetailScreenState extends ConsumerState<AdmissionDetailScreen> {
  bool _busy = false;

  Future<void> _approve(Admission admission) async {
    setState(() => _busy = true);
    try {
      await ref.read(admissionsRepositoryProvider).approve(admission.id);
      ref.invalidate(admissionsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Application approved.')));
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reject(Admission admission) async {
    final reasonController = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reject application'),
        content: SingleChildScrollView(
          child: TextField(
            controller: reasonController,
            decoration: const InputDecoration(labelText: 'Reason (optional)'),
            maxLines: 3,
            autofocus: true,
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(reasonController.text.trim()),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
    reasonController.dispose();
    if (reason == null) return;

    setState(() => _busy = true);
    try {
      await ref.read(admissionsRepositoryProvider).reject(admission.id, reason);
      ref.invalidate(admissionsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Application rejected.')));
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final admissionsAsync = ref.watch(admissionsProvider);
    final coursesAsync = ref.watch(coursesProvider);
    final academicDetailsAsync = ref.watch(academicDetailsProvider);
    final session = ref.watch(sessionControllerProvider).value;

    return Scaffold(
      appBar: AppBar(title: const Text('Application')),
      body: admissionsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load: $error')),
        data: (all) {
          final admission = all.where((a) => a.id == widget.admissionId).firstOrNull;
          if (admission == null) {
            return const Center(child: Text('Application not found.'));
          }
          final courses = coursesAsync.valueOrNull ?? const <Course>[];
          final course = courses.where((c) => c.id == admission.courseId).firstOrNull;
          final academicDetails = (academicDetailsAsync.valueOrNull ?? const <AcademicDetail>[])
              .where((r) => r.studentId == admission.id)
              .sortedBy((r) => r.sno);
          final canDecide = admission.status == AdmissionStatus.pending &&
              session != null &&
              session.isAdmin &&
              session.hasModule('admissions');

          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _Header(admission: admission, course: course),
                    if (admission.status == AdmissionStatus.rejected && (admission.rejectReason ?? '').isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Card(
                        color: AppColors.dangerBg,
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Row(
                            children: [
                              const Icon(Icons.info_outline, color: AppColors.danger),
                              const SizedBox(width: 12),
                              Expanded(child: Text('Rejected: ${admission.rejectReason}', style: const TextStyle(color: AppColors.danger))),
                            ],
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    _Section(title: 'Personal', rows: {
                      'Full Name': admission.name,
                      'Gender': admission.gender,
                      'Date of Birth': admission.dob,
                      'Category': admission.category?.isNotEmpty == true ? admission.category : admission.caste,
                      'Email': admission.email,
                      'Phone': admission.contactPhone,
                      'Emergency Mobile': admission.emergencyMobile,
                      'WhatsApp No.': admission.whatsapp,
                      'Aadhar Number': admission.aadhar,
                      'How did you know about us?': admission.howKnow,
                    }),
                    _Section(title: 'Address', rows: {
                      'Permanent Address': admission.permanentAddress,
                      'City': admission.city,
                      'State': admission.state,
                      'PIN Code': admission.pinCode,
                      'State of Domicile': admission.stateDomicile,
                      'Country': admission.country,
                      'Correspondence Address': admission.correspondenceAddress,
                    }),
                    _Section(title: 'Family', rows: {
                      "Father's Name": admission.fatherName.isEmpty ? null : admission.fatherName,
                      "Father's Phone": admission.fatherPhone,
                      "Father's Email": admission.fatherEmail,
                      "Father's Occupation": admission.fatherOccupationLine,
                      "Father's Designation": admission.fatherPost,
                      "Mother's Name": admission.motherName.isEmpty ? null : admission.motherName,
                      "Mother's Phone": admission.motherPhone,
                      "Mother's Email": admission.motherEmail,
                      "Mother's Occupation": admission.motherOccupationLine,
                      "Mother's Designation": admission.motherPost,
                      'Guardian': admission.guardianName,
                      'Guardian Relation': admission.guardianRelation,
                      'Guardian Mobile': admission.guardianMobile,
                      'Guardian Residence Phone': admission.guardianPhoneResi,
                    }),
                    _Section(title: 'Educational Background', rows: {
                      'Last Institution': admission.lastInstitution,
                      'Passing Year': admission.lastExamYear,
                      'Percentage': admission.lastExamPercentage,
                      'Result': admission.resultStatus,
                      'Gap in Study': admission.gapInStudy,
                      'Lateral Entry': admission.lateralEntry,
                    }),
                    _Section(title: 'Class Applied For', rows: {
                      'Class Group': admission.courseGroup,
                      'Class': course?.name,
                      'Admission Fee': admission.amount != null ? _formatCurrency(admission.amount!) : null,
                      'Medium': admission.medium,
                      'Remarks': admission.remarks,
                      'Applied On': admission.appliedAt != null ? DateFormat('d MMM yyyy, h:mm a').format(admission.appliedAt!) : null,
                    }),
                    if (admission.extraFields != null && admission.extraFields!.isNotEmpty)
                      _Section(
                        title: 'Additional Information',
                        rows: {for (final e in admission.extraFields!.entries) e.key: e.value?.toString()},
                      ),
                    if (academicDetails.isNotEmpty) _AcademicDetailsTable(rows: academicDetails),
                  ],
                ),
              ),
              if (canDecide)
                SafeArea(
                  minimum: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _busy ? null : () => _reject(admission),
                          icon: const Icon(Icons.close, color: AppColors.danger),
                          label: const Text('Reject', style: TextStyle(color: AppColors.danger)),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: _busy ? null : () => _approve(admission),
                          icon: _busy
                              ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.check),
                          label: const Text('Approve'),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

String _formatCurrency(String amount) {
  final n = num.tryParse(amount);
  if (n == null) return amount;
  return '₹${NumberFormat.decimalPattern('en_IN').format(n)}';
}

/// Decodes a `data:image/...;base64,....` URI as used by photoData /
/// signatureData; returns null for anything else (empty, a bare path, etc).
Uint8List? _decodeDataUri(String? value) {
  if (value == null || !value.startsWith('data:')) return null;
  final commaIndex = value.indexOf(',');
  if (commaIndex == -1) return null;
  try {
    return base64Decode(value.substring(commaIndex + 1));
  } catch (_) {
    return null;
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.admission, required this.course});
  final Admission admission;
  final Course? course;

  @override
  Widget build(BuildContext context) {
    final photoBytes = _decodeDataUri(admission.photoData);
    final signatureBytes = _decodeDataUri(admission.signatureData);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (photoBytes != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: Image.memory(photoBytes, width: 64, height: 64, fit: BoxFit.cover),
              )
            else
              CircleAvatar(
                radius: 28,
                backgroundColor: AppColors.goldLight,
                child: Text(
                  admission.name.isNotEmpty ? admission.name[0].toUpperCase() : '?',
                  style: const TextStyle(color: AppColors.maroon, fontWeight: FontWeight.bold, fontSize: 22),
                ),
              ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(admission.name, style: Theme.of(context).textTheme.titleLarge),
                  Text(
                    [if (admission.rollNo != null) 'Roll No. ${admission.rollNo}', course?.name ?? admission.courseId ?? '—']
                        .where((s) => s.isNotEmpty)
                        .join(' · '),
                    style: const TextStyle(color: AppColors.slate),
                  ),
                  if (signatureBytes != null) ...[
                    const SizedBox(height: 8),
                    Image.memory(signatureBytes, height: 28, fit: BoxFit.contain, alignment: Alignment.centerLeft),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AcademicDetailsTable extends StatelessWidget {
  const _AcademicDetailsTable({required this.rows});
  final List<AcademicDetail> rows;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Academic Details', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  headingRowHeight: 36,
                  dataRowMinHeight: 36,
                  dataRowMaxHeight: 48,
                  columnSpacing: 20,
                  columns: const [
                    DataColumn(label: Text('S.No.')),
                    DataColumn(label: Text('Name')),
                    DataColumn(label: Text('Board / University')),
                    DataColumn(label: Text('Passing Year')),
                    DataColumn(label: Text('Grade')),
                    DataColumn(label: Text('Subject')),
                  ],
                  rows: [
                    for (final r in rows)
                      DataRow(cells: [
                        DataCell(Text('${r.sno}')),
                        DataCell(Text(r.name)),
                        DataCell(Text(r.board)),
                        DataCell(Text(r.passingYear)),
                        DataCell(Text(r.grade.isEmpty ? '—' : r.grade)),
                        DataCell(Text(r.subject.isEmpty ? '—' : r.subject)),
                      ]),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.rows});
  final String title;
  final Map<String, String?> rows;

  @override
  Widget build(BuildContext context) {
    final entries = rows.entries.where((e) => (e.value ?? '').isNotEmpty).toList();
    if (entries.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              for (final e in entries)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(width: 150, child: Text(e.key, style: const TextStyle(color: AppColors.slate))),
                      Expanded(child: Text(e.value!)),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
