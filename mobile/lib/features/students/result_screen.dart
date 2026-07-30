import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/courses_repository.dart';
import '../../core/grades_repository.dart';
import '../../core/theme.dart';
import '../../shared/models/course.dart';
import '../../shared/models/grade.dart';
import '../admissions/admissions_repository.dart';

/// Mirrors ResultCard (src/law-college-erp.jsx:794): a student's grades,
/// filterable by semester and exam type, with a totals row.
class ResultScreen extends ConsumerStatefulWidget {
  const ResultScreen({super.key, required this.studentId});
  final String studentId;

  @override
  ConsumerState<ResultScreen> createState() => _ResultScreenState();
}

class _ResultScreenState extends ConsumerState<ResultScreen> {
  int? _semesterFilter;
  String? _examTypeFilter;

  @override
  Widget build(BuildContext context) {
    final admissionsAsync = ref.watch(admissionsProvider);
    final coursesAsync = ref.watch(coursesProvider);
    final gradesAsync = ref.watch(gradesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Result Card')),
      body: admissionsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load: $error')),
        data: (all) {
          final student = all.where((a) => a.id == widget.studentId).firstOrNull;
          if (student == null) return const Center(child: Text('Student not found.'));
          final courses = coursesAsync.valueOrNull ?? const <Course>[];
          final course = courses.where((c) => c.id == student.courseId).firstOrNull;
          final allGrades = (gradesAsync.valueOrNull ?? const <Grade>[]).where((g) => g.studentId == student.id).toList();

          final semesters = allGrades.map((g) => g.semester).toSet().toList()..sort();
          final examTypes = allGrades.map((g) => g.examType).where((e) => e.isNotEmpty).toSet().toList()..sort();

          final filtered = allGrades
              .where((g) => _semesterFilter == null || g.semester == _semesterFilter)
              .where((g) => _examTypeFilter == null || g.examType == _examTypeFilter)
              .toList();
          final totalObtained = filtered.fold<num>(0, (sum, g) => sum + g.marks);
          final totalMax = filtered.fold<num>(0, (sum, g) => sum + g.maxMarks);
          final overallPct = totalMax == 0 ? null : (totalObtained / totalMax * 100);

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 28,
                        backgroundColor: AppColors.goldLight,
                        child: Text(
                          student.name.isNotEmpty ? student.name[0].toUpperCase() : '?',
                          style: const TextStyle(color: AppColors.maroon, fontWeight: FontWeight.bold, fontSize: 22),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(student.name, style: Theme.of(context).textTheme.titleLarge),
                            Text(
                              [if (student.rollNo != null) 'Roll No. ${student.rollNo}', course?.name ?? '—'].join(' · '),
                              style: const TextStyle(color: AppColors.slate),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              if (semesters.length > 1 || examTypes.length > 1)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        if (semesters.length > 1)
                          Expanded(
                            child: DropdownButtonFormField<int?>(
                              value: _semesterFilter,
                              isDense: true,
                              isExpanded: true,
                              decoration: const InputDecoration(labelText: 'Semester'),
                              items: [
                                const DropdownMenuItem(value: null, child: Text('All Semesters', overflow: TextOverflow.ellipsis)),
                                for (final s in semesters)
                                  DropdownMenuItem(value: s, child: Text('Semester $s', overflow: TextOverflow.ellipsis)),
                              ],
                              onChanged: (v) => setState(() => _semesterFilter = v),
                            ),
                          ),
                        if (semesters.length > 1 && examTypes.length > 1) const SizedBox(width: 12),
                        if (examTypes.length > 1)
                          Expanded(
                            child: DropdownButtonFormField<String?>(
                              value: _examTypeFilter,
                              isDense: true,
                              isExpanded: true,
                              decoration: const InputDecoration(labelText: 'Exam Type'),
                              items: [
                                const DropdownMenuItem(value: null, child: Text('All Exam Types', overflow: TextOverflow.ellipsis)),
                                for (final t in examTypes) DropdownMenuItem(value: t, child: Text(t, overflow: TextOverflow.ellipsis)),
                              ],
                              onChanged: (v) => setState(() => _examTypeFilter = v),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              Card(
                child: filtered.isEmpty
                    ? const Padding(
                        padding: EdgeInsets.all(24),
                        child: Center(child: Text('No results published yet.', style: TextStyle(color: AppColors.slate))),
                      )
                    : Padding(
                        padding: const EdgeInsets.all(16),
                        child: SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: DataTable(
                            headingRowHeight: 36,
                            dataRowMinHeight: 36,
                            dataRowMaxHeight: 48,
                            columns: const [
                              DataColumn(label: Text('Sem')),
                              DataColumn(label: Text('Subject')),
                              DataColumn(label: Text('Exam Type')),
                              DataColumn(label: Text('Marks'), numeric: true),
                              DataColumn(label: Text('Max'), numeric: true),
                              DataColumn(label: Text('%'), numeric: true),
                            ],
                            rows: [
                              for (final g in filtered)
                                DataRow(cells: [
                                  DataCell(Text('${g.semester}')),
                                  DataCell(Text(g.subject)),
                                  DataCell(Text(g.examType)),
                                  DataCell(Text('${g.marks}')),
                                  DataCell(Text('${g.maxMarks}')),
                                  DataCell(Text(g.percentage == null ? '—' : '${g.percentage!.toStringAsFixed(1)}%')),
                                ]),
                            ],
                          ),
                        ),
                      ),
              ),
              if (filtered.isNotEmpty) ...[
                const SizedBox(height: 12),
                Card(
                  color: AppColors.parchment,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Total', style: TextStyle(fontWeight: FontWeight.bold)),
                        Text(
                          '$totalObtained / $totalMax'
                          '${overallPct == null ? '' : ' (${overallPct.toStringAsFixed(1)}%)'}',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
