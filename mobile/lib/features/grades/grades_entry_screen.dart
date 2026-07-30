import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/courses_repository.dart';
import '../../core/grades_repository.dart';
import '../../core/theme.dart';
import '../../shared/models/grade.dart';
import '../admissions/admission.dart';
import '../admissions/admissions_repository.dart';
import 'create_result_screen.dart';
import 'grade_group_screen.dart';

class _GradeGroup {
  _GradeGroup(this.semester, this.examType);
  final int semester;
  final String examType;
}

/// Mirrors GradesEntry (src/law-college-erp.jsx:4494): a faculty/exam-cell
/// picks a course then a student, sees that student's past results grouped
/// by semester + exam type, and can create a new one.
class GradesEntryScreen extends ConsumerStatefulWidget {
  const GradesEntryScreen({super.key});

  @override
  ConsumerState<GradesEntryScreen> createState() => _GradesEntryScreenState();
}

class _GradesEntryScreenState extends ConsumerState<GradesEntryScreen> {
  String? _courseId;
  String? _studentId;
  String? _studentsForCourse;

  @override
  Widget build(BuildContext context) {
    final coursesAsync = ref.watch(coursesProvider);
    final admissionsAsync = ref.watch(admissionsProvider);
    final gradesAsync = ref.watch(gradesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Enter Grades')),
      body: coursesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load courses: $error')),
        data: (courses) {
          if (courses.isEmpty) {
            return const Center(child: Text('No courses available.', style: TextStyle(color: AppColors.slate)));
          }
          _courseId ??= courses.first.id;
          final students = admissionsAsync.valueOrNull ?? const <Admission>[];
          final roster = students.where((s) => s.courseId == _courseId && s.status == AdmissionStatus.approved).toList();

          if (_courseId != _studentsForCourse) {
            _studentsForCourse = _courseId;
            _studentId = roster.isEmpty ? null : roster.first.id;
          }
          final student = roster.where((s) => s.id == _studentId).firstOrNull;

          final studentGrades = (gradesAsync.valueOrNull ?? const <Grade>[]).where((g) => g.studentId == _studentId).toList();
          final groups = <String, _GradeGroup>{};
          for (final g in studentGrades) {
            groups['${g.semester}__${g.examType}'] = _GradeGroup(g.semester, g.examType);
          }
          final sortedGroups = groups.values.toList()
            ..sort((a, b) => a.semester != b.semester ? a.semester.compareTo(b.semester) : a.examType.compareTo(b.examType));

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
                        items: [for (final c in courses) DropdownMenuItem(value: c.id, child: Text(c.name, overflow: TextOverflow.ellipsis))],
                        onChanged: (v) => setState(() => _courseId = v),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        value: _studentId,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Student Name'),
                        items: [
                          for (final s in roster)
                            DropdownMenuItem(value: s.id, child: Text('${s.name}${s.rollNo != null ? ' (${s.rollNo})' : ''}', overflow: TextOverflow.ellipsis)),
                        ],
                        onChanged: (v) => setState(() => _studentId = v),
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: roster.isEmpty
                    ? const Center(child: Text('No students in this course.', style: TextStyle(color: AppColors.slate)))
                    : sortedGroups.isEmpty
                        ? const Center(child: Text('No grades recorded yet.', style: TextStyle(color: AppColors.slate)))
                        : ListView.separated(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            itemCount: sortedGroups.length,
                            separatorBuilder: (_, __) => const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final grp = sortedGroups[index];
                              return ListTile(
                                title: Text('Semester ${grp.semester}', style: const TextStyle(fontWeight: FontWeight.w600)),
                                subtitle: Text(grp.examType),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => GradeGroupScreen(
                                      studentId: student!.id,
                                      studentName: student.name,
                                      semester: grp.semester,
                                      examType: grp.examType,
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
              ),
            ],
          );
        },
      ),
      floatingActionButton: _studentId == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () {
                final students = admissionsAsync.valueOrNull ?? const <Admission>[];
                final student = students.where((s) => s.id == _studentId).firstOrNull;
                if (student == null) return;
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => CreateResultScreen(studentId: student.id, studentName: student.name)),
                );
              },
              icon: const Icon(Icons.add),
              label: const Text('Create New Result'),
            ),
    );
  }
}
