/// Mirrors a row from `support_tickets` as returned by GET
/// /api/support/tickets (server/routes/support.js, fieldMap.js
/// SUPPORT_TICKET_FIELDS).
class SupportTicket {
  SupportTicket({
    required this.id,
    required this.studentId,
    required this.subject,
    required this.status,
    required this.studentUnread,
    required this.adminUnread,
    required this.createdAt,
    required this.updatedAt,
  });

  factory SupportTicket.fromJson(Map<String, dynamic> json) {
    bool asBool(Object? v) => v == true || v == 'true' || v == 1;
    return SupportTicket(
      id: json['id'].toString(),
      studentId: json['studentId'].toString(),
      subject: json['subject'] as String? ?? '',
      status: json['status'] as String? ?? 'open',
      studentUnread: asBool(json['studentUnread']),
      adminUnread: asBool(json['adminUnread']),
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(json['updatedAt'] as String? ?? '') ?? DateTime.now(),
    );
  }

  final String id;
  final String studentId;
  final String subject;
  final String status;
  final bool studentUnread;
  final bool adminUnread;
  final DateTime createdAt;
  final DateTime updatedAt;
}
