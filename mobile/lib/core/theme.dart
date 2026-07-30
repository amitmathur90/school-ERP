import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Purple/teal "field-force CRM" look, replacing the earlier maroon/gold
/// law-college palette at the request of the app owner. Property names are
/// kept the same as before (maroon, gold, parchment, ...) so every screen
/// that already references AppColors picks up the new palette automatically
/// — only the hex values changed here.
class AppColors {
  static const ink = Color(0xFF1B2A4A);
  static const ink2 = Color(0xFF24365C);
  static const maroon = Color(0xFF8E2387);
  static const maroonDark = Color(0xFF6A1B69);
  static const gold = Color(0xFF17A9C4);
  static const goldLight = Color(0xFFCFF1F6);
  static const parchment = Color(0xFFF3F3F7);
  static const paper = Color(0xFFFFFFFF);
  static const charcoal = Color(0xFF2B2B2B);
  static const slate = Color(0xFF6B7280);
  static const success = Color(0xFF2E9E5B);
  static const successBg = Color(0xFFE3F6EA);
  static const danger = Color(0xFFD64550);
  static const dangerBg = Color(0xFFFBE7E8);
  static const warn = Color(0xFFC98A1A);
  static const warnBg = Color(0xFFFBF0DC);
  static const border = Color(0xFFE7E7EE);

  /// Header gradient used on the Dashboard's top banner and the Drawer's
  /// profile card, mirroring the reference screens' navy-to-teal sweep.
  static const gradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [maroon, maroonDark],
  );
  static const navyTealGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [ink, gold],
  );
}

class AppTheme {
  static ThemeData light() {
    final displayFont = GoogleFonts.poppinsTextTheme();
    final bodyFont = GoogleFonts.interTextTheme();

    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: AppColors.parchment,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.maroon,
        primary: AppColors.maroon,
        secondary: AppColors.gold,
        surface: AppColors.paper,
        error: AppColors.danger,
        brightness: Brightness.light,
      ),
      textTheme: bodyFont.copyWith(
        headlineLarge: displayFont.headlineLarge?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w700),
        headlineMedium: displayFont.headlineMedium?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w700),
        headlineSmall: displayFont.headlineSmall?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w700),
        titleLarge: displayFont.titleLarge?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w600),
        titleMedium: displayFont.titleMedium?.copyWith(color: AppColors.ink, fontWeight: FontWeight.w600),
        bodyLarge: bodyFont.bodyLarge?.copyWith(color: AppColors.charcoal),
        bodyMedium: bodyFont.bodyMedium?.copyWith(color: AppColors.charcoal),
        bodySmall: bodyFont.bodySmall?.copyWith(color: AppColors.slate),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.maroon,
        foregroundColor: AppColors.paper,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.poppins(
          color: AppColors.paper,
          fontSize: 19,
          fontWeight: FontWeight.w600,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.paper,
        elevation: 1,
        shadowColor: AppColors.ink.withValues(alpha: 0.08),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.paper,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.gold, width: 2),
        ),
        labelStyle: const TextStyle(color: AppColors.ink),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.maroon,
          foregroundColor: AppColors.paper,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          textStyle: GoogleFonts.inter(fontWeight: FontWeight.w600),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.maroon,
          foregroundColor: AppColors.paper,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: AppColors.gold,
        foregroundColor: AppColors.paper,
      ),
      dividerTheme: const DividerThemeData(color: AppColors.border),
    );
  }
}
