import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/courses_repository.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../shared/models/course.dart';
import '../admissions/admission.dart';
import '../admissions/admissions_repository.dart';

const _courseGroups = ['Pre-Primary', 'Primary', 'Middle', 'Secondary', 'Senior Secondary'];
final _inr = NumberFormat.decimalPattern('en_IN');

/// Mirrors CoursesManager (src/law-college-erp.jsx:3214): a grid of course
/// cards (duration / seats / fees), with Add and Delete for admins.
class CoursesScreen extends ConsumerStatefulWidget {
  const CoursesScreen({super.key});

  @override
  ConsumerState<CoursesScreen> createState() => _CoursesScreenState();
}

class _CoursesScreenState extends ConsumerState<CoursesScreen> {
  bool _busy = false;

  Future<void> _addCourse() async {
    final nameController = TextEditingController();
    final codeController = TextEditingController();
    final departmentController = TextEditingController();
    final durationController = TextEditingController();
    final seatsController = TextEditingController();
    final admissionFeeController = TextEditingController();
    final feeController = TextEditingController();
    String group = _courseGroups.first;

    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Add New Course'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Class Name *', hintText: 'e.g. Class 5')),
                const SizedBox(height: 12),
                TextField(controller: codeController, decoration: const InputDecoration(labelText: 'Short Code *', hintText: 'e.g. V')),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: group,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Class Group *'),
                  items: [for (final g in _courseGroups) DropdownMenuItem(value: g, child: Text(g))],
                  onChanged: (v) => setDialogState(() => group = v!),
                ),
                const SizedBox(height: 12),
                TextField(controller: departmentController, decoration: const InputDecoration(labelText: 'Department', hintText: 'e.g. Law')),
                const SizedBox(height: 12),
                TextField(controller: durationController, decoration: const InputDecoration(labelText: 'Duration', hintText: 'e.g. 5 Years')),
                const SizedBox(height: 12),
                TextField(controller: seatsController, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Total Seats')),
                const SizedBox(height: 12),
                TextField(controller: admissionFeeController, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Admission Fee (₹)')),
                const SizedBox(height: 12),
                TextField(controller: feeController, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Annual Fee (₹)')),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Add Course')),
          ],
        ),
      ),
    );
    if (submitted != true) return;
    if (nameController.text.trim().isEmpty || codeController.text.trim().isEmpty) return;

    setState(() => _busy = true);
    try {
      await ref.read(coursesRepositoryProvider).create({
        'name': nameController.text.trim(),
        'code': codeController.text.trim(),
        'group': group,
        'department': departmentController.text.trim(),
        'duration': durationController.text.trim(),
        'seats': int.tryParse(seatsController.text) ?? 0,
        'admissionFee': num.tryParse(admissionFeeController.text) ?? 0,
        'fee': num.tryParse(feeController.text) ?? 0,
      });
      ref.invalidate(coursesProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deleteCourse(Course c) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete course?'),
        content: Text('Delete ${c.name}? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _busy = true);
    try {
      await ref.read(coursesRepositoryProvider).delete(c.id);
      ref.invalidate(coursesProvider);
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
    final coursesAsync = ref.watch(coursesProvider);
    final admissionsAsync = ref.watch(admissionsProvider);
    final session = ref.watch(sessionControllerProvider).value;
    final isAdmin = session?.isAdmin ?? false;

    return Scaffold(
      appBar: AppBar(title: const Text('Classes Offered')),
      floatingActionButton: isAdmin
          ? FloatingActionButton.extended(onPressed: _busy ? null : _addCourse, icon: const Icon(Icons.add), label: const Text('Add Course'))
          : null,
      body: coursesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load courses: $error')),
        data: (courses) {
          final students = admissionsAsync.valueOrNull ?? const <Admission>[];
          int enrolledCount(String courseId) =>
              students.where((s) => s.courseId == courseId && s.status == AdmissionStatus.approved).length;

          if (courses.isEmpty) {
            return const Center(child: Text('No courses yet.', style: TextStyle(color: AppColors.slate)));
          }

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(coursesProvider),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: courses.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final c = courses[index];
                final seats = int.tryParse(c.seats ?? '0') ?? 0;
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${c.code} · ${c.group ?? 'Primary'}',
                                    style: const TextStyle(color: AppColors.gold, fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(c.name, style: Theme.of(context).textTheme.titleMedium),
                                ],
                              ),
                            ),
                            if (isAdmin)
                              IconButton(
                                icon: const Icon(Icons.delete_outline, color: AppColors.danger, size: 20),
                                onPressed: _busy ? null : () => _deleteCourse(c),
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 20,
                          runSpacing: 10,
                          children: [
                            _Stat(label: 'Duration', value: c.duration ?? '—'),
                            _Stat(label: 'Seats', value: '${enrolledCount(c.id)}/$seats'),
                            _Stat(label: 'Admission Fee', value: '₹${_inr.format(num.tryParse(c.admissionFee ?? '0') ?? 0)}'),
                            _Stat(label: 'Annual Fee', value: '₹${_inr.format(num.tryParse(c.fee ?? '0') ?? 0)}'),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: AppColors.slate, fontSize: 11.5)),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
      ],
    );
  }
}
