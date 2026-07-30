import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/library_repository.dart';
import '../../core/providers.dart';
import '../../core/teachers_repository.dart';
import '../../core/theme.dart';
import '../../shared/models/library.dart';
import '../../shared/models/teacher.dart';
import '../admissions/admission.dart';
import '../admissions/admissions_repository.dart';
import 'library_copies_screen.dart';

/// Mirrors LibraryAdminPage (src/school-erp.jsx): catalog management,
/// issue/return desk, reports, and policy settings — used by both Admin
/// (Library nav item) and the Librarian role's own portal. Settings are
/// viewable by both but only editable by Admin/Super Admin, enforced
/// server-side (see LibraryRepository.updateSettings).
class LibraryAdminScreen extends ConsumerStatefulWidget {
  const LibraryAdminScreen({super.key});

  @override
  ConsumerState<LibraryAdminScreen> createState() => _LibraryAdminScreenState();
}

class _LibraryAdminScreenState extends ConsumerState<LibraryAdminScreen> with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 4, vsync: this);

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Library'),
        bottom: TabBar(
          controller: _tab,
          isScrollable: true,
          tabs: const [Tab(text: 'Catalog'), Tab(text: 'Issue & Return'), Tab(text: 'Reports'), Tab(text: 'Settings')],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: const [_CatalogTab(), _DeskTab(), _ReportsTab(), _SettingsTab()],
      ),
    );
  }
}

/* ============================== CATALOG ============================== */

Future<Map<String, dynamic>?> _showTitleDialog(BuildContext context, {BookTitle? initial}) {
  final titleController = TextEditingController(text: initial?.title ?? '');
  final authorsController = TextEditingController(text: initial?.authors ?? '');
  final publisherController = TextEditingController(text: initial?.publisher ?? '');
  final isbnController = TextEditingController(text: initial?.isbn ?? '');
  final priceController = TextEditingController(text: initial?.price?.toString() ?? '');
  String category = initial?.category ?? kBookCategories[2]; // 'Fiction'
  String? readingLevel = initial?.readingLevel;
  bool summerList = initial?.summerList ?? false;

  return showDialog<Map<String, dynamic>?>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setDialogState) => AlertDialog(
        title: Text(initial == null ? 'Add Title' : 'Edit Title'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: titleController, decoration: const InputDecoration(labelText: 'Title *'), autofocus: true),
              const SizedBox(height: 12),
              TextField(controller: authorsController, decoration: const InputDecoration(labelText: 'Author(s)')),
              const SizedBox(height: 12),
              TextField(controller: publisherController, decoration: const InputDecoration(labelText: 'Publisher')),
              const SizedBox(height: 12),
              TextField(controller: isbnController, decoration: const InputDecoration(labelText: 'ISBN')),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: category,
                decoration: const InputDecoration(labelText: 'Category'),
                items: kBookCategories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                onChanged: (v) => setDialogState(() => category = v ?? category),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String?>(
                initialValue: readingLevel,
                decoration: const InputDecoration(labelText: 'Reading Level'),
                items: [
                  const DropdownMenuItem<String?>(value: null, child: Text('Not set')),
                  ...kLibraryGradeBands.map((g) => DropdownMenuItem<String?>(value: g, child: Text(g))),
                ],
                onChanged: (v) => setDialogState(() => readingLevel = v),
              ),
              const SizedBox(height: 12),
              TextField(controller: priceController, decoration: const InputDecoration(labelText: 'Price'), keyboardType: TextInputType.number),
              const SizedBox(height: 4),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text("On this year's summer reading list?"),
                value: summerList,
                onChanged: (v) => setDialogState(() => summerList = v),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (titleController.text.trim().isEmpty) return;
              Navigator.of(context).pop({
                'title': titleController.text.trim(),
                'authors': authorsController.text.trim(),
                'publisher': publisherController.text.trim(),
                'isbn': isbnController.text.trim(),
                'category': category,
                'readingLevel': readingLevel,
                'price': double.tryParse(priceController.text.trim()) ?? 0,
                'summerList': summerList,
              });
            },
            child: const Text('Save'),
          ),
        ],
      ),
    ),
  );
}

class _CatalogTab extends ConsumerStatefulWidget {
  const _CatalogTab();

  @override
  ConsumerState<_CatalogTab> createState() => _CatalogTabState();
}

class _CatalogTabState extends ConsumerState<_CatalogTab> {
  bool _busy = false;

  Future<void> _add() async {
    final fields = await _showTitleDialog(context);
    if (fields == null) return;
    setState(() => _busy = true);
    try {
      await ref.read(libraryRepositoryProvider).addTitle(fields);
      ref.invalidate(libraryTitlesProvider);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _edit(BookTitle t) async {
    final fields = await _showTitleDialog(context, initial: t);
    if (fields == null) return;
    setState(() => _busy = true);
    try {
      await ref.read(libraryRepositoryProvider).updateTitle(t.id, fields);
      ref.invalidate(libraryTitlesProvider);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove(BookTitle t) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove Title?'),
        content: Text('Remove "${t.title}" from the catalog? This can\'t be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Remove')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(libraryRepositoryProvider).deleteTitle(t.id);
      ref.invalidate(libraryTitlesProvider);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
    }
  }

  @override
  Widget build(BuildContext context) {
    final titlesAsync = ref.watch(libraryTitlesProvider);
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _busy ? null : _add,
        icon: const Icon(Icons.add),
        label: const Text('Add Title'),
      ),
      body: titlesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('Could not load the catalog: $error')),
        data: (titles) {
          if (titles.isEmpty) {
            return const Center(child: Text('No books in the catalog yet.', style: TextStyle(color: AppColors.slate)));
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(libraryTitlesProvider),
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 80),
              itemCount: titles.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final t = titles[i];
                return Card(
                  child: ListTile(
                    title: Text(t.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text('${t.authors ?? "—"} · ${t.category}${t.readingLevel != null ? " · ${t.readingLevel}" : ""}\n${t.availableCopies}/${t.totalCopies} copies available'),
                    isThreeLine: true,
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => LibraryCopiesScreen(title: t))),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(icon: const Icon(Icons.edit_outlined, size: 20), onPressed: () => _edit(t)),
                        IconButton(icon: const Icon(Icons.delete_outline, size: 20, color: AppColors.danger), onPressed: () => _remove(t)),
                      ],
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

/* ============================== ISSUE & RETURN DESK ============================== */

class _DeskTab extends ConsumerStatefulWidget {
  const _DeskTab();

  @override
  ConsumerState<_DeskTab> createState() => _DeskTabState();
}

class _DeskTabState extends ConsumerState<_DeskTab> {
  String _borrowerType = 'student';
  String? _borrowerId;
  final _accessionController = TextEditingController();
  bool _issuing = false;

  @override
  void dispose() {
    _accessionController.dispose();
    super.dispose();
  }

  Future<void> _issue() async {
    final borrowerId = _borrowerId;
    if (borrowerId == null || _accessionController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Choose a borrower and enter an accession number.')));
      return;
    }
    setState(() => _issuing = true);
    try {
      await ref.read(libraryRepositoryProvider).issueLoan(
            accessionNo: _accessionController.text.trim(),
            borrowerType: _borrowerType,
            borrowerId: borrowerId,
          );
      _accessionController.clear();
      setState(() => _borrowerId = null);
      ref.invalidate(libraryIssuedLoansProvider);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
    } finally {
      if (mounted) setState(() => _issuing = false);
    }
  }

  Future<void> _returnLoan(BookLoan loan) async {
    try {
      await ref.read(libraryRepositoryProvider).returnLoan(loan.id);
      ref.invalidate(libraryIssuedLoansProvider);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
    }
  }

  Future<void> _renewLoan(BookLoan loan) async {
    try {
      await ref.read(libraryRepositoryProvider).renewLoan(loan.id);
      ref.invalidate(libraryIssuedLoansProvider);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
    }
  }

  @override
  Widget build(BuildContext context) {
    final admissionsAsync = ref.watch(admissionsProvider);
    final teachersAsync = ref.watch(teachersProvider);
    final loansAsync = ref.watch(libraryIssuedLoansProvider);
    final df = DateFormat('d MMM');

    final List<({String id, String label})> borrowerOptions = _borrowerType == 'student'
        ? (admissionsAsync.valueOrNull ?? const <Admission>[])
            .where((s) => s.status == AdmissionStatus.approved)
            .map((s) => (id: s.id, label: '${s.name}${s.rollNo != null ? " — ${s.rollNo}" : ""}'))
            .toList()
        : (teachersAsync.valueOrNull ?? const <Teacher>[]).map((t) => (id: t.id, label: '${t.name}${t.employeeId != null ? " — ${t.employeeId}" : ""}')).toList();

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Issue a Book', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 12),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'student', label: Text('Student')),
                    ButtonSegment(value: 'teacher', label: Text('Staff')),
                  ],
                  selected: {_borrowerType},
                  onSelectionChanged: (s) => setState(() {
                    _borrowerType = s.first;
                    _borrowerId = null;
                  }),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _borrowerId,
                  decoration: InputDecoration(labelText: _borrowerType == 'student' ? 'Student' : 'Staff Member'),
                  items: borrowerOptions.map((o) => DropdownMenuItem(value: o.id, child: Text(o.label, overflow: TextOverflow.ellipsis))).toList(),
                  onChanged: (v) => setState(() => _borrowerId = v),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _accessionController,
                  decoration: const InputDecoration(labelText: 'Accession No. *', hintText: 'Scan or type'),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(onPressed: _issuing ? null : _issue, child: Text(_issuing ? 'Issuing…' : 'Issue Book')),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text('Currently Issued', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        loansAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Text('Could not load issued loans: $error'),
          data: (loans) {
            if (loans.isEmpty) return const Text('Nothing out right now.', style: TextStyle(color: AppColors.slate));
            return Column(
              children: loans.map((l) {
                final due = DateTime.tryParse(l.dueDate);
                return Card(
                  color: l.isOverdue ? AppColors.dangerBg : null,
                  child: ListTile(
                    title: Text(l.title ?? '—', style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(
                      '${l.borrowerName ?? "—"}${l.borrowerRef != null ? " (${l.borrowerRef})" : ""}\n'
                      'Due ${due != null ? df.format(due) : "—"}${l.isOverdue ? " · Overdue" : ""}',
                      style: TextStyle(color: l.isOverdue ? AppColors.danger : null, fontWeight: l.isOverdue ? FontWeight.w700 : null),
                    ),
                    isThreeLine: true,
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        TextButton(onPressed: () => _renewLoan(l), child: const Text('Renew')),
                        TextButton(onPressed: () => _returnLoan(l), child: const Text('Return')),
                      ],
                    ),
                  ),
                );
              }).toList(),
            );
          },
        ),
        const SizedBox(height: 16),
        Text('Pending Fines', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        const _PendingFinesList(),
      ],
    );
  }
}

class _PendingFinesList extends ConsumerWidget {
  const _PendingFinesList();

  Future<void> _decide(WidgetRef ref, BuildContext context, BookLoan loan, String status) async {
    try {
      await ref.read(libraryRepositoryProvider).decideFine(loan.id, status);
      ref.invalidate(_pendingFinesProvider);
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final finesAsync = ref.watch(_pendingFinesProvider);
    return finesAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Text('Could not load fines: $error'),
      data: (loans) {
        if (loans.isEmpty) return const Text('No pending fines.', style: TextStyle(color: AppColors.slate));
        return Column(
          children: loans.map((l) {
            return Card(
              child: ListTile(
                title: Text(l.title ?? '—', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text('${l.borrowerName ?? "—"} · ₹${l.fineAmount.toStringAsFixed(0)}'),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextButton(onPressed: () => _decide(ref, context, l, 'paid'), child: const Text('Mark Paid')),
                    TextButton(onPressed: () => _decide(ref, context, l, 'waived'), child: const Text('Waive')),
                  ],
                ),
              ),
            );
          }).toList(),
        );
      },
    );
  }
}

final _pendingFinesProvider = FutureProvider.autoDispose((ref) async {
  final loans = await ref.watch(libraryRepositoryProvider).listLoans(status: 'returned');
  return loans.where((l) => l.fineStatus == 'pending').toList();
});

/* ============================== REPORTS ============================== */

class _ReportsTab extends ConsumerStatefulWidget {
  const _ReportsTab();

  @override
  ConsumerState<_ReportsTab> createState() => _ReportsTabState();
}

class _ReportsTabState extends ConsumerState<_ReportsTab> {
  String _type = 'overdue';
  static const _types = [
    ('overdue', 'Overdue'),
    ('issued', 'Currently Issued'),
    ('most-borrowed', 'Most Borrowed'),
    ('reading-program', 'Reading Program'),
    ('catalog', 'Full Catalog'),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: SizedBox(
            width: double.infinity,
            child: DropdownButtonFormField<String>(
              initialValue: _type,
              decoration: const InputDecoration(labelText: 'Report'),
              items: _types.map((t) => DropdownMenuItem(value: t.$1, child: Text(t.$2))).toList(),
              onChanged: (v) => setState(() => _type = v ?? _type),
            ),
          ),
        ),
        Expanded(
          child: FutureBuilder<List<Map<String, dynamic>>>(
            key: ValueKey(_type),
            future: ref.read(libraryRepositoryProvider).report(_type),
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
              if (snapshot.hasError) return Center(child: Text('Could not load this report: ${snapshot.error}'));
              final rows = snapshot.data ?? const [];
              if (rows.isEmpty) return const Center(child: Text('No records found.', style: TextStyle(color: AppColors.slate)));
              return ListView.separated(
                padding: const EdgeInsets.all(12),
                itemCount: rows.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, i) => Card(child: Padding(padding: const EdgeInsets.all(14), child: _reportRow(_type, rows[i]))),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _reportRow(String type, Map<String, dynamic> row) {
    switch (type) {
      case 'overdue':
      case 'issued':
        final loan = BookLoan.fromJson(row);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(loan.title ?? '—', style: const TextStyle(fontWeight: FontWeight.w600)),
            Text('${loan.borrowerName ?? "—"} · Due ${loan.dueDate}', style: const TextStyle(color: AppColors.slate, fontSize: 12.5)),
          ],
        );
      case 'most-borrowed':
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(row['title']?.toString() ?? '—', style: const TextStyle(fontWeight: FontWeight.w600)),
            Text('${row['authors'] ?? "—"} · Borrowed ${row['timesBorrowed']} time(s)', style: const TextStyle(color: AppColors.slate, fontSize: 12.5)),
          ],
        );
      case 'reading-program':
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(row['gradeBand']?.toString() ?? '—', style: const TextStyle(fontWeight: FontWeight.w600)),
            Text('${row['participatingStudents']} students · ${row['booksCompleted']} books completed', style: const TextStyle(color: AppColors.slate, fontSize: 12.5)),
          ],
        );
      case 'catalog':
      default:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(row['title']?.toString() ?? '—', style: const TextStyle(fontWeight: FontWeight.w600)),
            Text(
              '${row['accession_no'] ?? "no copy"} · ${row['status'] ?? "—"} · ${row['reading_level'] ?? "—"}',
              style: const TextStyle(color: AppColors.slate, fontSize: 12.5),
            ),
          ],
        );
    }
  }
}

/* ============================== SETTINGS ============================== */

class _SettingsTab extends ConsumerStatefulWidget {
  const _SettingsTab();

  @override
  ConsumerState<_SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends ConsumerState<_SettingsTab> {
  final Map<String, Map<String, dynamic>> _dirty = {};
  String? _saving;

  Future<void> _save(String gradeBand) async {
    setState(() => _saving = gradeBand);
    try {
      await ref.read(libraryRepositoryProvider).updateSettings(gradeBand, _dirty[gradeBand] ?? {});
      setState(() => _dirty.remove(gradeBand));
      ref.invalidate(librarySettingsProvider);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
    } finally {
      if (mounted) setState(() => _saving = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionControllerProvider).value;
    final canEdit = session?.isAdmin ?? false;
    final settingsAsync = ref.watch(librarySettingsProvider);

    return settingsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('Could not load policy: $error')),
      data: (rows) {
        return ListView(
          padding: const EdgeInsets.all(12),
          children: [
            if (!canEdit)
              const Card(
                color: AppColors.warnBg,
                child: Padding(
                  padding: EdgeInsets.all(14),
                  child: Text(
                    'Policy is configured by the Administrator — you can view it here, but only Admin/Super Admin can change it.',
                    style: TextStyle(fontSize: 12.5),
                  ),
                ),
              ),
            const SizedBox(height: 8),
            for (final r in rows) _GradeBandCard(settings: r, canEdit: canEdit, saving: _saving == r.gradeBand, dirty: _dirty, onSave: () => _save(r.gradeBand)),
          ],
        );
      },
    );
  }
}

class _GradeBandCard extends StatefulWidget {
  const _GradeBandCard({required this.settings, required this.canEdit, required this.saving, required this.dirty, required this.onSave});
  final LibrarySettings settings;
  final bool canEdit;
  final bool saving;
  final Map<String, Map<String, dynamic>> dirty;
  final VoidCallback onSave;

  @override
  State<_GradeBandCard> createState() => _GradeBandCardState();
}

class _GradeBandCardState extends State<_GradeBandCard> {
  late String _consequenceType = widget.settings.consequenceType;
  late final _loanPeriodController = TextEditingController(text: '${widget.settings.loanPeriodDays}');
  late final _maxLoansController = TextEditingController(text: '${widget.settings.maxSimultaneousLoans}');
  late final _renewalController = TextEditingController(text: '${widget.settings.renewalLimit}');
  late final _fineRateController = TextEditingController(text: '${widget.settings.dailyFineRate}');
  late final _fineCapController = TextEditingController(text: '${widget.settings.fineCap}');

  void _markDirty(String key, dynamic value) {
    widget.dirty.putIfAbsent(widget.settings.gradeBand, () => {})[key] = value;
    setState(() {});
  }

  @override
  void dispose() {
    _loanPeriodController.dispose();
    _maxLoansController.dispose();
    _renewalController.dispose();
    _fineRateController.dispose();
    _fineCapController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDirty = widget.dirty[widget.settings.gradeBand]?.isNotEmpty ?? false;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.settings.gradeBand, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(height: 12),
            TextField(
              controller: _loanPeriodController,
              enabled: widget.canEdit,
              decoration: const InputDecoration(labelText: 'Loan Period (days)'),
              keyboardType: TextInputType.number,
              onChanged: (v) => _markDirty('loanPeriodDays', int.tryParse(v) ?? widget.settings.loanPeriodDays),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _maxLoansController,
              enabled: widget.canEdit,
              decoration: const InputDecoration(labelText: 'Max Simultaneous Loans'),
              keyboardType: TextInputType.number,
              onChanged: (v) => _markDirty('maxSimultaneousLoans', int.tryParse(v) ?? widget.settings.maxSimultaneousLoans),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _renewalController,
              enabled: widget.canEdit,
              decoration: const InputDecoration(labelText: 'Renewal Limit'),
              keyboardType: TextInputType.number,
              onChanged: (v) => _markDirty('renewalLimit', int.tryParse(v) ?? widget.settings.renewalLimit),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: _consequenceType,
              decoration: const InputDecoration(labelText: 'Overdue Consequence'),
              items: kConsequenceLabels.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))).toList(),
              onChanged: widget.canEdit
                  ? (v) {
                      setState(() => _consequenceType = v ?? _consequenceType);
                      _markDirty('consequenceType', _consequenceType);
                    }
                  : null,
            ),
            if (_consequenceType == 'fine') ...[
              const SizedBox(height: 10),
              TextField(
                controller: _fineRateController,
                enabled: widget.canEdit,
                decoration: const InputDecoration(labelText: 'Daily Fine Rate (₹)'),
                keyboardType: TextInputType.number,
                onChanged: (v) => _markDirty('dailyFineRate', double.tryParse(v) ?? widget.settings.dailyFineRate),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _fineCapController,
                enabled: widget.canEdit,
                decoration: const InputDecoration(labelText: 'Fine Cap (₹)'),
                keyboardType: TextInputType.number,
                onChanged: (v) => _markDirty('fineCap', double.tryParse(v) ?? widget.settings.fineCap),
              ),
            ],
            if (widget.canEdit && isDirty) ...[
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton(onPressed: widget.saving ? null : widget.onSave, child: Text(widget.saving ? 'Saving…' : 'Save')),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
