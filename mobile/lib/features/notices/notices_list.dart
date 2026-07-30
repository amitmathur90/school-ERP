import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/theme.dart';
import 'notices_repository.dart';

class NoticesList extends ConsumerWidget {
  const NoticesList({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final noticesAsync = ref.watch(noticesProvider);

    return noticesAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (error, _) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const Icon(Icons.error_outline, color: AppColors.danger),
            const SizedBox(height: 8),
            Text('Could not load notices: $error', textAlign: TextAlign.center),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => ref.invalidate(noticesProvider),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
      data: (notices) {
        if (notices.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(24),
            child: Text('No notices yet.', style: TextStyle(color: AppColors.slate)),
          );
        }
        return ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(vertical: 4),
          itemCount: notices.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, index) {
            final notice = notices[index];
            return ListTile(
              title: Text(notice.title, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text(notice.content, maxLines: 2, overflow: TextOverflow.ellipsis),
              trailing: Text(
                DateFormat('d MMM').format(notice.date),
                style: const TextStyle(color: AppColors.slate, fontSize: 12),
              ),
            );
          },
        );
      },
    );
  }
}
