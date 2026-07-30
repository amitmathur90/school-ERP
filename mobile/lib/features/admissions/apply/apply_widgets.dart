import 'package:flutter/material.dart';

import '../../../core/theme.dart';

/// Small-caps section heading, mirroring the web wizard's `.eyebrow` style
/// (law-college-erp.jsx AdmissionForm).
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.topPad = 18});
  final String text;
  final double topPad;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(0, topPad, 0, 10),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          color: AppColors.maroon,
          fontWeight: FontWeight.w700,
          fontSize: 11.5,
          letterSpacing: 0.6,
        ),
      ),
    );
  }
}

/// A labeled text input with an optional "Required" red asterisk and an
/// inline validation error, matching the web `<Field>` component.
class ApplyField extends StatelessWidget {
  const ApplyField({
    super.key,
    required this.label,
    this.controller,
    this.initialValue,
    this.required = false,
    this.error,
    this.onChanged,
    this.keyboardType,
    this.obscureText = false,
    this.maxLines = 1,
    this.readOnly = false,
    this.enabled = true,
    this.hintText,
    this.suffixIcon,
  });

  final String label;
  final TextEditingController? controller;
  final String? initialValue;
  final bool required;
  final String? error;
  final ValueChanged<String>? onChanged;
  final TextInputType? keyboardType;
  final bool obscureText;
  final int maxLines;
  final bool readOnly;
  final bool enabled;
  final String? hintText;
  final Widget? suffixIcon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: TextFormField(
        controller: controller,
        initialValue: controller == null ? initialValue : null,
        onChanged: onChanged,
        keyboardType: keyboardType,
        obscureText: obscureText,
        maxLines: obscureText ? 1 : maxLines,
        readOnly: readOnly,
        enabled: enabled,
        decoration: InputDecoration(
          labelText: required ? '$label *' : label,
          hintText: hintText,
          errorText: error,
          suffixIcon: suffixIcon,
        ),
      ),
    );
  }
}

/// A labeled dropdown, matching the web `<Field as="select">` pattern.
class ApplyDropdown extends StatelessWidget {
  const ApplyDropdown({
    super.key,
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
    this.required = false,
    this.error,
    this.hint = 'Select an option',
  });

  final String label;
  final String? value;
  final List<String> options;
  final ValueChanged<String?> onChanged;
  final bool required;
  final String? error;
  final String hint;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: DropdownButtonFormField<String>(
        initialValue: (value != null && value!.isNotEmpty) ? value : null,
        isExpanded: true,
        decoration: InputDecoration(labelText: required ? '$label *' : label, errorText: error),
        hint: Text(hint),
        items: [for (final o in options) DropdownMenuItem(value: o, child: Text(o, overflow: TextOverflow.ellipsis))],
        onChanged: onChanged,
      ),
    );
  }
}

/// A labeled row of choice chips, standing in for the web `<Segmented>`
/// control (a fixed set of mutually-exclusive string options).
class ApplyChoiceRow extends StatelessWidget {
  const ApplyChoiceRow({
    super.key,
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
    this.required = false,
  });

  final String label;
  final String value;
  final List<String> options;
  final ValueChanged<String> onChanged;
  final bool required;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(required ? '$label *' : label, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.ink)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final o in options)
                ChoiceChip(
                  label: Text(o),
                  selected: value == o,
                  onSelected: (_) => onChanged(o),
                  selectedColor: AppColors.goldLight,
                  labelStyle: TextStyle(color: value == o ? AppColors.maroon : AppColors.charcoal, fontWeight: value == o ? FontWeight.w700 : FontWeight.w500),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A field with an English input and an optional secondary Hindi input
/// underneath, mirroring the web `<HiField>` (used for name fields so the
/// office can print bilingual admission forms).
class ApplyHiField extends StatelessWidget {
  const ApplyHiField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    required this.hiValue,
    required this.onHiChanged,
    this.required = false,
    this.error,
  });

  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final String hiValue;
  final ValueChanged<String> onHiChanged;
  final bool required;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextFormField(
            initialValue: value,
            onChanged: onChanged,
            decoration: InputDecoration(labelText: required ? '$label *' : label, errorText: error),
          ),
          const SizedBox(height: 6),
          TextFormField(
            initialValue: hiValue,
            onChanged: onHiChanged,
            decoration: const InputDecoration(labelText: 'Hindi (optional)', isDense: true),
          ),
        ],
      ),
    );
  }
}

/// Success/info/error banner shown at the top of a wizard step.
class ApplyBanner extends StatelessWidget {
  const ApplyBanner({super.key, required this.text, this.tone = ApplyBannerTone.error, this.icon});
  final String text;
  final ApplyBannerTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final Color bg;
    final Color fg;
    switch (tone) {
      case ApplyBannerTone.error:
        bg = AppColors.dangerBg;
        fg = AppColors.danger;
      case ApplyBannerTone.success:
        bg = AppColors.successBg;
        fg = AppColors.success;
      case ApplyBannerTone.info:
        bg = AppColors.goldLight;
        fg = AppColors.ink;
    }
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[Icon(icon, size: 16, color: fg), const SizedBox(width: 8)],
          Expanded(child: Text(text, style: TextStyle(color: fg, fontSize: 13))),
        ],
      ),
    );
  }
}

enum ApplyBannerTone { error, success, info }
