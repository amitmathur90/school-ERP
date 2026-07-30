import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'admission.dart';

class AdmissionsRepository {
  AdmissionsRepository(this._ref);
  final Ref _ref;

  Future<List<Admission>> fetchAll() async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/students');
    final list = response.data as List;
    return list.map((e) => Admission.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Admission> approve(String id) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.patch('/students/$id/approve');
    return Admission.fromJson(response.data as Map<String, dynamic>);
  }

  Future<Admission> reject(String id, String reason) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.patch('/students/$id/reject', data: {'reason': reason});
    return Admission.fromJson(response.data as Map<String, dynamic>);
  }

  /// Returns `{ ok, email, tempPassword }` — the plaintext temp password is
  /// shown once so an admin can hand it to the student if the email doesn't
  /// arrive right away (server/routes/students.js reset-password route).
  Future<Map<String, dynamic>> resetPassword(String id) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.patch('/students/$id/reset-password');
    return response.data as Map<String, dynamic>;
  }

  /// Generic edit — used here for a student's own self-service contact
  /// update (law-college-erp.jsx StudentEditProfile.saveContact).
  Future<Admission> updateProfile(String id, Map<String, dynamic> patch) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.patch('/students/$id', data: patch);
    return Admission.fromJson(response.data as Map<String, dynamic>);
  }
}

final admissionsRepositoryProvider = Provider((ref) => AdmissionsRepository(ref));

final admissionsProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(admissionsRepositoryProvider).fetchAll();
});
