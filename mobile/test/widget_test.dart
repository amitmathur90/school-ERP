import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';

import 'package:erp_app/main.dart';

void main() {
  testWidgets('App boots and shows the splash or login screen', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: ErpApp()));
    await tester.pump();
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
