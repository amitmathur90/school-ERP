import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'notice.dart';

class NoticesRepository {
  NoticesRepository(this._ref);
  final Ref _ref;

  Future<List<Notice>> fetchAll() async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/notices');
    final list = response.data as List;
    return list.map((e) => Notice.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Notice> create({required String title, required String content, required String postedByName, required String postedByRole}) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/notices', data: {
      'title': title,
      'content': content,
      'date': DateTime.now().toIso8601String(),
      'postedByName': postedByName,
      'postedByRole': postedByRole,
    });
    return Notice.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> delete(String id) async {
    final dio = _ref.read(apiClientProvider).dio;
    await dio.delete('/notices/$id');
  }
}

final noticesRepositoryProvider = Provider((ref) => NoticesRepository(ref));

final noticesProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(noticesRepositoryProvider).fetchAll();
});
