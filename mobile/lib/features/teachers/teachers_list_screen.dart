import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart';
import '../../core/teachers_repository.dart';
import '../../core/theme.dart';
import '../../shared/models/teacher.dart';
import 'teacher_form_screen.dart';

/// Mirrors FacultyDirectory (src/law-college-erp.jsx:2991): search + role/
/// department/status filters over the staff roster, with Add/Edit/Delete
/// for admins.
class TeachersListScreen extends ConsumerStatefulWidget {
  const TeachersListScreen({super.key});

  @override
  ConsumerState<TeachersListScreen> createState() => _TeachersListScreenState();
}

class _TeachersListScreenState extends ConsumerState<TeachersListScreen> {
  final _searchController = TextEditingController();
  String _search = '';
  String? _roleFilter;
  String? _deptFilter;
  bool _busy = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _delete(Teacher t) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete staff member?'),
        content: Text('Delete ${t.name}\'s account? This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _busy = true);
    try {
      await ref.read(teachersRepositoryProvider).delete(t.id);
      ref.invalidate(teachersProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final teachersAsync = ref.watch(teachersProvider);
    final session = ref.watch(sessionControllerProvider).value;
    final isAdmin = session?.isAdmin ?? false;

    return Scaffold(
      appBar: AppBar(title: const Text('Faculty & Staff')),
      floatingActionButton: isAdmin
          ? FloatingActionButton.extended(
              onPressed: () async {
                final saved = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(builder: (_) => const TeacherFormScreen()),
                );
                if (saved == true) ref.invalidate(teachersProvider);
              },
              icon: const Icon(Icons.add),
              label: const Text('Add Staff'),
            )
          : null,
      body: teachersAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load staff: $error')),
        data: (all) {
          final departments = all.map((t) => t.department).whereType<String>().where((d) => d.isNotEmpty).toSet().toList()..sort();

          var visible = all.where((t) {
            if (_roleFilter != null && t.role != _roleFilter) return false;
            if (_deptFilter != null && t.department != _deptFilter) return false;
            if (_search.trim().isNotEmpty) {
              final q = _search.trim().toLowerCase();
              return t.name.toLowerCase().contains(q) || t.email.toLowerCase().contains(q) || (t.employeeId ?? '').toLowerCase().contains(q);
            }
            return true;
          }).toList();

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                child: TextField(
                  controller: _searchController,
                  decoration: const InputDecoration(isDense: true, prefixIcon: Icon(Icons.search), hintText: 'Search name, email or ID'),
                  onChanged: (v) => setState(() => _search = v),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String?>(
                        value: _roleFilter,
                        isDense: true,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Role'),
                        items: [
                          const DropdownMenuItem(value: null, child: Text('All Roles', overflow: TextOverflow.ellipsis)),
                          for (final r in staffRoles) DropdownMenuItem(value: r.$1, child: Text(r.$2, overflow: TextOverflow.ellipsis)),
                        ],
                        onChanged: (v) => setState(() => _roleFilter = v),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: DropdownButtonFormField<String?>(
                        value: _deptFilter,
                        isDense: true,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Department'),
                        items: [
                          const DropdownMenuItem(value: null, child: Text('All Depts', overflow: TextOverflow.ellipsis)),
                          for (final d in departments) DropdownMenuItem(value: d, child: Text(d, overflow: TextOverflow.ellipsis)),
                        ],
                        onChanged: (v) => setState(() => _deptFilter = v),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: visible.isEmpty
                    ? const Center(child: Text('No staff found.', style: TextStyle(color: AppColors.slate)))
                    : RefreshIndicator(
                        onRefresh: () async => ref.invalidate(teachersProvider),
                        child: ListView.separated(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          itemCount: visible.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final t = visible[index];
                            return ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: CircleAvatar(
                                backgroundColor: AppColors.goldLight,
                                child: Text(
                                  t.name.isNotEmpty ? t.name[0].toUpperCase() : '?',
                                  style: const TextStyle(color: AppColors.maroon, fontWeight: FontWeight.bold),
                                ),
                              ),
                              title: Text(t.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                              subtitle: Text(
                                '${staffRoleLabel(t.role)} · ${t.department ?? '—'} · ${t.designation ?? '—'}\n${t.email}',
                              ),
                              isThreeLine: true,
                              trailing: isAdmin
                                  ? PopupMenuButton<String>(
                                      enabled: !_busy,
                                      onSelected: (value) async {
                                        if (value == 'edit') {
                                          final saved = await Navigator.of(context).push<bool>(
                                            MaterialPageRoute(builder: (_) => TeacherFormScreen(teacher: t)),
                                          );
                                          if (saved == true) ref.invalidate(teachersProvider);
                                        } else if (value == 'delete') {
                                          _delete(t);
                                        }
                                      },
                                      itemBuilder: (context) => const [
                                        PopupMenuItem(value: 'edit', child: Text('Edit')),
                                        PopupMenuItem(value: 'delete', child: Text('Delete')),
                                      ],
                                    )
                                  : Text(
                                      t.isActive ? 'Active' : 'Inactive',
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.bold,
                                        color: t.isActive ? AppColors.success : AppColors.slate,
                                      ),
                                    ),
                            );
                          },
                        ),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}
