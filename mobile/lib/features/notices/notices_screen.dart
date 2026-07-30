import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import 'notice.dart';
import 'notices_repository.dart';

/// Mirrors NoticesBoard (src/law-college-erp.jsx:3514): full announcement
/// board with post (admin/hod/faculty) and delete (admin only, matching
/// AdminPortal's canDelete vs TeacherPortal's canDelete={false}).
class NoticesScreen extends ConsumerStatefulWidget {
  const NoticesScreen({super.key});

  @override
  ConsumerState<NoticesScreen> createState() => _NoticesScreenState();
}

class _NoticesScreenState extends ConsumerState<NoticesScreen> {
  bool _busy = false;

  Future<void> _postNotice() async {
    final session = ref.read(sessionControllerProvider).value;
    if (session == null) return;
    final titleController = TextEditingController();
    final contentController = TextEditingController();

    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Post a Notice'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: titleController, decoration: const InputDecoration(labelText: 'Title'), autofocus: true),
              const SizedBox(height: 12),
              TextField(controller: contentController, decoration: const InputDecoration(labelText: 'Content'), maxLines: 4),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Publish')),
        ],
      ),
    );
    if (submitted != true) return;
    if (titleController.text.trim().isEmpty || contentController.text.trim().isEmpty) return;

    setState(() => _busy = true);
    try {
      await ref.read(noticesRepositoryProvider).create(
            title: titleController.text.trim(),
            content: contentController.text.trim(),
            postedByName: session.name,
            postedByRole: session.isAdmin ? 'admin' : 'teacher',
          );
      ref.invalidate(noticesProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deleteNotice(Notice notice) async {
    setState(() => _busy = true);
    try {
      await ref.read(noticesRepositoryProvider).delete(notice.id);
      ref.invalidate(noticesProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _viewNotice(Notice notice) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(notice.title),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '${DateFormat('d MMM yyyy, h:mm a').format(notice.date)} · ${notice.postedByRole == 'admin' ? 'Administrator' : 'Faculty'} ${notice.postedByName}',
                style: const TextStyle(color: AppColors.slate, fontSize: 12),
              ),
              const SizedBox(height: 12),
              Text(notice.content),
            ],
          ),
        ),
        actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Close'))],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final noticesAsync = ref.watch(noticesProvider);
    final session = ref.watch(sessionControllerProvider).value;
    final canPost = session != null && (session.isAdmin || session.role == 'hod' || session.role == 'faculty');
    final canDelete = session?.isAdmin ?? false;

    return Scaffold(
      appBar: AppBar(title: const Text('Notice Board')),
      floatingActionButton: canPost
          ? FloatingActionButton.extended(
              onPressed: _busy ? null : _postNotice,
              icon: const Icon(Icons.add),
              label: const Text('Post Notice'),
            )
          : null,
      body: noticesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load notices: $error')),
        data: (notices) {
          if (notices.isEmpty) {
            return const Center(child: Text('No notices posted.', style: TextStyle(color: AppColors.slate)));
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(noticesProvider),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: notices.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final n = notices[index];
                return Card(
                  child: InkWell(
                    onTap: () => _viewNotice(n),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(n.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15.5)),
                                const SizedBox(height: 4),
                                Text(
                                  '${DateFormat('d MMM').format(n.date)} · ${n.postedByRole == 'admin' ? 'Administrator' : 'Faculty'} ${n.postedByName}',
                                  style: const TextStyle(color: AppColors.slate, fontSize: 11.5),
                                ),
                              ],
                            ),
                          ),
                          if (canDelete)
                            IconButton(
                              icon: const Icon(Icons.delete_outline, size: 20, color: AppColors.danger),
                              onPressed: _busy ? null : () => _deleteNotice(n),
                            ),
                        ],
                      ),
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
