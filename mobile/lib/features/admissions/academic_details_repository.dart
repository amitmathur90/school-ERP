import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'academic_detail.dart';

class AcademicDetailsRepository {
  AcademicDetailsRepository(this._ref);
  final Ref _ref;

  Future<List<AcademicDetail>> fetchAll() async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/academic-details');
    final list = response.data as List;
    return list.map((e) => AcademicDetail.fromJson(e as Map<String, dynamic>)).toList();
  }
}

final academicDetailsRepositoryProvider = Provider((ref) => AcademicDetailsRepository(ref));

final academicDetailsProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(academicDetailsRepositoryProvider).fetchAll();
});
