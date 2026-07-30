import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// A single "Today's X" stat tile — icon, big number, label — used on both
/// the Dashboard's at-a-glance grid and the standalone Overview screen.
class StatCard extends StatelessWidget {
  const StatCard({super.key, required this.icon, required this.value, required this.label, this.accent, this.onTap, this.valueFontSize = 20});
  final IconData icon;
  final String value;
  final String label;
  final Color? accent;
  final VoidCallback? onTap;

  /// Smaller for text-heavy values (e.g. a course name) than for short
  /// numbers/percentages, so long values wrap within the card instead of
  /// overflowing it.
  final double valueFontSize;

  @override
  Widget build(BuildContext context) {
    final color = accent ?? AppColors.maroon;
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(9)),
                child: Icon(icon, color: color, size: 18),
              ),
              const SizedBox(height: 8),
              Text(
                value,
                style: TextStyle(fontSize: valueFontSize, fontWeight: FontWeight.bold, color: AppColors.ink),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 1),
              Text(label, style: const TextStyle(color: AppColors.slate, fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
      ),
    );
  }
}
