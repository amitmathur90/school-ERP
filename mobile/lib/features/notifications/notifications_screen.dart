import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/messages_repository.dart';
import '../../core/theme.dart';

/// Mirrors the student "Notifications" / inbox page (law-college-erp.jsx
/// :4990-5008) — messages sent to this student by faculty/admin. Opening
/// this screen marks everything read, same as the web app.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await ref.read(messagesRepositoryProvider).markAllRead();
      ref.invalidate(messagesProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final messagesAsync = ref.watch(messagesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: messagesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load notifications: $error')),
        data: (messages) {
          if (messages.isEmpty) {
            return const Center(child: Text('No notifications yet.', style: TextStyle(color: AppColors.slate)));
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(messagesProvider),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: messages.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final m = messages[index];
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              m.fromRole == 'admin' ? 'Administrator' : 'Faculty',
                              style: const TextStyle(color: AppColors.gold, fontWeight: FontWeight.bold, fontSize: 11),
                            ),
                            Text(DateFormat('d MMM yyyy').format(m.date), style: const TextStyle(color: AppColors.slate, fontSize: 11.5)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(m.text, style: const TextStyle(fontSize: 13.5, height: 1.4)),
                        const SizedBox(height: 6),
                        Text('— ${m.fromName ?? ''}', style: const TextStyle(color: AppColors.slate, fontSize: 11.5)),
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
