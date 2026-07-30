import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Wraps flutter_secure_storage (Android Keystore-backed) for the JWT
/// issued by POST /api/auth/login. Never store this token in
/// SharedPreferences — it grants real access to student/staff records.
class SecureStorage {
  static const _tokenKey = 'erp_jwt_token';
  final _storage = const FlutterSecureStorage();

  Future<void> writeToken(String token) => _storage.write(key: _tokenKey, value: token);

  Future<String?> readToken() => _storage.read(key: _tokenKey);

  Future<void> clearToken() => _storage.delete(key: _tokenKey);
}
