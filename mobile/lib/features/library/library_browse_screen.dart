import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/library_repository.dart';
import '../../core/theme.dart';
import '../../shared/models/library.dart';

/// Mirrors LibraryBrowsePage (src/school-erp.jsx): search/browse the
/// catalog by reading level, view "My Loans" (+ self-service renew), and —
/// for students only — the reading-milestone tracker. Used from both the
/// student and faculty drawers. Issuing/returning stays librarian/admin-desk
/// only (see LibraryAdminScreen), matching the web app's self-service split
/// — a student or teacher can't check a book out to themselves here.
class LibraryBrowseScreen extends ConsumerStatefulWidget {
  const LibraryBrowseScreen({super.key, required this.isStudent, this.studentId});
  final bool isStudent;
  final String? studentId;

  @override
  ConsumerState<LibraryBrowseScreen> createState() => _LibraryBrowseScreenState();
}

class _LibraryBrowseScreenState extends ConsumerState<LibraryBrowseScreen> with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: widget.isStudent ? 3 : 2, vsync: this);
  final _searchController = TextEditingController();
  String _search = '';
  String _readingLevel = 'All';

  @override
  void dispose() {
    _tab.dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Library'),
        bottom: TabBar(
          controller: _tab,
          tabs: [
            const Tab(text: 'Browse'),
            const Tab(text: 'My Loans'),
            if (widget.isStudent) const Tab(text: 'Reading Log'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          _BrowseTab(
            search: _search,
            readingLevel: _readingLevel,
            searchController: _searchController,
            onSearchChanged: (v) => setState(() => _search = v),
            onLevelChanged: (v) => setState(() => _readingLevel = v),
          ),
          const _MyLoansTab(),
          if (widget.isStudent) _ReadingTab(studentId: widget.studentId),
        ],
      ),
    );
  }
}

class _BrowseTab extends ConsumerWidget {
  const _BrowseTab({
    required this.search,
    required this.readingLevel,
    required this.searchController,
    required this.onSearchChanged,
    required this.onLevelChanged,
  });
  final String search;
  final String readingLevel;
  final TextEditingController searchController;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<String> onLevelChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final titlesAsync = ref.watch(libraryTitlesProvider);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: Column(
            children: [
              TextField(
                controller: searchController,
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Title, author…'),
                onChanged: onSearchChanged,
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: DropdownButton<String>(
                  value: readingLevel,
                  items: ['All', ...kLibraryGradeBands].map((l) => DropdownMenuItem(value: l, child: Text(l))).toList(),
                  onChanged: (v) => onLevelChanged(v ?? 'All'),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: titlesAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => Center(child: Text('Could not load the catalog: $error')),
            data: (titles) {
              final filtered = titles.where((t) {
                if (readingLevel != 'All' && t.readingLevel != readingLevel) return false;
                if (search.trim().isEmpty) return true;
                final q = search.trim().toLowerCase();
                return t.title.toLowerCase().contains(q) || (t.authors ?? '').toLowerCase().contains(q);
              }).toList();
              if (filtered.isEmpty) {
                return const Center(child: Text('No books found.', style: TextStyle(color: AppColors.slate)));
              }
              return RefreshIndicator(
                onRefresh: () async => ref.invalidate(libraryTitlesProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final t = filtered[i];
                    return Card(
                      child: ListTile(
                        title: Text(t.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text('${t.authors ?? "—"} · ${t.category}${t.readingLevel != null ? " · ${t.readingLevel}" : ""}'),
                        trailing: Text(
                          t.availableCopies > 0 ? '${t.availableCopies} available' : 'All out',
                          style: TextStyle(
                            color: t.availableCopies > 0 ? AppColors.success : AppColors.danger,
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              );
            },
          ),
        ),
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 4, 16, 12),
          child: Text(
            "To borrow a book, bring it (or its accession number) to the librarian's desk.",
            style: TextStyle(color: AppColors.slate, fontSize: 12),
          ),
        ),
      ],
    );
  }
}

class _MyLoansTab extends ConsumerWidget {
  const _MyLoansTab();

  Future<void> _renew(BuildContext context, WidgetRef ref, BookLoan loan) async {
    try {
      await ref.read(libraryRepositoryProvider).renewLoan(loan.id);
      ref.invalidate(libraryMyLoansProvider);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loansAsync = ref.watch(libraryMyLoansProvider);
    final df = DateFormat('d MMM yyyy');
    return loansAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('Could not load your loans: $error')),
      data: (loans) {
        if (loans.isEmpty) {
          return const Center(child: Text('No loans yet.', style: TextStyle(color: AppColors.slate)));
        }
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(libraryMyLoansProvider),
          child: ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: loans.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, i) {
              final l = loans[i];
              final due = DateTime.tryParse(l.dueDate);
              final returnedAt = l.returnedAt;
              return Card(
                child: ListTile(
                  title: Text(l.title ?? '—', style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(
                    l.isReturned
                        ? 'Returned ${returnedAt != null ? df.format(DateTime.parse(returnedAt)) : ""}'
                        : 'Due ${due != null ? df.format(due) : "—"}${l.isOverdue ? " · Overdue" : ""}',
                    style: TextStyle(
                      color: l.isReturned ? AppColors.success : (l.isOverdue ? AppColors.danger : AppColors.slate),
                      fontWeight: l.isOverdue ? FontWeight.w700 : FontWeight.normal,
                    ),
                  ),
                  trailing: (!l.isReturned && !l.isOverdue) ? TextButton(onPressed: () => _renew(context, ref, l), child: const Text('Renew')) : null,
                ),
              );
            },
          ),
        );
      },
    );
  }
}

class _ReadingTab extends ConsumerWidget {
  const _ReadingTab({required this.studentId});
  final String? studentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = studentId;
    if (id == null) return const SizedBox.shrink();
    return FutureBuilder<ReadingRecord>(
      future: ref.read(libraryRepositoryProvider).readingRecord(id),
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
        if (snapshot.hasError) return Center(child: Text('Could not load your reading record: ${snapshot.error}'));
        final r = snapshot.data!;
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.emoji_events_outlined, size: 48, color: AppColors.gold),
                const SizedBox(height: 12),
                Text('${r.booksRead}', style: const TextStyle(fontSize: 40, fontWeight: FontWeight.bold)),
                const Text('books completed', style: TextStyle(color: AppColors.slate)),
                if (r.nextMilestone != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    '${r.nextMilestone! - r.booksRead} more to reach your next milestone (${r.nextMilestone} books)!',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.slate, fontSize: 12.5),
                  ),
                ],
                if (r.milestonesReached.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    alignment: WrapAlignment.center,
                    children: r.milestonesReached.map((m) => Chip(label: Text('$m Books Badge'))).toList(),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}
