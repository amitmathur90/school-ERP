import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/library_repository.dart';
import '../../core/theme.dart';
import '../../shared/models/library.dart';

/// Mirrors LibraryCopiesModal (src/school-erp.jsx): the individually
/// issuable physical copies of one title — add by accession number, remove
/// (blocked server-side while a copy is on loan).
class LibraryCopiesScreen extends ConsumerStatefulWidget {
  const LibraryCopiesScreen({super.key, required this.title});
  final BookTitle title;

  @override
  ConsumerState<LibraryCopiesScreen> createState() => _LibraryCopiesScreenState();
}

class _LibraryCopiesScreenState extends ConsumerState<LibraryCopiesScreen> {
  List<BookCopy>? _copies;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final (_, copies) = await ref.read(libraryRepositoryProvider).fetchTitleDetail(widget.title.id);
      if (mounted) setState(() => _copies = copies);
    } catch (e) {
      if (mounted) setState(() => _error = describeApiError(e));
    }
  }

  Future<void> _addCopy() async {
    final accessionController = TextEditingController();
    final shelfController = TextEditingController();
    String condition = 'Good';

    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Add a Copy'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: accessionController, decoration: const InputDecoration(labelText: 'Accession No. *'), autofocus: true),
              const SizedBox(height: 12),
              TextField(controller: shelfController, decoration: const InputDecoration(labelText: 'Shelf Location')),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: condition,
                decoration: const InputDecoration(labelText: 'Condition'),
                items: const ['Good', 'Fair', 'Worn', 'Damaged'].map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                onChanged: (v) => setDialogState(() => condition = v ?? 'Good'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Add')),
          ],
        ),
      ),
    );
    if (submitted != true) return;
    if (accessionController.text.trim().isEmpty) return;

    setState(() => _busy = true);
    try {
      await ref.read(libraryRepositoryProvider).addCopy(widget.title.id, {
        'accessionNo': accessionController.text.trim(),
        'shelfLocation': shelfController.text.trim(),
        'condition': condition,
      });
      ref.invalidate(libraryTitlesProvider);
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _removeCopy(BookCopy copy) async {
    setState(() => _busy = true);
    try {
      await ref.read(libraryRepositoryProvider).deleteCopy(copy.id);
      ref.invalidate(libraryTitlesProvider);
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Copies — ${widget.title.title}')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _busy ? null : _addCopy,
        icon: const Icon(Icons.add),
        label: const Text('Add Copy'),
      ),
      body: _error != null
          ? Center(child: Text(_error!))
          : _copies == null
              ? const Center(child: CircularProgressIndicator())
              : _copies!.isEmpty
                  ? const Center(child: Text('No copies yet — add the first one below.', style: TextStyle(color: AppColors.slate)))
                  : ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: _copies!.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, i) {
                        final c = _copies![i];
                        return Card(
                          child: ListTile(
                            title: Text(c.accessionNo, style: const TextStyle(fontWeight: FontWeight.w600, fontFamily: 'monospace')),
                            subtitle: Text('${c.shelfLocation?.isNotEmpty == true ? c.shelfLocation : "No shelf set"} · ${c.condition} · ${c.status}'),
                            trailing: c.status == 'issued'
                                ? const Tooltip(message: 'On loan — return it first', child: Icon(Icons.lock_outline, color: AppColors.slate))
                                : IconButton(icon: const Icon(Icons.delete_outline, color: AppColors.danger), onPressed: _busy ? null : () => _removeCopy(c)),
                          ),
                        );
                      },
                    ),
    );
  }
}
