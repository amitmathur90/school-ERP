import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/attendance_repository.dart';
import '../../core/courses_repository.dart';
import '../../core/theme.dart';
import '../../shared/models/course.dart';
import '../admissions/admission.dart';
import '../admissions/admissions_repository.dart';

/// Mirrors AttendanceMarking (src/law-college-erp.jsx:4369): pick a course
/// and date, then mark Present/Absent for every enrolled student and save.
class AttendanceMarkingScreen extends ConsumerStatefulWidget {
  const AttendanceMarkingScreen({super.key});

  @override
  ConsumerState<AttendanceMarkingScreen> createState() => _AttendanceMarkingScreenState();
}

class _AttendanceMarkingScreenState extends ConsumerState<AttendanceMarkingScreen> {
  String? _courseId;
  DateTime _date = DateTime.now();
  final Map<String, String> _marks = {};
  String? _markedForCourse;
  bool _busy = false;

  /// Defaults every roster student to Present without clobbering marks the
  /// user already toggled. Only resets on an actual course change — roster
  /// data (from admissionsProvider) can resolve on a later frame than
  /// courses, so this can't assume the roster is already complete the one
  /// time _courseId first changes.
  void _syncRosterDefaults(List<Admission> roster) {
    if (_courseId != _markedForCourse) {
      _markedForCourse = _courseId;
      _marks.clear();
    }
    for (final s in roster) {
      _marks.putIfAbsent(s.id, () => 'Present');
    }
  }

  Future<void> _save(Course course) async {
    setState(() => _busy = true);
    try {
      await ref.read(attendanceRepositoryProvider).mark(
            date: DateFormat('yyyy-MM-dd').format(_date),
            subject: course.name,
            marks: _marks,
          );
      ref.invalidate(attendanceProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Attendance saved.')));
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

    return Scaffold(
      appBar: AppBar(title: const Text('Mark Attendance')),
      body: coursesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load courses: $error')),
        data: (courses) {
          if (courses.isEmpty) {
            return const Center(child: Text('No courses available.', style: TextStyle(color: AppColors.slate)));
          }
          _courseId ??= courses.first.id;
          final course = courses.firstWhere((c) => c.id == _courseId, orElse: () => courses.first);
          final students = admissionsAsync.valueOrNull ?? const <Admission>[];
          final roster = students.where((s) => s.courseId == _courseId && s.status == AdmissionStatus.approved).toList();
          _syncRosterDefaults(roster);

          return Column(
            children: [
              Card(
                margin: const EdgeInsets.all(12),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: [
                      DropdownButtonFormField<String>(
                        value: _courseId,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Class'),
                        items: [
                          for (final c in courses) DropdownMenuItem(value: c.id, child: Text(c.name, overflow: TextOverflow.ellipsis)),
                        ],
                        onChanged: (v) => setState(() => _courseId = v),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: InkWell(
                              onTap: () async {
                                final picked = await showDatePicker(
                                  context: context,
                                  initialDate: _date,
                                  firstDate: DateTime(2000),
                                  lastDate: DateTime(2100),
                                );
                                if (picked != null) setState(() => _date = picked);
                              },
                              child: InputDecorator(
                                decoration: const InputDecoration(labelText: 'Date'),
                                child: Text(DateFormat('d MMM yyyy').format(_date)),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          FilledButton.icon(
                            onPressed: roster.isEmpty || _busy ? null : () => _save(course),
                            icon: _busy
                                ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Icon(Icons.check),
                            label: const Text('Save'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: roster.isEmpty
                    ? const Center(child: Text('No students in this course.', style: TextStyle(color: AppColors.slate)))
                    : ListView.separated(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        itemCount: roster.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final s = roster[index];
                          final status = _marks[s.id] ?? 'Present';
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                            subtitle: Text(s.rollNo ?? ''),
                            trailing: ToggleButtons(
                              isSelected: [status == 'Present', status == 'Absent'],
                              onPressed: (i) => setState(() => _marks[s.id] = i == 0 ? 'Present' : 'Absent'),
                              borderRadius: BorderRadius.circular(6),
                              selectedColor: Colors.white,
                              fillColor: status == 'Present' ? AppColors.success : AppColors.danger,
                              constraints: const BoxConstraints(minHeight: 32, minWidth: 64),
                              children: const [Text('Present'), Text('Absent')],
                            ),
                          );
                        },
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}
