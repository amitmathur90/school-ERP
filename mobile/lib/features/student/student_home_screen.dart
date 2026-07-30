import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/attendance_repository.dart';
import '../../core/courses_repository.dart';
import '../../core/fees_repository.dart';
import '../../core/messages_repository.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../shared/models/session.dart';
import '../../shared/widgets/stat_card.dart';
import '../admissions/admission.dart';
import '../admissions/admission_detail_screen.dart';
import '../admissions/admissions_repository.dart';
import '../notices/notices_list.dart';
import '../notices/notices_screen.dart';
import '../notifications/notifications_screen.dart';
import '../students/result_screen.dart';
import '../support/support_list_screen.dart';
import 'student_attendance_screen.dart';
import 'student_courses_screen.dart';
import 'student_edit_profile_screen.dart';
import 'student_fees_screen.dart';

/// The whole student experience: a draft applicant sees a "finish your
/// application on the web" note, a pending/rejected applicant sees a status
/// screen (mirroring PendingOrRejectedScreen), and an approved student gets
/// the full portal (mirroring StudentPortal, law-college-erp.jsx:4629).
class StudentHomeScreen extends ConsumerWidget {
  const StudentHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider).value;
    final admissionsAsync = ref.watch(admissionsProvider);

    if (session == null) return const SizedBox.shrink();

    return admissionsAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (error, _) => Scaffold(
        appBar: AppBar(title: const Text('SPVM Law College ERP')),
        body: Center(child: Text('Could not load your record: $error')),
      ),
      data: (all) {
        final me = all.where((a) => a.id == session.id).firstOrNull;
        if (me == null) {
          return Scaffold(
            appBar: AppBar(title: const Text('SPVM Law College ERP')),
            body: const Center(child: Text('Your student record could not be found.')),
          );
        }
        if (me.status == AdmissionStatus.draft) return _DraftScreen(session: session);
        if (me.status != AdmissionStatus.approved) return _PendingOrRejectedScreen(student: me);
        return _ApprovedStudentHome(student: me);
      },
    );
  }
}

class _DraftScreen extends ConsumerWidget {
  const _DraftScreen({required this.session});
  final Session session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Application In Progress')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.edit_note, size: 56, color: AppColors.gold),
              const SizedBox(height: 16),
              const Text(
                "You've started an admission application but haven't submitted it yet.",
                textAlign: TextAlign.center,
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              const Text(
                'Please finish and submit your application on the SPVM Law College website to continue.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.slate),
              ),
              const SizedBox(height: 20),
              OutlinedButton(
                onPressed: () => ref.read(sessionControllerProvider.notifier).logout(),
                child: const Text('Sign Out'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PendingOrRejectedScreen extends ConsumerWidget {
  const _PendingOrRejectedScreen({required this.student});
  final Admission student;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isPending = student.status == AdmissionStatus.pending;
    return Scaffold(
      appBar: AppBar(title: const Text('SPVM Law College ERP')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                isPending ? Icons.schedule : Icons.cancel_outlined,
                size: 56,
                color: isPending ? AppColors.warn : AppColors.danger,
              ),
              const SizedBox(height: 16),
              Text(
                isPending ? 'Application Under Review' : 'Application Not Approved',
                style: Theme.of(context).textTheme.titleLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                isPending
                    ? "Thank you for applying, ${student.name}. The admissions office is reviewing your application. You'll gain full portal access once approved."
                    : 'Your application was not approved${student.rejectReason != null && student.rejectReason!.isNotEmpty ? ": ${student.rejectReason}" : "."} Please contact the admissions office for details.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.slate),
              ),
              const SizedBox(height: 24),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  OutlinedButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => AdmissionDetailScreen(admissionId: student.id)),
                    ),
                    child: const Text('View My Application'),
                  ),
                  const SizedBox(width: 12),
                  TextButton(
                    onPressed: () => ref.read(sessionControllerProvider.notifier).logout(),
                    child: const Text('Sign Out'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ApprovedStudentHome extends ConsumerWidget {
  const _ApprovedStudentHome({required this.student});
  final Admission student;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coursesAsync = ref.watch(coursesProvider);
    final attendanceAsync = ref.watch(attendanceProvider);
    final feesAsync = ref.watch(feesProvider);
    final messagesAsync = ref.watch(messagesProvider);

    final course = (coursesAsync.valueOrNull ?? const []).where((c) => c.id == student.courseId).firstOrNull;
    final myAttendance = (attendanceAsync.valueOrNull ?? const []).where((r) => r.studentId == student.id).toList();
    final pct = myAttendance.isEmpty ? null : (myAttendance.where((r) => r.isPresent).length / myAttendance.length * 100).round();
    final myFee = (feesAsync.valueOrNull ?? const []).where((f) => f.studentId == student.id).firstOrNull;
    final unreadCount = (messagesAsync.valueOrNull ?? const []).where((m) => !m.isRead).length;

    return Scaffold(
      backgroundColor: AppColors.parchment,
      drawer: _StudentDrawer(student: student),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(coursesProvider);
          ref.invalidate(attendanceProvider);
          ref.invalidate(feesProvider);
          ref.invalidate(messagesProvider);
          ref.invalidate(admissionsProvider);
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
                            'SPVM Law College ERP',
                            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 17),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        IconButton(
                          icon: Badge(
                            isLabelVisible: unreadCount > 0,
                            label: Text('$unreadCount'),
                            child: const Icon(Icons.notifications_none, color: Colors.white),
                          ),
                          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NotificationsScreen())),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Welcome, ${student.name.split(' ').first}',
                      style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                    ),
                    Text(
                      student.rollNo ?? 'Student',
                      style: const TextStyle(color: AppColors.goldLight, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.all(16),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  if (myFee == null || myFee.paid == 0)
                    Card(
                      color: AppColors.warnBg,
                      child: ListTile(
                        leading: const Icon(Icons.schedule, color: AppColors.warn),
                        title: const Text('Payment Pending', style: TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: const Text("You haven't made any fee payment yet."),
                        trailing: TextButton(
                          onPressed: () => Navigator.of(context).push(
                            MaterialPageRoute(builder: (_) => StudentFeesScreen(studentId: student.id, studentName: student.name)),
                          ),
                          child: const Text('View'),
                        ),
                      ),
                    ),
                  const SizedBox(height: 12),
                  GridView.count(
                    crossAxisCount: 3,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 0.72,
                    children: [
                      StatCard(
                        icon: Icons.menu_book,
                        value: course?.name ?? '—',
                        label: 'Programme',
                        valueFontSize: 13,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => StudentCoursesScreen(myCourseId: student.courseId)),
                        ),
                      ),
                      StatCard(
                        icon: Icons.fact_check_outlined,
                        value: pct == null ? '—' : '$pct%',
                        label: 'Attendance',
                        accent: pct != null && pct < 75 ? AppColors.danger : AppColors.success,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => StudentAttendanceScreen(studentId: student.id)),
                        ),
                      ),
                      StatCard(
                        icon: Icons.account_balance_wallet,
                        value: myFee != null ? '₹${NumberFormat.decimalPattern('en_IN').format(myFee.balance)}' : '—',
                        label: 'Fee Balance',
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => StudentFeesScreen(studentId: student.id, studentName: student.name)),
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

class _StudentDrawer extends ConsumerWidget {
  const _StudentDrawer({required this.student});
  final Admission student;

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
                        student.name.isNotEmpty ? student.name[0].toUpperCase() : '?',
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
                Text(student.name, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                Text(student.rollNo ?? 'Student', style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          const SizedBox(height: 8),
          item(Icons.description_outlined, 'My Application', AdmissionDetailScreen(admissionId: student.id)),
          item(Icons.person_outline, 'Edit Profile', StudentEditProfileScreen(student: student)),
          item(Icons.fact_check_outlined, 'Attendance', StudentAttendanceScreen(studentId: student.id)),
          item(Icons.grade_outlined, 'Grades', ResultScreen(studentId: student.id)),
          item(Icons.account_balance_wallet_outlined, 'Fees & Payments', StudentFeesScreen(studentId: student.id, studentName: student.name)),
          item(Icons.menu_book_outlined, 'Courses', StudentCoursesScreen(myCourseId: student.courseId)),
          item(Icons.notifications_outlined, 'Notifications', const NotificationsScreen()),
          item(Icons.campaign_outlined, 'Notice Board', const NoticesScreen()),
          item(Icons.support_agent_outlined, 'Support', const SupportListScreen()),
        ],
      ),
    );
  }
}
