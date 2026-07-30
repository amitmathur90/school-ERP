import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http_parser/http_parser.dart';

import '../../core/providers.dart';
import 'academic_detail.dart';

/// Backs the public "Application for Admission" wizard
/// (AdmissionApplyScreen) — every call here hits an endpoint that's
/// deliberately left unauthenticated on the server (server/routes/students.js,
/// academicDetails.js, documents.js) because the applicant has no account yet
/// when they start.
class AdmissionApplyRepository {
  AdmissionApplyRepository(this._ref);
  final Ref _ref;

  /// POST /api/students/draft — creates a new draft (first call, no
  /// [draftId]) or updates an existing one. Returns the draft's id.
  Future<String> saveDraft(Map<String, dynamic> fields, int step, String? draftId) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/students/draft', data: {
      if (draftId != null) 'draftId': draftId,
      'step': step,
      ...fields,
    });
    final data = response.data as Map<String, dynamic>;
    return (data['id'] ?? draftId).toString();
  }

  /// POST /api/students/:id/finalize — submits the completed application.
  Future<void> finalize(String draftId, Map<String, dynamic> fields) async {
    final dio = _ref.read(apiClientProvider).dio;
    await dio.post('/students/$draftId/finalize', data: fields);
  }

  /// POST /api/academic-details/sync — replaces all academic rows for this
  /// draft with the given list.
  Future<List<AcademicDetail>> syncAcademicDetails(String draftId, List<Map<String, String>> rows) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/academic-details/sync', data: {
      'studentId': draftId,
      'rows': rows,
    });
    final data = response.data as Map<String, dynamic>;
    final list = data['rows'] as List;
    return list.map((e) => AcademicDetail.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// POST /api/documents/upload (multipart) — uploads one document for this
  /// draft. Returns the created document's metadata.
  Future<Map<String, dynamic>> uploadDocument({
    required String draftId,
    required int sno,
    required String documentType,
    required String originalPhotocopy,
    required String documentNo,
    required String fileName,
    required List<int> bytes,
    required String mimeType,
  }) async {
    final dio = _ref.read(apiClientProvider).dio;
    final formData = FormData.fromMap({
      'studentId': draftId,
      'sno': sno,
      'documentType': documentType,
      'originalPhotocopy': originalPhotocopy,
      'documentNo': documentNo,
      'file': MultipartFile.fromBytes(bytes, filename: fileName, contentType: MediaType.parse(mimeType)),
    });
    final response = await dio.post('/documents/upload', data: formData);
    return response.data as Map<String, dynamic>;
  }

  /// DELETE /api/documents/:id — best-effort; the applicant isn't logged in
  /// yet so this always fails with 401 (admin-only route) and callers should
  /// swallow the error, matching the web wizard's behaviour.
  Future<void> deleteDocument(String documentId) async {
    final dio = _ref.read(apiClientProvider).dio;
    await dio.delete('/documents/$documentId');
  }
}

final admissionApplyRepositoryProvider = Provider((ref) => AdmissionApplyRepository(ref));
