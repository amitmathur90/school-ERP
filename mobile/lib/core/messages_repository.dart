import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../shared/models/message.dart';
import 'providers.dart';

class MessagesRepository {
  MessagesRepository(this._ref);
  final Ref _ref;

  Future<List<AppMessage>> fetchAll() async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/messages');
    final list = response.data as List;
    return list.map((e) => AppMessage.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> markAllRead() async {
    final dio = _ref.read(apiClientProvider).dio;
    await dio.patch('/messages/mark-all-read');
  }
}

final messagesRepositoryProvider = Provider((ref) => MessagesRepository(ref));

final messagesProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(messagesRepositoryProvider).fetchAll();
});
