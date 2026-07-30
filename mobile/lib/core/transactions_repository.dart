import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../shared/models/transaction.dart';
import 'providers.dart';

class TransactionsRepository {
  TransactionsRepository(this._ref);
  final Ref _ref;

  Future<List<PaymentTransaction>> fetchAll() async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/transactions');
    final list = response.data as List;
    return list.map((e) => PaymentTransaction.fromJson(e as Map<String, dynamic>)).toList();
  }
}

final transactionsRepositoryProvider = Provider((ref) => TransactionsRepository(ref));

final transactionsProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(transactionsRepositoryProvider).fetchAll();
});
