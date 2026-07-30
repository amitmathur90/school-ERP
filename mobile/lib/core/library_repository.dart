import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../shared/models/library.dart';
import 'providers.dart';

class LibraryRepository {
  LibraryRepository(this._ref);
  final Ref _ref;

  Future<List<BookTitle>> fetchTitles() async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/library/titles');
    final list = response.data as List;
    return list.map((e) => BookTitle.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Returns the title plus its individual copies (accession/shelf/status) —
  /// mirrors GET /api/library/titles/:id.
  Future<(BookTitle, List<BookCopy>)> fetchTitleDetail(String id) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/library/titles/$id');
    final data = response.data as Map<String, dynamic>;
    final title = BookTitle.fromJson(data);
    final copies = (data['copies'] as List? ?? const []).map((e) => BookCopy.fromJson(e as Map<String, dynamic>)).toList();
    return (title, copies);
  }

  Future<BookTitle> addTitle(Map<String, dynamic> fields) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/library/titles', data: fields);
    return BookTitle.fromJson(response.data as Map<String, dynamic>);
  }

  Future<BookTitle> updateTitle(String id, Map<String, dynamic> fields) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.patch('/library/titles/$id', data: fields);
    return BookTitle.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> deleteTitle(String id) async {
    final dio = _ref.read(apiClientProvider).dio;
    await dio.delete('/library/titles/$id');
  }

  Future<BookCopy> addCopy(String titleId, Map<String, dynamic> fields) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/library/titles/$titleId/copies', data: fields);
    return BookCopy.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> deleteCopy(String id) async {
    final dio = _ref.read(apiClientProvider).dio;
    await dio.delete('/library/copies/$id');
  }

  Future<List<LibrarySettings>> fetchSettings() async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/library/settings');
    final list = response.data as List;
    return list.map((e) => LibrarySettings.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Policy edits are Admin/Super Admin-only server-side — a Librarian
  /// calling this gets a 403, same as the web app.
  Future<LibrarySettings> updateSettings(String gradeBand, Map<String, dynamic> fields) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.patch('/library/settings/${Uri.encodeComponent(gradeBand)}', data: fields);
    return LibrarySettings.fromJson(response.data as Map<String, dynamic>);
  }

  Future<BookLoan> issueLoan({required String accessionNo, required String borrowerType, required String borrowerId}) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/library/loans/issue', data: {
      'accessionNo': accessionNo,
      'borrowerType': borrowerType,
      'borrowerId': borrowerId,
    });
    return BookLoan.fromJson(response.data as Map<String, dynamic>);
  }

  Future<BookLoan> returnLoan(String loanId) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/library/loans/$loanId/return');
    return BookLoan.fromJson(response.data as Map<String, dynamic>);
  }

  /// Librarian/admin can renew any loan; a student/teacher/librarian calling
  /// this for their own loan is allowed too (self-service), enforced
  /// server-side.
  Future<BookLoan> renewLoan(String loanId) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/library/loans/$loanId/renew');
    return BookLoan.fromJson(response.data as Map<String, dynamic>);
  }

  Future<BookLoan> decideFine(String loanId, String fineStatus) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.patch('/library/loans/$loanId/fine', data: {'fineStatus': fineStatus});
    return BookLoan.fromJson(response.data as Map<String, dynamic>);
  }

  Future<List<BookLoan>> listLoans({String? status}) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/library/loans', queryParameters: status != null ? {'status': status} : null);
    final list = response.data as List;
    return list.map((e) => BookLoan.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<BookLoan>> myLoans() async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/library/loans/mine');
    final list = response.data as List;
    return list.map((e) => BookLoan.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<ReadingRecord> readingRecord(String studentId) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/library/reading/$studentId');
    return ReadingRecord.fromJson(response.data as Map<String, dynamic>);
  }

  /// Raw rows for the reports tab — "overdue"/"issued" share the loan shape
  /// (parse with BookLoan.fromJson); "most-borrowed"/"reading-program"/
  /// "catalog" have their own shapes, read directly by the report screen.
  Future<List<Map<String, dynamic>>> report(String type) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/library/reports/$type');
    final list = response.data as List;
    return list.cast<Map<String, dynamic>>();
  }
}

final libraryRepositoryProvider = Provider((ref) => LibraryRepository(ref));

final libraryTitlesProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(libraryRepositoryProvider).fetchTitles();
});

final libraryIssuedLoansProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(libraryRepositoryProvider).listLoans(status: 'issued');
});

final libraryMyLoansProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(libraryRepositoryProvider).myLoans();
});

final librarySettingsProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(libraryRepositoryProvider).fetchSettings();
});
