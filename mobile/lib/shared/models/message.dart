/// Mirrors a row from `messages` as returned by GET /api/messages
/// (server/routes/messages.js, fieldMap.js MESSAGE_FIELDS) — notifications
/// sent to a student by faculty/admin.
class AppMessage {
  AppMessage({
    required this.id,
    required this.toStudentId,
    required this.text,
    required this.date,
    required this.isRead,
    this.fromName,
    this.fromRole,
  });

  factory AppMessage.fromJson(Map<String, dynamic> json) {
    bool asBool(Object? v) => v == true || v == 'true' || v == 1;
    return AppMessage(
      id: json['id'].toString(),
      toStudentId: json['toStudentId'].toString(),
      text: json['text'] as String? ?? '',
      date: DateTime.tryParse(json['date'] as String? ?? '') ?? DateTime.now(),
      isRead: asBool(json['isRead']),
      fromName: json['fromName'] as String?,
      fromRole: json['fromRole'] as String?,
    );
  }

  final String id;
  final String toStudentId;
  final String text;
  final DateTime date;
  final bool isRead;
  final String? fromName;
  final String? fromRole;
}
