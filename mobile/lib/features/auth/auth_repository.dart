import 'package:dio/dio.dart';

import '../../core/api_client.dart';
import '../../shared/models/session.dart';

/// The login "bucket" tapped on the login screen — POST /api/auth/login's
/// `role` field. The actual business role that comes back in the response
/// (e.g. hod/hr/accounts/exam_incharge/faculty for the "teacher" bucket)
/// can be more specific than this; see Session.role.
enum LoginBucket { admin, teacher, student }

extension on LoginBucket {
  String get wireValue => switch (this) {
        LoginBucket.admin => 'admin',
        LoginBucket.teacher => 'teacher',
        LoginBucket.student => 'student',
      };
}

class AuthRepository {
  AuthRepository(this._api);

  final ApiClient _api;

  Future<Session> login({
    required LoginBucket bucket,
    required String id,
    required String password,
  }) async {
    final response = await _api.dio.post(
      '/auth/login',
      data: {'role': bucket.wireValue, 'id': id, 'password': password},
    );
    return Session.fromLoginJson(response.data as Map<String, dynamic>);
  }

  /// Re-validates a stored token on app launch and refreshes permissions
  /// (in case Super Admin changed them since the token was issued).
  Future<Session?> restoreSession(String token) async {
    try {
      final response = await _api.dio.get('/auth/me');
      return Session.fromMeJson(token, response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) return null;
      rethrow;
    }
  }

  /// Self-service password change (law-college-erp.jsx StudentEditProfile
  /// .savePassword / server/routes/auth.js POST /change-password).
  Future<void> changePassword({
    required String role,
    required String id,
    required String currentPassword,
    required String newPassword,
  }) async {
    await _api.dio.post(
      '/auth/change-password',
      data: {'role': role, 'id': id, 'currentPassword': currentPassword, 'newPassword': newPassword},
    );
  }
}

/// Surfaces the server's own error message (e.g. "Invalid administrator
/// credentials.") instead of a generic Dio error, so the login screen can
/// show something the user actually understands.
String describeAuthError(Object error) => describeApiError(error);
