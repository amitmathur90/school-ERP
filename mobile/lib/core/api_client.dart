import 'dart:io' show Platform;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

import 'secure_storage.dart';

/// Base URL for the existing Express API (server/routes/*.js).
///
/// - Android emulator can't reach the host machine via `localhost` — it
///   must use the special alias `10.0.2.2`, which Android's emulator maps
///   back to the host's `localhost`.
/// - A physical Android phone on the same Wi-Fi can't use `localhost` or
///   `10.0.2.2` either — it needs the host PC's actual LAN IP address
///   (e.g. `http://192.168.1.23:4000/api`). Update [_lanOverride] once you
///   know that IP, or switch this to your deployed Render URL for
///   production.
const String? _lanOverride = 'http://127.0.0.1:4000/api'; // physical device reaches this over USB via `adb reverse tcp:4000 tcp:4000`

String get apiBaseUrl {
  final override = _lanOverride;
  if (override != null) return override;
  if (kIsWeb) return 'http://localhost:4000/api';
  if (Platform.isAndroid) return 'http://10.0.2.2:4000/api';
  return 'http://localhost:4000/api';
}

class ApiClient {
  ApiClient(this._storage) {
    _dio = Dio(
      BaseOptions(
        baseUrl: apiBaseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
      ),
    );
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _storage.readToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          // 401 = missing/invalid/expired JWT (server/authMiddleware.js).
          // Drop the stored token so SessionController's next check sends
          // the user back to the login screen; the DioException still
          // propagates to the caller as normal.
          if (error.response?.statusCode == 401) {
            await _storage.clearToken();
          }
          handler.next(error);
        },
      ),
    );
  }

  final SecureStorage _storage;
  late final Dio _dio;

  Dio get dio => _dio;
}

/// Surfaces the server's own `{ error: "..." }` message instead of a raw
/// DioException, so screens can show something the user understands.
String describeApiError(Object error) {
  if (error is DioException) {
    final data = error.response?.data;
    if (data is Map && data['error'] is String) return data['error'] as String;
    if (error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout) {
      return "Can't reach the server. Check your connection and the server address.";
    }
  }
  return 'Something went wrong. Please try again.';
}
