import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/theme.dart';
import '../admissions/apply/admission_apply_screen.dart';
import 'auth_repository.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  final _idController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  String? _errorText;

  static const _tabs = [
    (bucket: LoginBucket.admin, label: 'Admin', idLabel: 'Username', hint: 'admin'),
    (bucket: LoginBucket.teacher, label: 'Staff', idLabel: 'Email', hint: 'you@spvmlaw.edu'),
    (bucket: LoginBucket.student, label: 'Student', idLabel: 'Email', hint: 'you@example.com'),
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: _tabs.length, vsync: this);
    _tabController.addListener(() => setState(() => _errorText = null));
  }

  @override
  void dispose() {
    _tabController.dispose();
    _idController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _errorText = null);
    final tab = _tabs[_tabController.index];
    if (_idController.text.trim().isEmpty || _passwordController.text.isEmpty) {
      setState(() => _errorText = 'Please fill in both fields.');
      return;
    }
    await ref.read(sessionControllerProvider.notifier).login(
          bucket: tab.bucket,
          id: _idController.text.trim(),
          password: _passwordController.text,
        );
    if (!mounted) return;
    final state = ref.read(sessionControllerProvider);
    if (state.hasError) {
      setState(() => _errorText = describeAuthError(state.error!));
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLoading = ref.watch(sessionControllerProvider).isLoading;

    return Scaffold(
      backgroundColor: AppColors.parchment,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Greenwood Public School',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'ERP',
                        textAlign: TextAlign.center,
                        style: Theme.of(context)
                            .textTheme
                            .labelLarge
                            ?.copyWith(color: AppColors.gold, letterSpacing: 2),
                      ),
                      const SizedBox(height: 20),
                      TabBar(
                        controller: _tabController,
                        labelColor: AppColors.maroon,
                        unselectedLabelColor: AppColors.slate,
                        indicatorColor: AppColors.maroon,
                        tabs: _tabs.map((t) => Tab(text: t.label)).toList(),
                      ),
                      const SizedBox(height: 20),
                      TextField(
                        controller: _idController,
                        decoration: InputDecoration(
                          labelText: _tabs[_tabController.index].idLabel,
                          hintText: _tabs[_tabController.index].hint,
                        ),
                        keyboardType: _tabController.index == 0
                            ? TextInputType.text
                            : TextInputType.emailAddress,
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: _passwordController,
                        obscureText: _obscurePassword,
                        onSubmitted: (_) => _submit(),
                        decoration: InputDecoration(
                          labelText: 'Password',
                          suffixIcon: IconButton(
                            icon: Icon(_obscurePassword ? Icons.visibility_off : Icons.visibility),
                            onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                          ),
                        ),
                      ),
                      if (_errorText != null) ...[
                        const SizedBox(height: 12),
                        Text(_errorText!, style: const TextStyle(color: AppColors.danger)),
                      ],
                      const SizedBox(height: 20),
                      ElevatedButton(
                        onPressed: isLoading ? null : _submit,
                        child: isLoading
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text('Sign In'),
                      ),
                      const SizedBox(height: 16),
                      TextButton(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => const AdmissionApplyScreen()),
                        ),
                        child: const Text('New here? Apply for Admission'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
