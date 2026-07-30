import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../shared/models/teacher.dart';
import 'providers.dart';

class TeachersRepository {
  TeachersRepository(this._ref);
  final Ref _ref;

  Future<List<Teacher>> fetchAll() async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/teachers');
    final list = response.data as List;
    return list.map((e) => Teacher.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Teacher> create(Map<String, dynamic> fields) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/teachers', data: fields);
    return Teacher.fromJson(response.data as Map<String, dynamic>);
  }

  Future<Teacher> update(String id, Map<String, dynamic> fields) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.patch('/teachers/$id', data: fields);
    return Teacher.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> delete(String id) async {
    final dio = _ref.read(apiClientProvider).dio;
    await dio.delete('/teachers/$id');
  }
}

final teachersRepositoryProvider = Provider((ref) => TeachersRepository(ref));

final teachersProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(teachersRepositoryProvider).fetchAll();
});
