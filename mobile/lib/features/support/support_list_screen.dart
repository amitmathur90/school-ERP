import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../admissions/admissions_repository.dart';
import 'support_repository.dart';
import 'ticket_thread_screen.dart';

const _statusMeta = {
  'open': (label: 'Open', icon: Icons.schedule, color: AppColors.warn, bg: AppColors.warnBg),
  'resolved': (label: 'Resolved', icon: Icons.check_circle, color: AppColors.success, bg: AppColors.successBg),
  'closed': (label: 'Closed', icon: Icons.cancel, color: AppColors.danger, bg: AppColors.dangerBg),
};

/// Mirrors SupportCenter (src/law-college-erp.jsx:2773): admins see every
/// ticket with status tabs; students see only their own and can open new ones.
class SupportListScreen extends ConsumerStatefulWidget {
  const SupportListScreen({super.key});

  @override
  ConsumerState<SupportListScreen> createState() => _SupportListScreenState();
}

class _SupportListScreenState extends ConsumerState<SupportListScreen> {
  String _filter = 'open';
  bool _busy = false;

  Future<void> _newTicket(bool isStudent) async {
    final subjectController = TextEditingController();
    final messageController = TextEditingController();

    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New Support Ticket'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: subjectController, decoration: const InputDecoration(labelText: 'Subject', hintText: 'e.g. Issue with fee payment')),
              const SizedBox(height: 12),
              TextField(
                controller: messageController,
                decoration: const InputDecoration(labelText: 'Message', hintText: 'Describe your issue in detail…'),
                maxLines: 4,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Open Ticket')),
        ],
      ),
    );
    if (submitted != true) return;
    if (subjectController.text.trim().isEmpty || messageController.text.trim().isEmpty) return;

    setState(() => _busy = true);
    try {
      final ticket = await ref.read(supportRepositoryProvider).createTicket(
            subject: subjectController.text.trim(),
            message: messageController.text.trim(),
          );
      ref.invalidate(supportTicketsProvider);
      if (mounted) {
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => TicketThreadScreen(ticketId: ticket.id, subject: ticket.subject)));
      }
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
    final ticketsAsync = ref.watch(supportTicketsProvider);
    final admissionsAsync = ref.watch(admissionsProvider);
    final session = ref.watch(sessionControllerProvider).value;
    final isStudent = session?.isStudent ?? false;
    final studentNames = {for (final s in admissionsAsync.valueOrNull ?? const []) s.id: s.name};

    return Scaffold(
      appBar: AppBar(title: const Text('Support')),
      floatingActionButton: isStudent
          ? FloatingActionButton.extended(
              onPressed: _busy ? null : () => _newTicket(true),
              icon: const Icon(Icons.add),
              label: const Text('New Ticket'),
            )
          : null,
      body: ticketsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load tickets: $error')),
        data: (all) {
          final counts = {for (final s in _statusMeta.keys) s: all.where((t) => t.status == s).length};
          final tickets = isStudent ? all : (_filter == 'all' ? all : all.where((t) => t.status == _filter).toList());

          return Column(
            children: [
              if (!isStudent)
                SizedBox(
                  height: 48,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    children: [
                      for (final f in ['open', 'resolved', 'closed', 'all'])
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(f == 'all' ? 'All' : '${_statusMeta[f]!.label} (${counts[f] ?? 0})'),
                            selected: _filter == f,
                            onSelected: (_) => setState(() => _filter = f),
                          ),
                        ),
                    ],
                  ),
                ),
              Expanded(
                child: tickets.isEmpty
                    ? Center(
                        child: Text(
                          isStudent ? "Need help? Open a new ticket and we'll get back to you." : 'No tickets.',
                          style: const TextStyle(color: AppColors.slate),
                          textAlign: TextAlign.center,
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: () async => ref.invalidate(supportTicketsProvider),
                        child: ListView.separated(
                          padding: const EdgeInsets.all(12),
                          itemCount: tickets.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final t = tickets[index];
                            final meta = _statusMeta[t.status] ?? _statusMeta['open']!;
                            final unread = isStudent ? t.studentUnread : t.adminUnread;
                            return Card(
                              child: ListTile(
                                title: Row(
                                  children: [
                                    if (unread) ...[
                                      Container(width: 7, height: 7, decoration: const BoxDecoration(color: AppColors.danger, shape: BoxShape.circle)),
                                      const SizedBox(width: 7),
                                    ],
                                    Expanded(child: Text(t.subject, style: const TextStyle(fontWeight: FontWeight.w600))),
                                  ],
                                ),
                                subtitle: Text(
                                  [
                                    if (!isStudent) studentNames[t.studentId] ?? '—',
                                    DateFormat('d MMM yyyy').format(t.updatedAt),
                                  ].join(' · '),
                                ),
                                trailing: Chip(
                                  avatar: Icon(meta.icon, size: 14, color: meta.color),
                                  label: Text(meta.label, style: TextStyle(color: meta.color, fontSize: 11)),
                                  backgroundColor: meta.bg,
                                  side: BorderSide.none,
                                  visualDensity: VisualDensity.compact,
                                ),
                                onTap: () => Navigator.of(context)
                                    .push(MaterialPageRoute(builder: (_) => TicketThreadScreen(ticketId: t.id, subject: t.subject)))
                                    .then((_) => ref.invalidate(supportTicketsProvider)),
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
