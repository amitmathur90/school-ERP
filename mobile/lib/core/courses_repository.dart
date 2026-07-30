import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../shared/models/course.dart';
import 'providers.dart';

class CoursesRepository {
  CoursesRepository(this._ref);
  final Ref _ref;

  Future<List<Course>> fetchAll() async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/courses');
    final list = response.data as List;
    return list.map((e) => Course.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Course> create(Map<String, dynamic> fields) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/courses', data: fields);
    return Course.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> delete(String id) async {
    final dio = _ref.read(apiClientProvider).dio;
    await dio.delete('/courses/$id');
  }
}

final coursesRepositoryProvider = Provider((ref) => CoursesRepository(ref));

final coursesProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(coursesRepositoryProvider).fetchAll();
});
