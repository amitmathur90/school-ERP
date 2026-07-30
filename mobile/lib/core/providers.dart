import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/auth_repository.dart';
import '../shared/models/session.dart';
import 'api_client.dart';
import 'secure_storage.dart';

final secureStorageProvider = Provider((ref) => SecureStorage());

final apiClientProvider = Provider((ref) => ApiClient(ref.watch(secureStorageProvider)));

final authRepositoryProvider = Provider((ref) => AuthRepository(ref.watch(apiClientProvider)));

/// Holds the current session: `null` while unauthenticated, a [Session]
/// once logged in. Starts by trying to restore a previously stored token
/// (see build()), which the router watches to decide login vs. dashboard.
class SessionController extends AsyncNotifier<Session?> {
  @override
  Future<Session?> build() async {
    final token = await ref.read(secureStorageProvider).readToken();
    if (token == null) return null;
    return ref.read(authRepositoryProvider).restoreSession(token);
  }

  Future<void> login({
    required LoginBucket bucket,
    required String id,
    required String password,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final session = await ref.read(authRepositoryProvider).login(
            bucket: bucket,
            id: id,
            password: password,
          );
      await ref.read(secureStorageProvider).writeToken(session.token);
      return session;
    });
  }

  Future<void> logout() async {
    await ref.read(secureStorageProvider).clearToken();
    state = const AsyncData(null);
  }
}

final sessionControllerProvider = AsyncNotifierProvider<SessionController, Session?>(
  SessionController.new,
);
