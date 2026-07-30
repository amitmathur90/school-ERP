import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/teachers_repository.dart';
import '../../core/theme.dart';
import '../../shared/models/teacher.dart';

/// Mirrors the Add/Edit Staff Member modal in FacultyDirectory
/// (src/law-college-erp.jsx:3161-3209). Employee ID is always
/// server-generated (see server/routes/teachers.js) so it's never editable.
class TeacherFormScreen extends ConsumerStatefulWidget {
  const TeacherFormScreen({super.key, this.teacher});
  final Teacher? teacher;

  @override
  ConsumerState<TeacherFormScreen> createState() => _TeacherFormScreenState();
}

class _TeacherFormScreenState extends ConsumerState<TeacherFormScreen> {
  late final _name = TextEditingController(text: widget.teacher?.name);
  late final _email = TextEditingController(text: widget.teacher?.email);
  late final _password = TextEditingController();
  late final _phone = TextEditingController(text: widget.teacher?.phone);
  late final _qualification = TextEditingController(text: widget.teacher?.qualification);
  late final _experience = TextEditingController(text: widget.teacher?.experience);
  late final _address = TextEditingController(text: widget.teacher?.address);
  late final _department = TextEditingController(text: widget.teacher?.department);
  late final _designation = TextEditingController(text: widget.teacher?.designation);
  late final _subject = TextEditingController(text: widget.teacher?.subject);

  late String _gender = widget.teacher?.gender ?? 'Male';
  late String _role = widget.teacher?.role ?? 'faculty';
  late String _status = widget.teacher?.status ?? 'active';
  bool _busy = false;
  String? _error;

  bool get _editing => widget.teacher != null;

  @override
  void dispose() {
    for (final c in [_name, _email, _password, _phone, _qualification, _experience, _address, _department, _designation, _subject]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (_name.text.trim().isEmpty ||
        _email.text.trim().isEmpty ||
        (!_editing && _password.text.isEmpty) ||
        _department.text.trim().isEmpty ||
        _designation.text.trim().isEmpty) {
      setState(() => _error = 'Please complete all required fields.');
      return;
    }
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(_email.text.trim())) {
      setState(() => _error = 'Please enter a valid email address.');
      return;
    }
    if (!_editing && _password.text.length < 6) {
      setState(() => _error = 'Password must be at least 6 characters.');
      return;
    }

    final fields = {
      'name': _name.text.trim(),
      'email': _email.text.trim().toLowerCase(),
      'phone': _phone.text.trim(),
      'gender': _gender,
      'qualification': _qualification.text.trim(),
      'experience': _experience.text.trim(),
      'address': _address.text.trim(),
      'department': _department.text.trim(),
      'designation': _designation.text.trim(),
      'role': _role,
      'subject': _subject.text.trim(),
      'status': _status,
      if (!_editing) 'password': _password.text,
    };

    setState(() => _busy = true);
    try {
      if (_editing) {
        await ref.read(teachersRepositoryProvider).update(widget.teacher!.id, fields);
      } else {
        await ref.read(teachersRepositoryProvider).create(fields);
      }
      ref.invalidate(teachersProvider);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => _error = describeApiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_editing ? 'Edit Staff Member' : 'Add Staff Member')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppColors.dangerBg, borderRadius: BorderRadius.circular(4)),
              child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ),
            const SizedBox(height: 14),
          ],
          Text('Personal Details', style: Theme.of(context).textTheme.labelLarge?.copyWith(color: AppColors.gold)),
          const SizedBox(height: 10),
          TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name *')),
          const SizedBox(height: 12),
          TextField(
            controller: _email,
            enabled: !_editing,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email / Username *'),
          ),
          const SizedBox(height: 12),
          TextField(controller: _phone, decoration: const InputDecoration(labelText: 'Mobile')),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _gender,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Gender'),
            items: const [
              DropdownMenuItem(value: 'Male', child: Text('Male')),
              DropdownMenuItem(value: 'Female', child: Text('Female')),
              DropdownMenuItem(value: 'Transgender', child: Text('Transgender')),
            ],
            onChanged: (v) => setState(() => _gender = v!),
          ),
          const SizedBox(height: 12),
          TextField(controller: _qualification, decoration: const InputDecoration(labelText: 'Qualification', hintText: 'e.g. B.Ed, M.Ed')),
          const SizedBox(height: 12),
          TextField(controller: _experience, decoration: const InputDecoration(labelText: 'Experience', hintText: 'e.g. 8 years')),
          const SizedBox(height: 12),
          TextField(controller: _address, decoration: const InputDecoration(labelText: 'Address'), maxLines: 2),
          const SizedBox(height: 20),
          Text('Professional Details', style: Theme.of(context).textTheme.labelLarge?.copyWith(color: AppColors.gold)),
          const SizedBox(height: 10),
          TextField(controller: _department, decoration: const InputDecoration(labelText: 'Department *', hintText: 'e.g. Law')),
          const SizedBox(height: 12),
          TextField(controller: _designation, decoration: const InputDecoration(labelText: 'Designation *', hintText: 'e.g. Associate Professor')),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _role,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Role *'),
            items: [for (final r in staffRoles) DropdownMenuItem(value: r.$1, child: Text(r.$2, overflow: TextOverflow.ellipsis))],
            onChanged: (v) => setState(() => _role = v!),
          ),
          const SizedBox(height: 12),
          TextField(controller: _subject, decoration: const InputDecoration(labelText: 'Subject', hintText: 'For teaching faculty')),
          const SizedBox(height: 12),
          if (!_editing) ...[
            TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Password *')),
            const SizedBox(height: 12),
          ],
          DropdownButtonFormField<String>(
            value: _status,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Status'),
            items: const [
              DropdownMenuItem(value: 'active', child: Text('Active')),
              DropdownMenuItem(value: 'inactive', child: Text('Inactive')),
            ],
            onChanged: (v) => setState(() => _status = v!),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Save'),
          ),
        ],
      ),
    );
  }
}
