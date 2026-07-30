import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/login_screen.dart';
import '../features/auth/splash_screen.dart';
import '../features/dashboard/dashboard_screen.dart';
import 'providers.dart';

/// A ChangeNotifier that ticks whenever sessionControllerProvider's state
/// changes, so go_router's `redirect` re-runs after login/logout/session
/// restore (not just on navigation events).
class _SessionRefreshNotifier extends ChangeNotifier {
  void ping() => notifyListeners();
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _SessionRefreshNotifier();
  ref.listen(sessionControllerProvider, (previous, next) => refresh.ping());
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (context, state) {
      final sessionState = ref.read(sessionControllerProvider);
      final isLoggedIn = sessionState.value != null;
      final atSplash = state.matchedLocation == '/splash';
      final atLogin = state.matchedLocation == '/login';

      if (sessionState.isLoading) return atSplash ? null : '/splash';
      if (!isLoggedIn) return atLogin ? null : '/login';
      return atLogin || atSplash ? '/dashboard' : null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const SplashScreen()),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/dashboard', builder: (context, state) => const DashboardScreen()),
    ],
  );
});
