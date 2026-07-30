import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../admissions/admission.dart';
import '../admissions/admissions_repository.dart';

final _phoneRe = RegExp(r'^[0-9]{10}$');

/// Mirrors StudentEditProfile (law-college-erp.jsx:5140) — self-service
/// contact-detail update and password change. The only two fields a
/// student may edit themselves; everything else on their record requires
/// the admissions office.
class StudentEditProfileScreen extends ConsumerStatefulWidget {
  const StudentEditProfileScreen({super.key, required this.student});
  final Admission student;

  @override
  ConsumerState<StudentEditProfileScreen> createState() => _StudentEditProfileScreenState();
}

class _StudentEditProfileScreenState extends ConsumerState<StudentEditProfileScreen> {
  late final _phoneController = TextEditingController(text: widget.student.phone ?? '');
  late final _emergencyController = TextEditingController(text: widget.student.emergencyMobile ?? '');
  late final _addressController = TextEditingController(text: widget.student.permanentAddress ?? '');

  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  bool _savingContact = false;
  String? _contactError;
  String? _contactSuccess;

  bool _savingPassword = false;
  String? _passwordError;
  String? _passwordSuccess;

  @override
  void dispose() {
    _phoneController.dispose();
    _emergencyController.dispose();
    _addressController.dispose();
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _saveContact() async {
    final phone = _phoneController.text.trim();
    final emergency = _emergencyController.text.trim();
    final address = _addressController.text.trim();

    if (!_phoneRe.hasMatch(phone)) {
      setState(() {
        _contactError = 'Phone number must be exactly 10 digits.';
        _contactSuccess = null;
      });
      return;
    }
    if (address.isEmpty) {
      setState(() {
        _contactError = 'Address cannot be empty.';
        _contactSuccess = null;
      });
      return;
    }
    if (!_phoneRe.hasMatch(emergency)) {
      setState(() {
        _contactError = 'Emergency mobile must be exactly 10 digits.';
        _contactSuccess = null;
      });
      return;
    }

    setState(() {
      _savingContact = true;
      _contactError = null;
      _contactSuccess = null;
    });
    try {
      await ref.read(admissionsRepositoryProvider).updateProfile(widget.student.id, {
        'phone': phone,
        'emergencyMobile': emergency,
        'permanentAddress': address,
      });
      ref.invalidate(admissionsProvider);
      if (mounted) setState(() => _contactSuccess = 'Contact details updated successfully.');
    } catch (e) {
      if (mounted) setState(() => _contactError = describeApiError(e));
    } finally {
      if (mounted) setState(() => _savingContact = false);
    }
  }

  Future<void> _savePassword() async {
    final current = _currentPasswordController.text;
    final next = _newPasswordController.text;
    final confirm = _confirmPasswordController.text;

    if (next.length < 6) {
      setState(() {
        _passwordError = 'New password must be at least 6 characters.';
        _passwordSuccess = null;
      });
      return;
    }
    if (next != confirm) {
      setState(() {
        _passwordError = 'New password and confirmation do not match.';
        _passwordSuccess = null;
      });
      return;
    }

    setState(() {
      _savingPassword = true;
      _passwordError = null;
      _passwordSuccess = null;
    });
    try {
      await ref.read(authRepositoryProvider).changePassword(
            role: 'student',
            id: widget.student.id,
            currentPassword: current,
            newPassword: next,
          );
      _currentPasswordController.clear();
      _newPasswordController.clear();
      _confirmPasswordController.clear();
      if (mounted) setState(() => _passwordSuccess = 'Password changed successfully.');
    } catch (e) {
      if (mounted) setState(() => _passwordError = describeApiError(e));
    } finally {
      if (mounted) setState(() => _savingPassword = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit Profile')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Contact Details', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 12),
                  _Banner(error: _contactError, success: _contactSuccess),
                  TextField(
                    controller: _phoneController,
                    keyboardType: TextInputType.phone,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
                    decoration: const InputDecoration(labelText: 'Phone Number'),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _emergencyController,
                    keyboardType: TextInputType.phone,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
                    decoration: const InputDecoration(labelText: 'Emergency Mobile No.'),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _addressController,
                    maxLines: 3,
                    decoration: const InputDecoration(labelText: 'Permanent Address'),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _savingContact ? null : _saveContact,
                    child: _savingContact
                        ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Save Contact Details'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Reset Password', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 12),
                  _Banner(error: _passwordError, success: _passwordSuccess),
                  TextField(
                    controller: _currentPasswordController,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'Current Password'),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _newPasswordController,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: 'New Password'),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _confirmPasswordController,
                    obscureText: true,
                    onSubmitted: (_) => _savePassword(),
                    decoration: const InputDecoration(labelText: 'Confirm New Password'),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _savingPassword ? null : _savePassword,
                    child: _savingPassword
                        ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Update Password'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({this.error, this.success});
  final String? error;
  final String? success;

  @override
  Widget build(BuildContext context) {
    final text = error ?? success;
    if (text == null) return const SizedBox.shrink();
    final isError = error != null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: isError ? AppColors.dangerBg : AppColors.successBg,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(text, style: TextStyle(color: isError ? AppColors.danger : AppColors.success, fontWeight: FontWeight.w600)),
      ),
    );
  }
}
