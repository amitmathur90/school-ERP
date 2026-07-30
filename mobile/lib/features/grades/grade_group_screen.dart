import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/grades_repository.dart';
import '../../core/theme.dart';
import '../../shared/models/grade.dart';

/// Mirrors the "View Result" modal inside GradesEntry
/// (src/law-college-erp.jsx:4568): one semester+exam-type group of a
/// student's subjects, with a running total and per-row delete.
class GradeGroupScreen extends ConsumerStatefulWidget {
  const GradeGroupScreen({
    super.key,
    required this.studentId,
    required this.studentName,
    required this.semester,
    required this.examType,
  });
  final String studentId;
  final String studentName;
  final int semester;
  final String examType;

  @override
  ConsumerState<GradeGroupScreen> createState() => _GradeGroupScreenState();
}

class _GradeGroupScreenState extends ConsumerState<GradeGroupScreen> {
  bool _busy = false;

  Future<void> _delete(Grade g) async {
    setState(() => _busy = true);
    try {
      await ref.read(gradesRepositoryProvider).delete(g.id);
      ref.invalidate(gradesProvider);
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
    final gradesAsync = ref.watch(gradesProvider);
    final subjects = (gradesAsync.valueOrNull ?? const <Grade>[])
        .where((g) => g.studentId == widget.studentId && g.semester == widget.semester && g.examType == widget.examType)
        .toList();

    final totalObtained = subjects.fold<num>(0, (sum, g) => sum + g.marks);
    final totalMax = subjects.fold<num>(0, (sum, g) => sum + g.maxMarks);
    final overallPct = totalMax == 0 ? null : (totalObtained / totalMax * 100);

    return Scaffold(
      appBar: AppBar(title: Text('Semester ${widget.semester} · ${widget.examType}')),
      body: subjects.isEmpty
          ? const Center(child: Text('No subjects left in this result.', style: TextStyle(color: AppColors.slate)))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(widget.studentName, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 12),
                Card(
                  child: Column(
                    children: [
                      for (final g in subjects)
                        ListTile(
                          title: Text(g.subject),
                          subtitle: Text('${g.marks} / ${g.maxMarks}${g.percentage == null ? '' : ' · ${g.percentage!.toStringAsFixed(1)}%'}'),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete_outline, color: AppColors.danger),
                            onPressed: _busy ? null : () => _delete(g),
                          ),
                        ),
                    ],
                  ),
                ),
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
                          '$totalObtained / $totalMax${overallPct == null ? '' : ' (${overallPct.toStringAsFixed(1)}%)'}',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
