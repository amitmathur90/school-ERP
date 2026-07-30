import 'package:flutter/material.dart';

import '../../../core/theme.dart';

/// Shown after AdmissionApplyScreen.submitFinal succeeds — mirrors the web
/// wizard's post-submit state (a confirmation email was sent, status is now
/// "pending" review) and sends the applicant back to Login, prefilled with
/// the email they just registered with.
class AdmissionApplySuccessScreen extends StatelessWidget {
  const AdmissionApplySuccessScreen({super.key, required this.email});
  final String email;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.parchment,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.check_circle, color: AppColors.success, size: 64),
                const SizedBox(height: 20),
                Text('Application Submitted', style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
                const SizedBox(height: 12),
                Text(
                  'Thank you — your admission application has been received and is now pending review. A confirmation email has been sent to $email.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.slate),
                ),
                const SizedBox(height: 8),
                const Text(
                  "You can sign in any time with the email and password you set to check your application's status.",
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.slate, fontSize: 12.5),
                ),
                const SizedBox(height: 28),
                FilledButton(
                  onPressed: () => Navigator.of(context).popUntil((route) => route.isFirst),
                  child: const Text('Back to Sign In'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
