import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/fees_repository.dart';
import '../../core/providers.dart';
import '../../core/teachers_repository.dart';
import '../../core/theme.dart';
import '../admissions/admission.dart';
import '../admissions/admissions_list.dart';
import '../admissions/admissions_repository.dart';
import '../fees/fees_list_screen.dart';
import '../notices/notices_list.dart';
import '../students/students_list_screen.dart';
import '../teachers/teachers_list_screen.dart';
import '../../shared/widgets/stat_card.dart';

final _inr = NumberFormat.decimalPattern('en_IN');

/// Mirrors AdminPortal's "overview" page (src/law-college-erp.jsx:1986-2007):
/// four stat cards (tap-through to the underlying module) plus Recent Notices.
class OverviewScreen extends ConsumerWidget {
  const OverviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final admissionsAsync = ref.watch(admissionsProvider);
    final teachersAsync = ref.watch(teachersProvider);
    final feesAsync = ref.watch(feesProvider);
    final session = ref.watch(sessionControllerProvider).value;

    final students = admissionsAsync.valueOrNull ?? const <Admission>[];
    final enrolled = students.where((s) => s.status == AdmissionStatus.approved).length;
    final pending = students.where((s) => s.status == AdmissionStatus.pending).length;
    final facultyCount = teachersAsync.valueOrNull?.length ?? 0;
    final totalCollected = (feesAsync.valueOrNull ?? const []).fold<num>(0, (sum, f) => sum + f.paid);

    void open(Widget screen, String module) {
      if (session?.hasModule(module) != true) return;
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Institution Overview')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(admissionsProvider);
          ref.invalidate(teachersProvider);
          ref.invalidate(feesProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.25,
              children: [
                StatCard(
                  icon: Icons.school,
                  value: admissionsAsync.isLoading ? '—' : '$enrolled',
                  label: 'Enrolled Students',
                  onTap: () => open(const StudentsListScreen(), 'students'),
                ),
                StatCard(
                  icon: Icons.schedule,
                  value: admissionsAsync.isLoading ? '—' : '$pending',
                  label: 'Pending Admissions',
                  accent: AppColors.warn,
                  onTap: () => open(const AdmissionsListScreen(), 'admissions'),
                ),
                StatCard(
                  icon: Icons.people,
                  value: teachersAsync.isLoading ? '—' : '$facultyCount',
                  label: 'Faculty Members',
                  onTap: () => open(const TeachersListScreen(), 'teachers'),
                ),
                StatCard(
                  icon: Icons.account_balance_wallet,
                  value: feesAsync.isLoading ? '—' : '₹${_inr.format(totalCollected)}',
                  label: 'Fees Collected',
                  accent: AppColors.success,
                  onTap: () => open(const FeesListScreen(), 'fees'),
                ),
              ],
            ),
            const SizedBox(height: 20),
            Text('Recent Notices', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            const Card(child: NoticesList()),
          ],
        ),
      ),
    );
  }
}
