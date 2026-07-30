import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// Shown briefly on launch while SessionController tries to restore a
/// previously stored token (GET /api/auth/me) before the router decides
/// between /login and /dashboard.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppColors.parchment,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: AppColors.maroon),
            SizedBox(height: 16),
            Text('SPVM Law College ERP', style: TextStyle(color: AppColors.ink)),
          ],
        ),
      ),
    );
  }
}
