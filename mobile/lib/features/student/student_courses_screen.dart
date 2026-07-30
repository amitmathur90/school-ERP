import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/courses_repository.dart';
import '../../core/theme.dart';

final _inr = NumberFormat.decimalPattern('en_IN');

/// Mirrors the student "Courses Offered" page (law-college-erp.jsx
/// :4969-4988) — every course, with the student's own programme highlighted.
class StudentCoursesScreen extends ConsumerWidget {
  const StudentCoursesScreen({super.key, required this.myCourseId});
  final String? myCourseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coursesAsync = ref.watch(coursesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Classes Offered')),
      body: coursesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load courses: $error')),
        data: (courses) {
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(coursesProvider),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: courses.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final c = courses[index];
                final isMine = c.id == myCourseId;
                return Card(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: isMine ? const BorderSide(color: AppColors.gold, width: 2) : BorderSide.none,
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${c.code} · ${c.group ?? 'Primary'}${isMine ? ' · Your Class' : ''}',
                          style: TextStyle(color: isMine ? AppColors.gold : AppColors.slate, fontSize: 11, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Text(c.name, style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 20,
                          runSpacing: 8,
                          children: [
                            _Stat(label: 'Duration', value: c.duration ?? '—'),
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
