import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/attendance_repository.dart';
import '../../core/courses_repository.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../shared/models/course.dart';
import '../admissions/admission.dart';
import '../admissions/admissions_repository.dart';
import 'result_screen.dart';

/// Mirrors StudentsDirectory (src/law-college-erp.jsx:2626): the enrolled
/// roster (approved students only) with search, per-student attendance %,
/// "View Result" and admin-only "Reset Password".
class StudentsListScreen extends ConsumerStatefulWidget {
  const StudentsListScreen({super.key});

  @override
  ConsumerState<StudentsListScreen> createState() => _StudentsListScreenState();
}

class _StudentsListScreenState extends ConsumerState<StudentsListScreen> {
  final _searchController = TextEditingController();
  String _search = '';
  bool _resetting = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _resetPassword(Admission student) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reset Student Password'),
        content: Text(
          "Generate a new temporary password for ${student.name}? Their current password will stop working "
          "immediately, and the new one will be emailed to ${student.email}.",
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Generate & Email')),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _resetting = true);
    try {
      final result = await ref.read(admissionsRepositoryProvider).resetPassword(student.id);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Password Reset'),
          content: Text(
            "A new temporary password for ${student.name} has been emailed to ${result['email']}.\n\n"
            "Temporary password: ${result['tempPassword']}",
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
          ],
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _resetting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final admissionsAsync = ref.watch(admissionsProvider);
    final coursesAsync = ref.watch(coursesProvider);
    final attendanceAsync = ref.watch(attendanceProvider);
    final session = ref.watch(sessionControllerProvider).value;
    final isAdmin = session?.isAdmin ?? false;

    return Scaffold(
      appBar: AppBar(title: const Text('Students')),
      body: admissionsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load students: $error')),
        data: (all) {
          final courses = coursesAsync.valueOrNull ?? const <Course>[];
          final courseNames = {for (final c in courses) c.id: c.name};
          final attendance = attendanceAsync.valueOrNull ?? const [];

          var students = all.where((a) => a.status == AdmissionStatus.approved).toList();
          if (_search.trim().isNotEmpty) {
            final q = _search.trim().toLowerCase();
            students = students.where((s) => (s.name + (s.rollNo ?? '')).toLowerCase().contains(q)).toList();
          }

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
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
              Expanded(
                child: students.isEmpty
                    ? const Center(child: Text('No students found.', style: TextStyle(color: AppColors.slate)))
                    : RefreshIndicator(
                        onRefresh: () async {
                          ref.invalidate(admissionsProvider);
                          ref.invalidate(attendanceProvider);
                        },
                        child: ListView.separated(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          itemCount: students.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final s = students[index];
                            final records = attendance.where((r) => r.studentId == s.id).toList();
                            final pct = records.isEmpty ? null : (records.where((r) => r.isPresent).length / records.length * 100).round();

                            return ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: CircleAvatar(
                                backgroundColor: AppColors.goldLight,
                                child: Text(
                                  s.name.isNotEmpty ? s.name[0].toUpperCase() : '?',
                                  style: const TextStyle(color: AppColors.maroon, fontWeight: FontWeight.bold),
                                ),
                              ),
                              title: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                              subtitle: Text(
                                [
                                  if (s.rollNo != null) s.rollNo!,
                                  courseNames[s.courseId] ?? s.courseId ?? '',
                                  pct == null ? 'No attendance' : '$pct% attendance',
                                ].where((e) => e.isNotEmpty).join(' · '),
                              ),
                              trailing: PopupMenuButton<String>(
                                enabled: !_resetting,
                                onSelected: (value) {
                                  if (value == 'result') {
                                    Navigator.of(context).push(MaterialPageRoute(builder: (_) => ResultScreen(studentId: s.id)));
                                  } else if (value == 'reset') {
                                    _resetPassword(s);
                                  }
                                },
                                itemBuilder: (context) => [
                                  const PopupMenuItem(value: 'result', child: Text('View Result')),
                                  if (isAdmin) const PopupMenuItem(value: 'reset', child: Text('Reset Password')),
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
