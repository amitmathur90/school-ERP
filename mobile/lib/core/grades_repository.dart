import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../shared/models/grade.dart';
import 'providers.dart';

class GradesRepository {
  GradesRepository(this._ref);
  final Ref _ref;

  Future<List<Grade>> fetchAll() async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/grades');
    final list = response.data as List;
    return list.map((e) => Grade.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Grade> create({
    required String studentId,
    required String subject,
    required String examType,
    required int semester,
    required num marks,
    required num maxMarks,
  }) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/grades', data: {
      'studentId': studentId,
      'subject': subject,
      'examType': examType,
      'semester': semester,
      'marks': marks,
      'maxMarks': maxMarks,
    });
    return Grade.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> delete(String id) async {
    final dio = _ref.read(apiClientProvider).dio;
    await dio.delete('/grades/$id');
  }
}

final gradesRepositoryProvider = Provider((ref) => GradesRepository(ref));

final gradesProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(gradesRepositoryProvider).fetchAll();
});
