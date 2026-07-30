/// Mirrors the JSON shape returned by POST /api/auth/login and
/// GET /api/auth/me (server/routes/auth.js, authMiddleware.js signToken).
class Session {
  Session({
    required this.token,
    required this.role,
    required this.id,
    required this.name,
    required this.permissions,
    this.department,
  });

  factory Session.fromLoginJson(Map<String, dynamic> json) {
    return Session(
      token: json['token'] as String,
      role: json['role'] as String,
      id: json['id'].toString(),
      name: json['name'] as String? ?? '',
      permissions: (json['permissions'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      department: json['department'] as String?,
    );
  }

  /// GET /api/auth/me returns req.user (the decoded JWT payload) rather
  /// than the login response shape — same fields, no "token" key, since
  /// the caller already has the token it sent.
  factory Session.fromMeJson(String token, Map<String, dynamic> json) {
    return Session(
      token: token,
      role: json['role'] as String,
      id: json['id'].toString(),
      name: json['name'] as String? ?? '',
      permissions: (json['permissions'] as List?)?.map((e) => e.toString()).toList() ?? const [],
      department: json['department'] as String?,
    );
  }

  final String token;
  final String role;
  final String id;
  final String name;
  final List<String> permissions;
  final String? department;

  bool get isStudent => role == 'student';
  bool get isSuperAdmin => role == 'super_admin';
  bool get isAdmin => role == 'admin' || role == 'super_admin';

  bool hasModule(String module) => permissions.contains(module);
}
