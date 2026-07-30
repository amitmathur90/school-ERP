import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../shared/models/attendance_record.dart';
import 'providers.dart';

class AttendanceRepository {
  AttendanceRepository(this._ref);
  final Ref _ref;

  Future<List<AttendanceRecord>> fetchAll() async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/attendance');
    final list = response.data as List;
    return list.map((e) => AttendanceRecord.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> mark({required String date, required String subject, required Map<String, String> marks}) async {
    final dio = _ref.read(apiClientProvider).dio;
    await dio.post('/attendance/mark', data: {'date': date, 'subject': subject, 'marks': marks});
  }
}

final attendanceRepositoryProvider = Provider((ref) => AttendanceRepository(ref));

final attendanceProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(attendanceRepositoryProvider).fetchAll();
});
