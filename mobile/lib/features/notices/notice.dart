/// Mirrors NOTICE_FIELDS in server/fieldMap.js — GET /api/notices returns
/// these camelCase fields directly (rowToCamel converts from Postgres'
/// snake_case columns server-side).
class Notice {
  Notice({
    required this.id,
    required this.title,
    required this.content,
    required this.date,
    required this.postedByName,
    required this.postedByRole,
  });

  factory Notice.fromJson(Map<String, dynamic> json) => Notice(
        id: json['id'] as String,
        title: json['title'] as String? ?? '',
        content: json['content'] as String? ?? '',
        date: DateTime.tryParse(json['date'] as String? ?? '') ?? DateTime.now(),
        postedByName: json['postedByName'] as String? ?? '',
        postedByRole: json['postedByRole'] as String? ?? '',
      );

  final String id;
  final String title;
  final String content;
  final DateTime date;
  final String postedByName;
  final String postedByRole;
}
