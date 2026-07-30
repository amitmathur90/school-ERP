/// Mirrors a row from `support_replies` as returned nested in GET
/// /api/support/tickets/:id/replies (fieldMap.js SUPPORT_REPLY_FIELDS).
class SupportReply {
  SupportReply({
    required this.id,
    required this.ticketId,
    required this.fromRole,
    required this.date,
    this.fromName,
    this.text,
    this.attachmentName,
  });

  factory SupportReply.fromJson(Map<String, dynamic> json) {
    return SupportReply(
      id: json['id'].toString(),
      ticketId: json['ticketId'].toString(),
      fromRole: json['fromRole'] as String? ?? 'admin',
      date: DateTime.tryParse(json['date'] as String? ?? '') ?? DateTime.now(),
      fromName: json['fromName'] as String?,
      text: json['text'] as String?,
      attachmentName: json['attachmentName'] as String?,
    );
  }

  final String id;
  final String ticketId;
  final String fromRole;
  final DateTime date;
  final String? fromName;
  final String? text;
  final String? attachmentName;

  bool get isFromStudent => fromRole == 'student';
}
