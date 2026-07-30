import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../shared/models/fee.dart';
import 'providers.dart';

class FeesRepository {
  FeesRepository(this._ref);
  final Ref _ref;

  Future<List<Fee>> fetchAll() async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/fees');
    final list = response.data as List;
    return list.map((e) => Fee.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Fee> updatePaid(String studentId, {required num paid, String? dueDate}) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.patch('/fees/$studentId', data: {'paid': paid, if (dueDate != null) 'dueDate': dueDate});
    return Fee.fromJson(response.data as Map<String, dynamic>);
  }
}

final feesRepositoryProvider = Provider((ref) => FeesRepository(ref));

final feesProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(feesRepositoryProvider).fetchAll();
});
