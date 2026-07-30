import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/teachers_repository.dart';
import '../../core/theme.dart';
import '../../shared/models/session.dart';
import '../../shared/widgets/stat_card.dart';
import '../admissions/admission.dart';
import '../admissions/admissions_repository.dart';
import '../attendance/attendance_marking_screen.dart';
import '../fees/fees_list_screen.dart';
import '../grades/grades_entry_screen.dart';
import '../library/library_browse_screen.dart';
import '../notices/notices_list.dart';
import '../notices/notices_repository.dart';
import '../notices/notices_screen.dart';
import '../students/students_list_screen.dart';

/// Mirrors TeacherPortal (src/law-college-erp.jsx:4042): a faculty member's
/// own dashboard — their subject, the student body, notices posted, and a
/// profile card — separate from the generic permission-gated admin
/// dashboard since a faculty login only ever has a handful of modules.
class FacultyHomeScreen extends ConsumerWidget {
  const FacultyHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider).value;
    final teachersAsync = ref.watch(teachersProvider);
    final admissionsAsync = ref.watch(admissionsProvider);
    final noticesAsync = ref.watch(noticesProvider);

    if (session == null) return const SizedBox.shrink();

    final me = (teachersAsync.valueOrNull ?? const []).where((t) => t.id == session.id).firstOrNull;
    final approvedStudents = (admissionsAsync.valueOrNull ?? const <Admission>[]).where((s) => s.status == AdmissionStatus.approved).length;
    final noticesCount = noticesAsync.valueOrNull?.length ?? 0;

    return Scaffold(
      backgroundColor: AppColors.parchment,
      drawer: _FacultyDrawer(session: session),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(teachersProvider);
          ref.invalidate(admissionsProvider);
          ref.invalidate(noticesProvider);
        },
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Container(
                padding: EdgeInsets.fromLTRB(16, MediaQuery.of(context).padding.top + 12, 16, 28),
                decoration: const BoxDecoration(gradient: AppColors.gradient),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Builder(
                          builder: (context) => IconButton(
                            icon: const Icon(Icons.menu, color: Colors.white),
                            onPressed: () => Scaffold.of(context).openDrawer(),
                          ),
                        ),
                        const Expanded(
                          child: Text(
                            'School ERP',
                            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 17),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.notifications_none, color: Colors.white),
                          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NoticesScreen())),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Welcome, ${session.name}',
                      style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                    ),
                    const Text('Faculty', style: TextStyle(color: AppColors.goldLight, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.all(16),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  GridView.count(
                    crossAxisCount: 3,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 0.72,
                    children: [
                      StatCard(icon: Icons.menu_book, value: me?.subject ?? '—', label: 'Subject', valueFontSize: 14),
                      StatCard(
                        icon: Icons.school,
                        value: '$approvedStudents',
                        label: 'Total Students',
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const StudentsListScreen())),
                      ),
                      StatCard(
                        icon: Icons.campaign_outlined,
                        value: '$noticesCount',
                        label: 'Notices Posted',
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NoticesScreen())),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Text('Profile', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 10),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _ProfileRow(label: 'Email', value: me?.email ?? '—'),
                          _ProfileRow(label: 'Department', value: me?.department ?? '—'),
                          _ProfileRow(label: 'Phone', value: me?.phone ?? '—'),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text('Quick Actions', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: _QuickAction(
                          icon: Icons.fact_check_outlined,
                          label: 'Mark Attendance',
                          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AttendanceMarkingScreen())),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _QuickAction(
                          icon: Icons.grade_outlined,
                          label: 'Enter Grades',
                          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const GradesEntryScreen())),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Text('Recent Notices', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 10),
                  const Card(child: NoticesList()),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 100, child: Text(label, style: const TextStyle(color: AppColors.slate, fontSize: 13))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5))),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 12),
          child: Column(
            children: [
              Icon(icon, color: AppColors.maroon),
              const SizedBox(height: 8),
              Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5), textAlign: TextAlign.center),
            ],
          ),
        ),
      ),
    );
  }
}

class _FacultyDrawer extends ConsumerWidget {
  const _FacultyDrawer({required this.session});
  final Session session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    Widget item(IconData icon, String label, Widget screen) {
      return ListTile(
        leading: Icon(icon, color: AppColors.maroon),
        title: Text(label),
        onTap: () {
          Navigator.of(context).pop();
          Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
        },
      );
    }

    return Drawer(
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          Container(
            padding: EdgeInsets.fromLTRB(20, MediaQuery.of(context).padding.top + 20, 20, 20),
            decoration: const BoxDecoration(gradient: AppColors.navyTealGradient),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: Colors.white,
                      child: Text(
                        session.name.isNotEmpty ? session.name[0].toUpperCase() : '?',
                        style: const TextStyle(color: AppColors.maroon, fontWeight: FontWeight.bold, fontSize: 22),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.logout, color: Colors.white),
                      tooltip: 'Sign out',
                      onPressed: () => ref.read(sessionControllerProvider.notifier).logout(),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(session.name, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                const Text('Faculty', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          const SizedBox(height: 8),
          item(Icons.school_outlined, 'My Students', const StudentsListScreen()),
          item(Icons.fact_check_outlined, 'Attendance', const AttendanceMarkingScreen()),
          item(Icons.grade_outlined, 'Grades', const GradesEntryScreen()),
          item(Icons.account_balance_wallet_outlined, 'Fees', const FeesListScreen()),
          item(Icons.campaign_outlined, 'Notices', const NoticesScreen()),
          item(Icons.local_library_outlined, 'Library', const LibraryBrowseScreen(isStudent: false)),
        ],
      ),
    );
  }
}
