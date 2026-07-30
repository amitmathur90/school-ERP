import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../shared/models/support_reply.dart';
import 'support_repository.dart';

/// Mirrors TicketThreadModal (src/law-college-erp.jsx:2900): the reply
/// thread for one ticket, plus an admin-only status selector.
class TicketThreadScreen extends ConsumerStatefulWidget {
  const TicketThreadScreen({super.key, required this.ticketId, required this.subject});
  final String ticketId;
  final String subject;

  @override
  ConsumerState<TicketThreadScreen> createState() => _TicketThreadScreenState();
}

class _TicketThreadScreenState extends ConsumerState<TicketThreadScreen> {
  final _textController = TextEditingController();
  TicketThread? _thread;
  bool _loading = true;
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final thread = await ref.read(supportRepositoryProvider).fetchThread(widget.ticketId);
      if (mounted) setState(() => _thread = thread);
    } catch (e) {
      if (mounted) setState(() => _error = describeApiError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _send() async {
    final text = _textController.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      await ref.read(supportRepositoryProvider).sendReply(widget.ticketId, text);
      _textController.clear();
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _changeStatus(String status) async {
    try {
      final updated = await ref.read(supportRepositoryProvider).updateStatus(widget.ticketId, status);
      setState(() => _thread = TicketThread(updated, _thread!.replies));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(describeApiError(e)), backgroundColor: AppColors.danger));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionControllerProvider).value;
    final isAdmin = !(session?.isStudent ?? true);

    return Scaffold(
      appBar: AppBar(title: Text(widget.subject)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : Column(
                  children: [
                    if (isAdmin)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            const Text('Status', style: TextStyle(color: AppColors.slate, fontSize: 12)),
                            const SizedBox(width: 8),
                            DropdownButton<String>(
                              value: _thread!.ticket.status,
                              underline: const SizedBox.shrink(),
                              items: const [
                                DropdownMenuItem(value: 'open', child: Text('Open')),
                                DropdownMenuItem(value: 'resolved', child: Text('Resolved')),
                                DropdownMenuItem(value: 'closed', child: Text('Closed')),
                              ],
                              onChanged: (v) => v != null ? _changeStatus(v) : null,
                            ),
                          ],
                        ),
                      ),
                    Expanded(
                      child: _thread!.replies.isEmpty
                          ? const Center(child: Text('No messages yet.', style: TextStyle(color: AppColors.slate)))
                          : ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _thread!.replies.length,
                              itemBuilder: (context, index) => _ReplyBubble(reply: _thread!.replies[index]),
                            ),
                    ),
                    SafeArea(
                      minimum: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _textController,
                              decoration: const InputDecoration(hintText: 'Type your reply…', isDense: true),
                              maxLines: 3,
                              minLines: 1,
                            ),
                          ),
                          const SizedBox(width: 8),
                          IconButton.filled(
                            onPressed: _sending ? null : _send,
                            icon: _sending
                                ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Icon(Icons.send),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
    );
  }
}

class _ReplyBubble extends StatelessWidget {
  const _ReplyBubble({required this.reply});
  final SupportReply reply;

  @override
  Widget build(BuildContext context) {
    final fromStudent = reply.isFromStudent;
    return Align(
      alignment: fromStudent ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: fromStudent ? AppColors.parchment : AppColors.goldLight,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${reply.fromName ?? (fromStudent ? 'Student' : 'Administrator')} · ${DateFormat('d MMM, h:mm a').format(reply.date)}',
              style: const TextStyle(fontSize: 11, color: AppColors.slate),
            ),
            if (reply.text != null && reply.text!.isNotEmpty) ...[
              const SizedBox(height: 3),
              Text(reply.text!, style: const TextStyle(fontSize: 13.5, height: 1.4)),
            ],
            if (reply.attachmentName != null) ...[
              const SizedBox(height: 4),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.attach_file, size: 14, color: AppColors.maroon),
                  const SizedBox(width: 4),
                  Flexible(child: Text(reply.attachmentName!, style: const TextStyle(fontSize: 12.5, color: AppColors.maroon, fontWeight: FontWeight.w600))),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
