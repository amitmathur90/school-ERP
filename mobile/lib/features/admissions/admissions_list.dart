import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/courses_repository.dart';
import '../../core/theme.dart';
import '../../shared/models/course.dart';
import 'admission.dart';
import 'admission_detail_screen.dart';
import 'admissions_repository.dart';

/// Mirrors AdmissionsRegistry (src/law-college-erp.jsx): status tabs with
/// live counts, a course filter, and a name/email/phone search box, all
/// applied client-side over the full student list (the API has no
/// server-side filtering — see AdmissionsRepository.fetchAll).
class AdmissionsListScreen extends ConsumerStatefulWidget {
  const AdmissionsListScreen({super.key});

  @override
  ConsumerState<AdmissionsListScreen> createState() => _AdmissionsListScreenState();
}

class _AdmissionsListScreenState extends ConsumerState<AdmissionsListScreen> {
  AdmissionStatus _tab = AdmissionStatus.pending;
  String? _courseId;
  final _searchController = TextEditingController();
  String _search = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  static const _statusMeta = {
    AdmissionStatus.pending: (label: 'Pending Review', icon: Icons.schedule, color: AppColors.warn, bg: AppColors.warnBg),
    AdmissionStatus.approved: (label: 'Approved', icon: Icons.check_circle, color: AppColors.success, bg: AppColors.successBg),
    AdmissionStatus.rejected: (label: 'Rejected', icon: Icons.cancel, color: AppColors.danger, bg: AppColors.dangerBg),
    AdmissionStatus.draft: (label: 'Draft', icon: Icons.edit_note, color: AppColors.slate, bg: AppColors.parchment),
  };

  @override
  Widget build(BuildContext context) {
    final admissionsAsync = ref.watch(admissionsProvider);
    final coursesAsync = ref.watch(coursesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Admissions')),
      body: admissionsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _ErrorState(error: error, onRetry: () => ref.invalidate(admissionsProvider)),
        data: (all) {
          final courses = coursesAsync.valueOrNull ?? const <Course>[];
          final courseNames = {for (final c in courses) c.id: c.name};

          final counts = <AdmissionStatus, int>{
            for (final s in [AdmissionStatus.pending, AdmissionStatus.approved, AdmissionStatus.rejected])
              s: all.where((a) => a.status == s).length,
          };

          var filtered = all.where((a) => a.status == _tab).toList();
          if (_courseId != null) {
            filtered = filtered.where((a) => a.courseId == _courseId).toList();
          }
          if (_search.trim().isNotEmpty) {
            final q = _search.trim().toLowerCase();
            filtered = filtered.where((a) {
              return a.name.toLowerCase().contains(q) ||
                  (a.email ?? '').toLowerCase().contains(q) ||
                  a.contactPhone.toLowerCase().contains(q);
            }).toList();
          }

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                child: SegmentedButton<AdmissionStatus>(
                  segments: [
                    for (final s in [AdmissionStatus.pending, AdmissionStatus.approved, AdmissionStatus.rejected])
                      ButtonSegment(value: s, label: Text('${_statusMeta[s]!.label} (${counts[s] ?? 0})')),
                  ],
                  selected: {_tab},
                  onSelectionChanged: (s) => setState(() => _tab = s.first),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        decoration: const InputDecoration(
                          isDense: true,
                          prefixIcon: Icon(Icons.search),
                          hintText: 'Search name, email, phone',
                        ),
                        onChanged: (v) => setState(() => _search = v),
                      ),
                    ),
                    const SizedBox(width: 8),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 130),
                      child: DropdownButton<String?>(
                        value: _courseId,
                        hint: const Text('Course'),
                        isExpanded: true,
                        underline: const SizedBox.shrink(),
                        items: [
                          const DropdownMenuItem(value: null, child: Text('All Courses', overflow: TextOverflow.ellipsis)),
                          for (final c in courses)
                            DropdownMenuItem(value: c.id, child: Text(c.name, overflow: TextOverflow.ellipsis)),
                        ],
                        onChanged: (v) => setState(() => _courseId = v),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: filtered.isEmpty
                    ? Center(
                        child: Text('No ${_statusMeta[_tab]!.label.toLowerCase()} applications.', style: const TextStyle(color: AppColors.slate)),
                      )
                    : RefreshIndicator(
                        onRefresh: () async => ref.invalidate(admissionsProvider),
                        child: ListView.separated(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          itemCount: filtered.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final a = filtered[index];
                            final meta = _statusMeta[a.status]!;
                            return ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: CircleAvatar(
                                backgroundColor: AppColors.goldLight,
                                child: Text(
                                  a.name.isNotEmpty ? a.name[0].toUpperCase() : '?',
                                  style: const TextStyle(color: AppColors.maroon, fontWeight: FontWeight.bold),
                                ),
                              ),
                              title: Text(a.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                              subtitle: Text(
                                [
                                  courseNames[a.courseId] ?? a.courseId ?? 'No course',
                                  if (a.appliedAt != null) DateFormat('d MMM yyyy').format(a.appliedAt!),
                                ].join(' · '),
                              ),
                              trailing: Chip(
                                avatar: Icon(meta.icon, size: 16, color: meta.color),
                                label: Text(a.rollNo ?? meta.label, style: TextStyle(color: meta.color, fontSize: 12)),
                                backgroundColor: meta.bg,
                                side: BorderSide.none,
                              ),
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute(builder: (_) => AdmissionDetailScreen(admissionId: a.id)),
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

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: AppColors.danger, size: 32),
            const SizedBox(height: 8),
            Text('Could not load admissions: $error', textAlign: TextAlign.center),
            const SizedBox(height: 8),
            TextButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
