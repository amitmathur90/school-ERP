import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../shared/models/support_reply.dart';
import '../../shared/models/support_ticket.dart';

class TicketThread {
  TicketThread(this.ticket, this.replies);
  final SupportTicket ticket;
  final List<SupportReply> replies;
}

class SupportRepository {
  SupportRepository(this._ref);
  final Ref _ref;

  Future<List<SupportTicket>> fetchTickets() async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/support/tickets');
    final list = response.data as List;
    return list.map((e) => SupportTicket.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<SupportTicket> createTicket({required String subject, required String message}) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/support/tickets', data: {'subject': subject, 'message': message});
    return SupportTicket.fromJson(response.data as Map<String, dynamic>);
  }

  /// Also marks the thread as read for the current viewer (server-side side effect).
  Future<TicketThread> fetchThread(String ticketId) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.get('/support/tickets/$ticketId/replies');
    final data = response.data as Map<String, dynamic>;
    final replies = (data['replies'] as List).map((e) => SupportReply.fromJson(e as Map<String, dynamic>)).toList();
    return TicketThread(SupportTicket.fromJson(data['ticket'] as Map<String, dynamic>), replies);
  }

  Future<SupportTicket> sendReply(String ticketId, String text) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.post('/support/tickets/$ticketId/replies', data: {'text': text});
    final data = response.data as Map<String, dynamic>;
    return SupportTicket.fromJson(data['ticket'] as Map<String, dynamic>);
  }

  Future<SupportTicket> updateStatus(String ticketId, String status) async {
    final dio = _ref.read(apiClientProvider).dio;
    final response = await dio.patch('/support/tickets/$ticketId', data: {'status': status});
    return SupportTicket.fromJson(response.data as Map<String, dynamic>);
  }
}

final supportRepositoryProvider = Provider((ref) => SupportRepository(ref));

final supportTicketsProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(supportRepositoryProvider).fetchTickets();
});
