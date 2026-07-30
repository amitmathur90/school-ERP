import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/fees_repository.dart';
import '../../core/providers.dart';
import '../../core/teachers_repository.dart';
import '../../core/theme.dart';
import '../../shared/widgets/stat_card.dart';
import '../admissions/admission.dart';
import '../admissions/admissions_list.dart';
import '../admissions/admissions_repository.dart';
import '../attendance/attendance_marking_screen.dart';
import '../courses/courses_screen.dart';
import '../faculty/faculty_home_screen.dart';
import '../fees/fees_list_screen.dart';
import '../grades/grades_entry_screen.dart';
import '../notices/notices_list.dart';
import '../notices/notices_repository.dart';
import '../notices/notices_screen.dart';
import '../overview/overview_screen.dart';
import '../reports/reports_screen.dart';
import '../student/student_home_screen.dart';
import '../students/students_list_screen.dart';
import '../support/support_list_screen.dart';
import '../teachers/teachers_list_screen.dart';
import '../../shared/models/session.dart';

/// Modules with a real screen built out so far. Everything else in
/// session.permissions still renders as a disabled drawer entry until its
/// module is built — see the phased rollout tracked against the Flutter
/// plan (ALL_MODULES in src/law-college-erp.jsx).
const _moduleScreens = <String, WidgetBuilder>{
  'overview': _openOverview,
  'admissions': _openAdmissions,
  'students': _openStudents,
  'teachers': _openTeachers,
  'courses': _openCourses,
  'fees': _openFees,
  'reports': _openReports,
  'notices': _openNotices,
  'attendance': _openAttendance,
  'support': _openSupport,
  'grades': _openGrades,
};

const _moduleIcons = <String, IconData>{
  'overview': Icons.dashboard_outlined,
  'admissions': Icons.person_add_alt_outlined,
  'students': Icons.school_outlined,
  'teachers': Icons.groups_outlined,
  'courses': Icons.menu_book_outlined,
  'fees': Icons.account_balance_wallet_outlined,
  'reports': Icons.insert_chart_outlined,
  'notices': Icons.campaign_outlined,
  'attendance': Icons.fact_check_outlined,
  'support': Icons.support_agent_outlined,
  'grades': Icons.grade_outlined,
  'hr': Icons.badge_outlined,
  'settings': Icons.lock_outline,
};

const _moduleLabels = <String, String>{
  'overview': 'Overview',
  'admissions': 'Admissions Registry',
  'students': 'Students',
  'teachers': 'Faculty & Staff',
  'courses': 'Courses',
  'fees': 'Fees',
  'reports': 'Reports',
  'notices': 'Notices',
  'attendance': 'Attendance',
  'support': 'Support',
  'grades': 'Grades',
  'hr': 'HR',
  'settings': 'Staff Accounts',
};

const _roleLabels = {
  'super_admin': 'Super Admin',
  'admin': 'Admin',
  'hr': 'HR',
  'accounts': 'Accounts',
  'exam_incharge': 'Examination Incharge',
  'hod': 'Head of Department',
  'faculty': 'Faculty',
  'student': 'Student',
};

Widget _openOverview(BuildContext context) => const OverviewScreen();
Widget _openAdmissions(BuildContext context) => const AdmissionsListScreen();
Widget _openStudents(BuildContext context) => const StudentsListScreen();
Widget _openTeachers(BuildContext context) => const TeachersListScreen();
Widget _openCourses(BuildContext context) => const CoursesScreen();
Widget _openFees(BuildContext context) => const FeesListScreen();
Widget _openReports(BuildContext context) => const ReportsScreen();
Widget _openNotices(BuildContext context) => const NoticesScreen();
Widget _openAttendance(BuildContext context) => const AttendanceMarkingScreen();
Widget _openSupport(BuildContext context) => const SupportListScreen();
Widget _openGrades(BuildContext context) => const GradesEntryScreen();

final _inr = NumberFormat.decimalPattern('en_IN');

/// The app's home screen: gradient header, at-a-glance stat cards, quick
/// actions and Recent Notices, with a slide-out drawer for full navigation
/// and a bottom bar of shortcuts — restyled to match the purple/teal
/// field-force-CRM reference the app owner asked to match visually.
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  void _open(BuildContext context, WidgetRef ref, String module) {
    final session = ref.read(sessionControllerProvider).value;
    final builder = _moduleScreens[module];
    if (builder == null || session?.hasModule(module) != true) return;
    Navigator.of(context).push(MaterialPageRoute(builder: builder));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider).value;
    if (session == null) return const SizedBox.shrink();
    if (session.isStudent) return const StudentHomeScreen();
    if (session.role == 'faculty') return const FacultyHomeScreen();

    final admissionsAsync = ref.watch(admissionsProvider);
    final teachersAsync = ref.watch(teachersProvider);
    final feesAsync = ref.watch(feesProvider);
    final students = admissionsAsync.valueOrNull ?? const <Admission>[];
    final enrolled = students.where((s) => s.status == AdmissionStatus.approved).length;
    final pending = students.where((s) => s.status == AdmissionStatus.pending).length;
    final facultyCount = teachersAsync.valueOrNull?.length ?? 0;
    final totalCollected = (feesAsync.valueOrNull ?? const []).fold<num>(0, (sum, f) => sum + f.paid);

    return Scaffold(
      backgroundColor: AppColors.parchment,
      drawer: _AppDrawer(session: session, onOpen: (m) => _open(context, ref, m)),
      bottomNavigationBar: _BottomNav(onOpen: (m) => _open(context, ref, m)),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(admissionsProvider);
          ref.invalidate(teachersProvider);
          ref.invalidate(feesProvider);
          ref.invalidate(noticesProvider);
        },
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(child: _Header(session: session)),
            SliverPadding(
              padding: const EdgeInsets.all(16),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  if (session.hasModule('students') || session.hasModule('admissions') || session.hasModule('teachers') || session.hasModule('fees')) ...[
                    Text("Today's Overview", style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 10),
                    GridView.count(
                      crossAxisCount: 2,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 1.25,
                      children: [
                        if (session.hasModule('students'))
                          StatCard(
                            icon: Icons.school,
                            value: admissionsAsync.isLoading ? '—' : '$enrolled',
                            label: 'Enrolled Students',
                            onTap: () => _open(context, ref, 'students'),
                          ),
                        if (session.hasModule('admissions'))
                          StatCard(
                            icon: Icons.schedule,
                            value: admissionsAsync.isLoading ? '—' : '$pending',
                            label: 'Pending Admissions',
                            accent: AppColors.warn,
                            onTap: () => _open(context, ref, 'admissions'),
                          ),
                        if (session.hasModule('teachers'))
                          StatCard(
                            icon: Icons.people,
                            value: teachersAsync.isLoading ? '—' : '$facultyCount',
                            label: 'Faculty Members',
                            onTap: () => _open(context, ref, 'teachers'),
                          ),
                        if (session.hasModule('fees'))
                          StatCard(
                            icon: Icons.account_balance_wallet,
                            value: feesAsync.isLoading ? '—' : '₹${_inr.format(totalCollected)}',
                            label: 'Fees Collected',
                            accent: AppColors.success,
                            onTap: () => _open(context, ref, 'fees'),
                          ),
                      ],
                    ),
                    const SizedBox(height: 20),
                  ],
                  if (session.hasModule('notices') || session.hasModule('attendance')) ...[
                    Text('Quick Actions', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        if (session.hasModule('notices'))
                          Expanded(
                            child: _QuickAction(
                              icon: Icons.campaign_outlined,
                              label: 'Post Notice',
                              onTap: () => _open(context, ref, 'notices'),
                            ),
                          ),
                        if (session.hasModule('notices') && session.hasModule('attendance')) const SizedBox(width: 12),
                        if (session.hasModule('attendance'))
                          Expanded(
                            child: _QuickAction(
                              icon: Icons.fact_check_outlined,
                              label: 'Mark Attendance',
                              onTap: () => _open(context, ref, 'attendance'),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 20),
                  ],
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

class _Header extends ConsumerWidget {
  const _Header({required this.session});
  final Session session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
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
                  'SPVM Law College ERP',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 17),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (session.hasModule('notices'))
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
          Text(
            _roleLabels[session.role] ?? session.role,
            style: const TextStyle(color: AppColors.goldLight, fontWeight: FontWeight.w600),
          ),
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

class _AppDrawer extends ConsumerWidget {
  const _AppDrawer({required this.session, required this.onOpen});
  final Session session;
  final void Function(String module) onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
                Text(
                  _roleLabels[session.role] ?? session.role,
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          for (final m in session.permissions)
            ListTile(
              leading: Icon(_moduleIcons[m] ?? Icons.circle_outlined, color: _moduleScreens.containsKey(m) ? AppColors.maroon : AppColors.slate),
              title: Text(_moduleLabels[m] ?? m),
              enabled: _moduleScreens.containsKey(m),
              trailing: _moduleScreens.containsKey(m) ? null : const Text('Soon', style: TextStyle(color: AppColors.slate, fontSize: 11)),
              onTap: () {
                Navigator.of(context).pop();
                onOpen(m);
              },
            ),
        ],
      ),
    );
  }
}

class _BottomNav extends ConsumerWidget {
  const _BottomNav({required this.onOpen});
  final void Function(String module) onOpen;

  static const _preferred = ['overview', 'admissions', 'students', 'fees', 'notices'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider).value;
    if (session == null) return const SizedBox.shrink();
    final items = _preferred.where((m) => m == 'overview' || session.hasModule(m)).take(5).toList();
    if (items.length < 2) return const SizedBox.shrink();

    return BottomNavigationBar(
      type: BottomNavigationBarType.fixed,
      currentIndex: 0,
      selectedItemColor: AppColors.maroon,
      unselectedItemColor: AppColors.slate,
      selectedFontSize: 11,
      unselectedFontSize: 11,
      onTap: (i) {
        if (items[i] == 'overview') return;
        onOpen(items[i]);
      },
      items: [
        for (final m in items)
          BottomNavigationBarItem(
            icon: Icon(m == 'overview' ? Icons.home_outlined : _moduleIcons[m]),
            label: m == 'overview' ? 'Home' : (_moduleLabels[m] ?? m).split(' ').first,
          ),
      ],
    );
  }
}
