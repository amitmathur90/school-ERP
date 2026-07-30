import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/attendance_repository.dart';
import '../../core/theme.dart';

/// Mirrors the student "Attendance Record" page (law-college-erp.jsx
/// :4774-4789) — this student's own attendance history, newest first.
class StudentAttendanceScreen extends ConsumerWidget {
  const StudentAttendanceScreen({super.key, required this.studentId});
  final String studentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final attendanceAsync = ref.watch(attendanceProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Attendance Record')),
      body: attendanceAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load attendance: $error')),
        data: (all) {
          final mine = all.where((r) => r.studentId == studentId).toList().reversed.toList();
          if (mine.isEmpty) {
            return const Center(
              child: Text('No attendance recorded yet.', style: TextStyle(color: AppColors.slate)),
            );
          }
          final presentCount = mine.where((r) => r.isPresent).length;
          final pct = (presentCount / mine.length * 100).round();

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(attendanceProvider),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  color: pct < 75 ? AppColors.dangerBg : AppColors.successBg,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Overall Attendance', style: TextStyle(fontWeight: FontWeight.w600)),
                        Text(
                          '$pct%',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: pct < 75 ? AppColors.danger : AppColors.success),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Card(
                  child: Column(
                    children: [
                      for (final r in mine)
                        ListTile(
                          title: Text(r.subject.isEmpty ? '—' : r.subject),
                          subtitle: Text(DateFormat('d MMM yyyy').format(DateTime.tryParse(r.date) ?? DateTime.now())),
                          trailing: Text(
                            r.status,
                            style: TextStyle(fontWeight: FontWeight.bold, color: r.isPresent ? AppColors.success : AppColors.danger),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
