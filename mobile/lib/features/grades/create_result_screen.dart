import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/grades_repository.dart';
import '../../core/theme.dart';

const examTypes = ['Unit Test', 'Mid-Term', 'Final Exam', 'Class Test', 'Annual Exam'];

class _SubjectRow {
  _SubjectRow();
  final subject = TextEditingController();
  final marks = TextEditingController();
  final maxMarks = TextEditingController(text: '100');
}

/// Mirrors CreateResultModal (src/law-college-erp.jsx:4428): one exam
/// type + semester, with one or more subject/marks rows saved as
/// individual grade records for the selected student.
class CreateResultScreen extends ConsumerStatefulWidget {
  const CreateResultScreen({super.key, required this.studentId, required this.studentName});
  final String studentId;
  final String studentName;

  @override
  ConsumerState<CreateResultScreen> createState() => _CreateResultScreenState();
}

class _CreateResultScreenState extends ConsumerState<CreateResultScreen> {
  String _examType = examTypes.first;
  final _semester = TextEditingController(text: '1');
  final List<_SubjectRow> _rows = [_SubjectRow()];
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _semester.dispose();
    for (final r in _rows) {
      r.subject.dispose();
      r.marks.dispose();
      r.maxMarks.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    final valid = _rows.where((r) => r.subject.text.trim().isNotEmpty && r.marks.text.trim().isNotEmpty).toList();
    if (valid.isEmpty) {
      setState(() => _error = 'Enter at least one subject with marks obtained.');
      return;
    }
    final semester = int.tryParse(_semester.text.trim()) ?? 1;

    setState(() => _busy = true);
    try {
      for (final r in valid) {
        await ref.read(gradesRepositoryProvider).create(
              studentId: widget.studentId,
              subject: r.subject.text.trim(),
              examType: _examType,
              semester: semester,
              marks: num.tryParse(r.marks.text.trim()) ?? 0,
              maxMarks: num.tryParse(r.maxMarks.text.trim()) ?? 100,
            );
      }
      ref.invalidate(gradesProvider);
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
      appBar: AppBar(title: Text('New Result — ${widget.studentName}')),
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
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 2,
                child: DropdownButtonFormField<String>(
                  value: _examType,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Exam Type'),
                  items: [for (final t in examTypes) DropdownMenuItem(value: t, child: Text(t, overflow: TextOverflow.ellipsis))],
                  onChanged: (v) => setState(() => _examType = v!),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _semester,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Semester'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text('Subjects', style: Theme.of(context).textTheme.labelLarge?.copyWith(color: AppColors.gold)),
          const SizedBox(height: 10),
          for (final r in _rows) ...[
            Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  children: [
                    TextField(controller: r.subject, decoration: const InputDecoration(labelText: 'Subject', hintText: 'e.g. Law of Contracts')),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: r.marks,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(labelText: 'Marks Obtained'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: r.maxMarks,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(labelText: 'Max Marks'),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline, color: AppColors.danger),
                          onPressed: _rows.length == 1 ? null : () => setState(() => _rows.remove(r)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
          TextButton.icon(
            onPressed: () => setState(() => _rows.add(_SubjectRow())),
            icon: const Icon(Icons.add),
            label: const Text('Add Another Subject'),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Save Result'),
          ),
        ],
      ),
    );
  }
}
