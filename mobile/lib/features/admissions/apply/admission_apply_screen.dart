import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../../core/api_client.dart';
import '../../../core/courses_repository.dart';
import '../../../core/theme.dart';
import '../../../shared/models/course.dart';
import '../../fees/payments_repository.dart';
import '../admission_apply_repository.dart';
import 'admission_apply_success_screen.dart';
import 'apply_widgets.dart';

final _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
final _phoneRe = RegExp(r'^[0-9]{10}$');
final _pinRe = RegExp(r'^[0-9]{6}$');
final _aadharRe = RegExp(r'^[0-9]{12}$');
final _yearRe = RegExp(r'^\d{4}$');
final _inr = NumberFormat.decimalPattern('en_IN');

const _stepLabels = ['Basic & Personal', 'Address', 'Family Details', 'Education & Class', 'Academic & Documents'];

const _howKnowOptions = [
  'Newspaper', 'Television', 'Social Media', 'Friends & Family',
  'School Website', 'Education Fair / Exhibition', 'Hoarding / Banner',
  'School Reference', 'Other',
];

const _indiaStates = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi (NCT)', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const _occupations = ['Govt.', 'Private', 'Business', 'Others'];
const _courseGroups = ['Pre-Primary', 'Primary', 'Middle', 'Secondary', 'Senior Secondary'];
const _academicNameOptions = ['Previous Class Report Card', '10th Board', '12th Board', 'Other'];
const _documentTypes = [
  'Report Card / Transfer Certificate', '10th Marksheet', '12th Marksheet',
  'Birth Certificate', 'Transfer Certificate', 'Migration Certificate', 'Character Certificate',
  'Aadhar Card', 'Category Certificate', 'Income Certificate', 'Photo', 'Signature', 'Other',
];
const _academicToDocumentTypes = {
  'Previous Class Report Card': ['Report Card / Transfer Certificate'],
  '10th Board': ['10th Marksheet'],
  '12th Board': ['12th Marksheet'],
  'Other': ['Other'],
};

String _localId(String prefix) => '${prefix}_${DateTime.now().microsecondsSinceEpoch}_${(DateTime.now().microsecond % 997)}';

Map<String, String> _blankFields() => {
      'firstName': '', 'firstNameHi': '', 'middleName': '', 'middleNameHi': '', 'lastName': '', 'lastNameHi': '',
      'gender': 'Male', 'email': '', 'phone': '', 'howKnow': '', 'emergencyMobile': '', 'whatsapp': '', 'aadhar': '',
      'password': '', 'confirm': '',
      'dob': '', 'caste': 'General',
      'photoData': '', 'photoName': '', 'signatureData': '', 'signatureName': '',
      'permanentAddress': '', 'contactNo': '', 'mobileNo': '', 'country': 'India', 'state': '', 'city': '', 'pinCode': '',
      'stateDomicile': '', 'addressType': 'same', 'currentAddress': '', 'currentCity': '', 'currentState': '', 'currentPinCode': '',
      'fatherFirstMiddle': '', 'fatherFirstMiddleHi': '', 'fatherLastName': '', 'fatherLastNameHi': '', 'fatherPhone': '',
      'fatherEmail': '', 'fatherOccupation': 'Govt.', 'fatherOrg': '', 'fatherPost': '',
      'motherFirstMiddle': '', 'motherFirstMiddleHi': '', 'motherLastName': '', 'motherLastNameHi': '', 'motherPhone': '',
      'motherEmail': '', 'motherOccupation': 'Govt.', 'motherOrg': '', 'motherPost': '',
      'guardianName': '', 'guardianRelation': '', 'guardianPhoneResi': '', 'guardianMobile': '',
      'lastInstitution': '', 'lastExamYear': '', 'lastExamPercentage': '', 'resultStatus': 'Pass', 'gapInStudy': 'No',
      'lateralEntry': 'No', 'courseGroup': 'Primary', 'courseId': '', 'amount': '', 'medium': 'English', 'remarks': '',
    };

class _AcademicRow {
  _AcademicRow({required this.localId, this.serverId, this.name = '', this.board = '', this.passingYear = '', this.grade = '', this.subject = ''});
  final String localId;
  String? serverId;
  String name;
  String board;
  String passingYear;
  String grade;
  String subject;
}

class _DocumentRow {
  _DocumentRow({required this.localId});
  final String localId;
  String? serverId;
  String documentType = '';
  String originalPhotocopy = 'Original';
  String documentNo = '';
  String fileName = '';
  bool uploading = false;
  String docErr = '';
}

/// Mirrors AdmissionForm (src/law-college-erp.jsx) — the public, unauthenticated
/// "Application for Admission" wizard a prospective student fills in before
/// they have any account. Every network call goes through
/// [AdmissionApplyRepository], which hits the same deliberately-unauthenticated
/// endpoints the web app uses (POST /students/draft, /students/:id/finalize,
/// /academic-details/sync, /documents/upload).
class AdmissionApplyScreen extends ConsumerStatefulWidget {
  const AdmissionApplyScreen({super.key});

  @override
  ConsumerState<AdmissionApplyScreen> createState() => _AdmissionApplyScreenState();
}

class _AdmissionApplyScreenState extends ConsumerState<AdmissionApplyScreen> {
  final _picker = ImagePicker();
  late final Razorpay _razorpay;

  int _step = 1;
  String? _draftId;
  int _savedUpTo = 0;
  bool _dirty = false;
  String _err = '';
  String _navErr = '';
  bool _saving = false;
  bool _justSaved = false;
  bool _attempted = false;
  bool _obscurePassword = true;

  final Map<String, String> _f = _blankFields();
  final Map<String, String> _fileErr = {'photo': '', 'signature': ''};

  List<_AcademicRow> _academicRows = [_AcademicRow(localId: _localId('arow'))];
  final List<_DocumentRow> _documentRows = [_DocumentRow(localId: _localId('drow'))];

  bool _paidNow = false;
  String _admissionTxnId = '';
  bool _paying = false;
  String _payErr = '';
  bool _agreeTerms = false;

  @override
  void initState() {
    super.initState();
    _razorpay = Razorpay();
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onPaymentSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _onPaymentError);
    _razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, _onExternalWallet);
  }

  @override
  void dispose() {
    _razorpay.clear();
    super.dispose();
  }

  void _set(String key, String value) {
    setState(() {
      _f[key] = value;
      _dirty = true;
      _justSaved = false;
    });
  }

  List<_AcademicRow> get _completeAcademicRows =>
      _academicRows.where((r) => r.name.isNotEmpty && r.board.trim().isNotEmpty && r.passingYear.trim().isNotEmpty).toList();

  List<_AcademicRow> get _missingAcademicDocuments {
    final uploaded = _documentRows.where((d) => d.fileName.isNotEmpty).toList();
    return _completeAcademicRows.where((r) {
      final allowed = _academicToDocumentTypes[r.name] ?? const <String>[];
      return !uploaded.any((d) => allowed.contains(d.documentType));
    }).toList();
  }

  // ============================== VALIDATION ==============================

  String _validateStep(int s) {
    final f = _f;
    if (s == 1) {
      if (f['firstName']!.trim().isEmpty || f['lastName']!.trim().isEmpty || f['email']!.trim().isEmpty || f['phone']!.trim().isEmpty || f['howKnow']!.isEmpty || f['emergencyMobile']!.trim().isEmpty) {
        return 'Please complete all required fields.';
      }
      if (!_emailRe.hasMatch(f['email']!.trim())) return 'Please enter a valid email address.';
      if (!_phoneRe.hasMatch(f['phone']!.trim())) return 'Phone number must be exactly 10 digits.';
      if (!_phoneRe.hasMatch(f['emergencyMobile']!.trim())) return 'Emergency mobile number must be exactly 10 digits.';
      if (f['whatsapp']!.trim().isNotEmpty && !_phoneRe.hasMatch(f['whatsapp']!.trim())) return 'WhatsApp number must be exactly 10 digits.';
      if (f['aadhar']!.trim().isNotEmpty && !_aadharRe.hasMatch(f['aadhar']!.trim())) return 'Aadhar number must be exactly 12 digits.';
      if (_draftId == null) {
        if (f['password']!.length < 6) return 'Password must be at least 6 characters.';
        if (f['password'] != f['confirm']) return 'Passwords do not match.';
      }
      if (f['dob']!.isEmpty) return 'Please enter your date of birth.';
      final d = DateTime.tryParse(f['dob']!);
      if (d == null || d.isAfter(DateTime.now())) return 'Please enter a valid date of birth.';
      if (_fileErr['photo']!.isNotEmpty || _fileErr['signature']!.isNotEmpty) return 'Please fix the file upload errors before continuing.';
      return '';
    }
    if (s == 2) {
      if (f['permanentAddress']!.trim().isEmpty || f['contactNo']!.trim().isEmpty || f['mobileNo']!.trim().isEmpty || f['country']!.trim().isEmpty || f['state']!.isEmpty || f['city']!.trim().isEmpty || f['pinCode']!.trim().isEmpty || f['stateDomicile']!.isEmpty) {
        return 'Please complete all required address fields.';
      }
      if (!_phoneRe.hasMatch(f['contactNo']!.trim())) return 'Contact number must be exactly 10 digits.';
      if (!_phoneRe.hasMatch(f['mobileNo']!.trim())) return 'Mobile number must be exactly 10 digits.';
      if (!_pinRe.hasMatch(f['pinCode']!.trim())) return 'PIN code must be exactly 6 digits.';
      if (f['addressType'] == 'different') {
        if (f['currentAddress']!.trim().isEmpty || f['currentCity']!.trim().isEmpty || f['currentState']!.isEmpty || f['currentPinCode']!.trim().isEmpty) {
          return 'Please complete all current address fields.';
        }
        if (!_pinRe.hasMatch(f['currentPinCode']!.trim())) return 'Current address PIN code must be exactly 6 digits.';
      }
      return '';
    }
    if (s == 3) {
      if (f['fatherFirstMiddle']!.trim().isEmpty || f['fatherLastName']!.trim().isEmpty || f['fatherPhone']!.trim().isEmpty || f['fatherOccupation']!.isEmpty || f['fatherOrg']!.trim().isEmpty) {
        return "Please complete all required father's details.";
      }
      if (!_phoneRe.hasMatch(f['fatherPhone']!.trim())) return "Father's phone number must be exactly 10 digits.";
      if (f['motherFirstMiddle']!.trim().isEmpty || f['motherLastName']!.trim().isEmpty || f['motherPhone']!.trim().isEmpty || f['motherOccupation']!.isEmpty || f['motherOrg']!.trim().isEmpty) {
        return "Please complete all required mother's details.";
      }
      if (!_phoneRe.hasMatch(f['motherPhone']!.trim())) return "Mother's phone number must be exactly 10 digits.";
      return '';
    }
    if (s == 4) {
      if (f['lastExamYear']!.trim().isEmpty || f['lastExamPercentage']!.trim().isEmpty || f['resultStatus']!.isEmpty || f['courseGroup']!.isEmpty || f['courseId']!.isEmpty || f['medium']!.isEmpty) {
        return 'Please complete all required fields and select a course.';
      }
      if (!_yearRe.hasMatch(f['lastExamYear']!.trim())) return 'Please enter a valid 4-digit passing year.';
      return '';
    }
    if (s == 5) {
      if (_completeAcademicRows.isEmpty) return 'Add at least one academic record with Name, Board/University, and Passing Year filled in.';
      if (_documentRows.any((r) => r.uploading)) return 'Please wait for the current upload to finish.';
      if (_documentRows.any((r) => r.docErr.isNotEmpty)) return 'Please fix the upload error before continuing.';
      if (_missingAcademicDocuments.isNotEmpty) {
        return 'Please upload a matching document for: ${_missingAcademicDocuments.map((r) => r.name).join(", ")}.';
      }
      if (!_agreeTerms) return 'Please accept the terms and conditions before continuing.';
      return '';
    }
    return '';
  }

  Map<String, String> _fieldErrors(int s) {
    if (!_attempted) return const {};
    final f = _f;
    final fe = <String, String>{};
    if (s == 1) {
      if (f['firstName']!.trim().isEmpty) fe['firstName'] = 'Required';
      if (f['lastName']!.trim().isEmpty) fe['lastName'] = 'Required';
      if (f['email']!.trim().isEmpty) {
        fe['email'] = 'Required';
      } else if (!_emailRe.hasMatch(f['email']!.trim())) {
        fe['email'] = 'Enter a valid email address';
      }
      if (f['phone']!.trim().isEmpty) {
        fe['phone'] = 'Required';
      } else if (!_phoneRe.hasMatch(f['phone']!.trim())) {
        fe['phone'] = 'Must be 10 digits';
      }
      if (f['howKnow']!.isEmpty) fe['howKnow'] = 'Required';
      if (f['emergencyMobile']!.trim().isEmpty) {
        fe['emergencyMobile'] = 'Required';
      } else if (!_phoneRe.hasMatch(f['emergencyMobile']!.trim())) {
        fe['emergencyMobile'] = 'Must be 10 digits';
      }
      if (f['whatsapp']!.trim().isNotEmpty && !_phoneRe.hasMatch(f['whatsapp']!.trim())) fe['whatsapp'] = 'Must be 10 digits';
      if (f['aadhar']!.trim().isNotEmpty && !_aadharRe.hasMatch(f['aadhar']!.trim())) fe['aadhar'] = 'Must be 12 digits';
      if (_draftId == null) {
        if (f['password']!.isEmpty) {
          fe['password'] = 'Required';
        } else if (f['password']!.length < 6) {
          fe['password'] = 'Min 6 characters';
        }
        if (f['confirm']!.isEmpty) {
          fe['confirm'] = 'Required';
        } else if (f['password'] != f['confirm']) {
          fe['confirm'] = 'Passwords do not match';
        }
      }
      if (f['dob']!.isEmpty) fe['dob'] = 'Required';
    } else if (s == 2) {
      if (f['permanentAddress']!.trim().isEmpty) fe['permanentAddress'] = 'Required';
      if (f['contactNo']!.trim().isEmpty) {
        fe['contactNo'] = 'Required';
      } else if (!_phoneRe.hasMatch(f['contactNo']!.trim())) {
        fe['contactNo'] = 'Must be 10 digits';
      }
      if (f['mobileNo']!.trim().isEmpty) {
        fe['mobileNo'] = 'Required';
      } else if (!_phoneRe.hasMatch(f['mobileNo']!.trim())) {
        fe['mobileNo'] = 'Must be 10 digits';
      }
      if (f['country']!.trim().isEmpty) fe['country'] = 'Required';
      if (f['state']!.isEmpty) fe['state'] = 'Required';
      if (f['city']!.trim().isEmpty) fe['city'] = 'Required';
      if (f['pinCode']!.trim().isEmpty) {
        fe['pinCode'] = 'Required';
      } else if (!_pinRe.hasMatch(f['pinCode']!.trim())) {
        fe['pinCode'] = 'Must be 6 digits';
      }
      if (f['stateDomicile']!.isEmpty) fe['stateDomicile'] = 'Required';
      if (f['addressType'] == 'different') {
        if (f['currentAddress']!.trim().isEmpty) fe['currentAddress'] = 'Required';
        if (f['currentCity']!.trim().isEmpty) fe['currentCity'] = 'Required';
        if (f['currentState']!.isEmpty) fe['currentState'] = 'Required';
        if (f['currentPinCode']!.trim().isEmpty) {
          fe['currentPinCode'] = 'Required';
        } else if (!_pinRe.hasMatch(f['currentPinCode']!.trim())) {
          fe['currentPinCode'] = 'Must be 6 digits';
        }
      }
    } else if (s == 3) {
      if (f['fatherFirstMiddle']!.trim().isEmpty) fe['fatherFirstMiddle'] = 'Required';
      if (f['fatherLastName']!.trim().isEmpty) fe['fatherLastName'] = 'Required';
      if (f['fatherPhone']!.trim().isEmpty) {
        fe['fatherPhone'] = 'Required';
      } else if (!_phoneRe.hasMatch(f['fatherPhone']!.trim())) {
        fe['fatherPhone'] = 'Must be 10 digits';
      }
      if (f['fatherOrg']!.trim().isEmpty) fe['fatherOrg'] = 'Required';
      if (f['motherFirstMiddle']!.trim().isEmpty) fe['motherFirstMiddle'] = 'Required';
      if (f['motherLastName']!.trim().isEmpty) fe['motherLastName'] = 'Required';
      if (f['motherPhone']!.trim().isEmpty) {
        fe['motherPhone'] = 'Required';
      } else if (!_phoneRe.hasMatch(f['motherPhone']!.trim())) {
        fe['motherPhone'] = 'Must be 10 digits';
      }
      if (f['motherOrg']!.trim().isEmpty) fe['motherOrg'] = 'Required';
    } else if (s == 4) {
      if (f['lastExamYear']!.trim().isEmpty) {
        fe['lastExamYear'] = 'Required';
      } else if (!_yearRe.hasMatch(f['lastExamYear']!.trim())) {
        fe['lastExamYear'] = 'Enter a valid 4-digit year';
      }
      if (f['lastExamPercentage']!.trim().isEmpty) fe['lastExamPercentage'] = 'Required';
      if (f['courseId']!.isEmpty) fe['courseId'] = 'Please select a course below';
    }
    return fe;
  }

  Map<String, dynamic> _buildSnapshot() {
    final fullName = [_f['firstName']!.trim(), _f['middleName']!.trim(), _f['lastName']!.trim()].where((s) => s.isNotEmpty).join(' ');
    final snap = Map<String, dynamic>.from(_f);
    snap['name'] = fullName;
    snap['email'] = _f['email']!.trim().toLowerCase();
    snap['phone'] = _f['phone']!.trim();
    snap['category'] = _f['caste'];
    return snap;
  }

  // ============================== SAVE / NAVIGATE ==============================

  Future<bool> _doSave() async {
    setState(() => _attempted = true);
    final e = _validateStep(_step);
    if (e.isNotEmpty) {
      setState(() {
        _err = e;
        _justSaved = false;
      });
      return false;
    }
    setState(() {
      _err = '';
      _saving = true;
    });
    try {
      if (_step == 5) {
        final rows = _academicRows.where((r) => r.name.isNotEmpty || r.board.trim().isNotEmpty || r.subject.trim().isNotEmpty).map((r) => {
              'name': r.name,
              'board': r.board,
              'passingYear': r.passingYear,
              'grade': r.grade,
              'subject': r.subject,
            }).toList();
        if (_draftId != null) {
          final saved = await ref.read(admissionApplyRepositoryProvider).syncAcademicDetails(_draftId!, rows);
          setState(() {
            _academicRows = saved.map((r) => _AcademicRow(localId: r.id, serverId: r.id, name: r.name, board: r.board, passingYear: r.passingYear, grade: r.grade, subject: r.subject)).toList();
          });
        }
      }
      final newId = await ref.read(admissionApplyRepositoryProvider).saveDraft(_buildSnapshot(), _step, _draftId);
      setState(() {
        _draftId ??= newId;
        _savedUpTo = _savedUpTo > _step ? _savedUpTo : _step;
        _dirty = false;
        _justSaved = true;
        _navErr = '';
      });
    } catch (ex) {
      setState(() {
        _err = describeApiError(ex);
        _saving = false;
      });
      return false;
    }
    setState(() => _saving = false);
    return true;
  }

  void _goNext() {
    if (_dirty || _savedUpTo < _step) {
      setState(() => _navErr = 'Please save this step before continuing — tap "Save Step" first.');
      return;
    }
    setState(() {
      _navErr = '';
      _err = '';
      _step = _step < 5 ? _step + 1 : _step;
      _attempted = false;
    });
  }

  void _goBack() {
    setState(() {
      _err = '';
      _navErr = '';
      _step = _step > 1 ? _step - 1 : _step;
      _attempted = false;
    });
  }

  Future<void> _submitFinal() async {
    setState(() => _attempted = true);
    final e = _validateStep(5);
    if (e.isNotEmpty) {
      setState(() => _err = e);
      return;
    }
    final paymentsConfig = ref.read(paymentsConfigProvider).valueOrNull;
    final amount = num.tryParse(_f['amount'] ?? '') ?? 0;
    if (paymentsConfig?.available == true && amount > 0 && !_paidNow) {
      setState(() => _err = 'Please complete the admission fee payment above before submitting.');
      return;
    }
    setState(() {
      _err = '';
      _saving = true;
    });
    try {
      final repo = ref.read(admissionApplyRepositoryProvider);
      final rows = _academicRows.where((r) => r.name.isNotEmpty || r.board.trim().isNotEmpty || r.subject.trim().isNotEmpty).map((r) => {
            'name': r.name,
            'board': r.board,
            'passingYear': r.passingYear,
            'grade': r.grade,
            'subject': r.subject,
          }).toList();
      final id = _draftId!;
      await repo.syncAcademicDetails(id, rows);
      final snap = _buildSnapshot();
      await repo.saveDraft(snap, 5, id);
      await repo.finalize(id, snap);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => AdmissionApplySuccessScreen(email: _f['email']!.trim())),
      );
    } catch (ex) {
      setState(() => _err = describeApiError(ex));
    }
    if (mounted) setState(() => _saving = false);
  }

  // ============================== FILE PICKING ==============================

  Future<void> _pickPhotoOrSignature(String kind) async {
    final maxBytes = kind == 'photo' ? 512 * 1024 : 25 * 1024;
    final file = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: kind == 'photo' ? 70 : 40,
      maxWidth: kind == 'photo' ? 900 : 500,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    if (bytes.length > maxBytes) {
      setState(() => _fileErr[kind] = 'File must be less than ${kind == 'photo' ? '512KB' : '25KB'}. Try a smaller image.');
      return;
    }
    final mimeType = file.mimeType ?? _guessMime(file.name);
    if (!['image/jpeg', 'image/jpg', 'image/png'].contains(mimeType)) {
      setState(() => _fileErr[kind] = 'Only JPG, JPEG or PNG files are allowed.');
      return;
    }
    setState(() {
      _fileErr[kind] = '';
      _f['${kind}Data'] = 'data:$mimeType;base64,${base64Encode(bytes)}';
      _f['${kind}Name'] = file.name;
      _dirty = true;
      _justSaved = false;
    });
  }

  String _guessMime(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    return 'image/jpeg';
  }

  Future<void> _pickDocumentFile(_DocumentRow row) async {
    if (row.documentType.isEmpty) {
      setState(() => row.docErr = 'Select a document type first.');
      return;
    }
    final file = await _picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    if (bytes.length > 5 * 1024 * 1024) {
      setState(() => row.docErr = 'File must be less than 5MB.');
      return;
    }
    final mimeType = file.mimeType ?? _guessMime(file.name);
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/gif'].contains(mimeType)) {
      setState(() => row.docErr = 'Only JPG, JPEG, PNG, or GIF files are allowed.');
      return;
    }
    setState(() {
      row.uploading = true;
      row.docErr = '';
    });
    try {
      final sno = _documentRows.indexOf(row) + 1;
      final created = await ref.read(admissionApplyRepositoryProvider).uploadDocument(
            draftId: _draftId!,
            sno: sno,
            documentType: row.documentType,
            originalPhotocopy: row.originalPhotocopy,
            documentNo: row.documentNo,
            fileName: file.name,
            bytes: bytes,
            mimeType: mimeType,
          );
      setState(() {
        row.serverId = created['id']?.toString();
        row.fileName = created['fileName']?.toString() ?? file.name;
        row.uploading = false;
      });
    } catch (ex) {
      setState(() {
        row.uploading = false;
        row.docErr = describeApiError(ex);
      });
    }
  }

  Future<void> _removeDocumentRow(_DocumentRow row) async {
    if (row.serverId != null) {
      try {
        await ref.read(admissionApplyRepositoryProvider).deleteDocument(row.serverId!);
      } catch (_) {
        // best-effort — the applicant isn't logged in yet so this route 401s.
      }
    }
    if (_documentRows.length > 1) {
      setState(() => _documentRows.remove(row));
    }
  }

  // ============================== PAYMENT ==============================

  Future<void> _payAdmissionFee() async {
    if (_draftId == null) return;
    setState(() {
      _payErr = '';
      _paying = true;
    });
    try {
      final amount = num.tryParse(_f['amount'] ?? '') ?? 0;
      final order = await ref.read(paymentsRepositoryProvider).createRazorpayOrder(
            studentId: _draftId!,
            feeAmount: amount,
            totalAmount: amount,
            paymentMode: 'Single',
            purpose: 'admission',
          );
      _razorpay.open({
        'key': order.keyId,
        'amount': order.amountPaise,
        'order_id': order.orderId,
        'currency': order.currency,
        'name': 'Greenwood Public School',
        'description': 'Admission Fee Payment',
        'prefill': {
          if (order.studentEmail != null) 'email': order.studentEmail,
          if (order.studentPhone != null) 'contact': order.studentPhone,
        },
      });
    } catch (ex) {
      setState(() {
        _paying = false;
        _payErr = describeApiError(ex);
      });
    }
  }

  Future<void> _onPaymentSuccess(PaymentSuccessResponse response) async {
    try {
      final txn = await ref.read(paymentsRepositoryProvider).verifyRazorpayPayment(
            orderId: response.orderId!,
            paymentId: response.paymentId!,
            signature: response.signature!,
          );
      setState(() {
        _paidNow = true;
        _admissionTxnId = txn.id;
      });
    } catch (ex) {
      setState(() => _payErr = describeApiError(ex));
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  void _onPaymentError(PaymentFailureResponse response) {
    setState(() {
      _paying = false;
      _payErr = response.message ?? 'Payment could not be completed.';
    });
  }

  void _onExternalWallet(ExternalWalletResponse response) {
    setState(() => _paying = false);
  }

  // ============================== BUILD ==============================

  @override
  Widget build(BuildContext context) {
    final fe = _fieldErrors(_step);

    return Scaffold(
      appBar: AppBar(title: const Text('Application for Admission')),
      body: SafeArea(
        child: Column(
          children: [
            _StepIndicator(step: _step),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_err.isNotEmpty) ApplyBanner(text: _err),
                    if (_err.isEmpty && _justSaved) const ApplyBanner(text: 'Step saved. You can continue to the next step.', tone: ApplyBannerTone.success, icon: Icons.check_circle),
                    if (_step == 1) _buildStep1(fe),
                    if (_step == 2) _buildStep2(fe),
                    if (_step == 3) _buildStep3(fe),
                    if (_step == 4) _buildStep4(fe),
                    if (_step == 5) _buildStep5(),
                  ],
                ),
              ),
            ),
            _buildNavBar(),
          ],
        ),
      ),
    );
  }

  Widget _buildNavBar() {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        decoration: const BoxDecoration(color: AppColors.paper, border: Border(top: BorderSide(color: AppColors.border))),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_navErr.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(_navErr, style: const TextStyle(color: AppColors.danger, fontSize: 12.5), textAlign: TextAlign.right),
              ),
            Row(
              children: [
                TextButton(
                  onPressed: _saving ? null : (_step == 1 ? () => Navigator.of(context).maybePop() : _goBack),
                  child: Text(_step == 1 ? 'Exit' : 'Back'),
                ),
                const Spacer(),
                OutlinedButton(
                  onPressed: _saving || (!_dirty && _savedUpTo >= _step) ? null : _doSave,
                  child: Text(_saving ? 'Saving…' : 'Save Step'),
                ),
                const SizedBox(width: 10),
                if (_step < 5)
                  FilledButton(
                    onPressed: _saving ? null : _goNext,
                    child: const Text('Next'),
                  )
                else
                  FilledButton(
                    onPressed: _saving ? null : _submitFinal,
                    child: Text(_saving ? 'Submitting…' : 'Submit Application'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ---------------- Step 1 ----------------

  Widget _buildStep1(Map<String, String> fe) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel('Basic Information', topPad: 0),
        ApplyHiField(label: 'First Name', required: true, value: _f['firstName']!, onChanged: (v) => _set('firstName', v), hiValue: _f['firstNameHi']!, onHiChanged: (v) => _set('firstNameHi', v), error: fe['firstName']),
        ApplyHiField(label: 'Middle Name', value: _f['middleName']!, onChanged: (v) => _set('middleName', v), hiValue: _f['middleNameHi']!, onHiChanged: (v) => _set('middleNameHi', v)),
        ApplyHiField(label: 'Last Name', required: true, value: _f['lastName']!, onChanged: (v) => _set('lastName', v), hiValue: _f['lastNameHi']!, onHiChanged: (v) => _set('lastNameHi', v), error: fe['lastName']),
        ApplyChoiceRow(label: 'Gender', required: true, value: _f['gender']!, options: const ['Male', 'Female', 'Transgender'], onChanged: (v) => _set('gender', v)),
        ApplyField(label: 'Email Address', required: true, initialValue: _f['email'], error: fe['email'], keyboardType: TextInputType.emailAddress, enabled: _draftId == null, onChanged: (v) => _set('email', v)),
        ApplyField(label: 'Phone Number', required: true, initialValue: _f['phone'], error: fe['phone'], keyboardType: TextInputType.phone, onChanged: (v) => _set('phone', v)),
        ApplyDropdown(label: 'How did you know about us?', required: true, value: _f['howKnow'], options: _howKnowOptions, error: fe['howKnow'], onChanged: (v) => _set('howKnow', v ?? '')),
        ApplyField(label: 'Emergency Mobile No.', required: true, initialValue: _f['emergencyMobile'], error: fe['emergencyMobile'], keyboardType: TextInputType.phone, onChanged: (v) => _set('emergencyMobile', v)),
        ApplyField(label: 'WhatsApp No.', initialValue: _f['whatsapp'], error: fe['whatsapp'], keyboardType: TextInputType.phone, onChanged: (v) => _set('whatsapp', v)),
        ApplyField(label: 'Aadhar Number', initialValue: _f['aadhar'], error: fe['aadhar'], keyboardType: TextInputType.number, onChanged: (v) => _set('aadhar', v)),
        if (_draftId == null) ...[
          const SectionLabel('Create Portal Login'),
          ApplyField(
            label: 'Password',
            required: true,
            initialValue: _f['password'],
            error: fe['password'],
            obscureText: _obscurePassword,
            onChanged: (v) => _set('password', v),
            suffixIcon: IconButton(icon: Icon(_obscurePassword ? Icons.visibility_off : Icons.visibility), onPressed: () => setState(() => _obscurePassword = !_obscurePassword)),
          ),
          ApplyField(label: 'Confirm Password', required: true, initialValue: _f['confirm'], error: fe['confirm'], obscureText: _obscurePassword, onChanged: (v) => _set('confirm', v)),
        ] else
          const Padding(
            padding: EdgeInsets.only(bottom: 14),
            child: Text('Email and password are locked once your first step is saved.', style: TextStyle(color: AppColors.slate, fontSize: 11.5)),
          ),
        const SectionLabel('Personal Details'),
        GestureDetector(
          onTap: _pickDob,
          child: AbsorbPointer(
            child: ApplyField(
              key: ValueKey('dob-${_f['dob']}'),
              label: 'Date of Birth',
              required: true,
              initialValue: _f['dob'],
              error: fe['dob'],
              readOnly: true,
              onChanged: (_) {},
              suffixIcon: const Icon(Icons.calendar_today_outlined, size: 18),
            ),
          ),
        ),
        ApplyChoiceRow(label: 'Caste Category', required: true, value: _f['caste']!, options: const ['General', 'OBC', 'SC', 'ST', 'EWS'], onChanged: (v) => _set('caste', v)),
        const SectionLabel('Uploads'),
        _FileUploadTile(label: 'Photo', hint: 'JPG / JPEG / PNG, under 512KB', fileName: _f['photoName']!, error: _fileErr['photo']!, onPick: () => _pickPhotoOrSignature('photo')),
        _FileUploadTile(label: 'Signature', hint: 'JPG / JPEG / PNG, under 25KB', fileName: _f['signatureName']!, error: _fileErr['signature']!, onPick: () => _pickPhotoOrSignature('signature')),
      ],
    );
  }

  Future<void> _pickDob() async {
    final initial = DateTime.tryParse(_f['dob']!.isEmpty ? '' : _f['dob']!) ?? DateTime(2000, 1, 1);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1950),
      lastDate: DateTime.now(),
    );
    if (picked != null) _set('dob', DateFormat('yyyy-MM-dd').format(picked));
  }

  // ---------------- Step 2 ----------------

  Widget _buildStep2(Map<String, String> fe) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel('Permanent Address', topPad: 0),
        ApplyField(label: 'Permanent Address', required: true, initialValue: _f['permanentAddress'], error: fe['permanentAddress'], maxLines: 3, onChanged: (v) => _set('permanentAddress', v)),
        ApplyField(label: 'Contact No.', required: true, initialValue: _f['contactNo'], error: fe['contactNo'], keyboardType: TextInputType.phone, onChanged: (v) => _set('contactNo', v)),
        ApplyField(label: 'Mobile No.', required: true, initialValue: _f['mobileNo'], error: fe['mobileNo'], keyboardType: TextInputType.phone, onChanged: (v) => _set('mobileNo', v)),
        ApplyField(label: 'Country', required: true, initialValue: _f['country'], error: fe['country'], onChanged: (v) => _set('country', v)),
        ApplyDropdown(label: 'State', required: true, value: _f['state'], options: _indiaStates, error: fe['state'], hint: 'Select State', onChanged: (v) => _set('state', v ?? '')),
        ApplyField(label: 'City', required: true, initialValue: _f['city'], error: fe['city'], onChanged: (v) => _set('city', v)),
        ApplyField(label: 'PIN Code', required: true, initialValue: _f['pinCode'], error: fe['pinCode'], keyboardType: TextInputType.number, onChanged: (v) => _set('pinCode', v)),
        ApplyDropdown(label: 'State of Domicile', required: true, value: _f['stateDomicile'], options: _indiaStates, error: fe['stateDomicile'], hint: 'Select State', onChanged: (v) => _set('stateDomicile', v ?? '')),
        const SectionLabel('Correspondence Address'),
        ApplyChoiceRow(
          label: 'Address Type',
          value: _f['addressType'] == 'same' ? 'Same as Permanent Address' : 'Different (Current) Address',
          options: const ['Same as Permanent Address', 'Different (Current) Address'],
          onChanged: (v) => _set('addressType', v == 'Same as Permanent Address' ? 'same' : 'different'),
        ),
        if (_f['addressType'] == 'different') ...[
          ApplyField(label: 'Current Address', required: true, initialValue: _f['currentAddress'], error: fe['currentAddress'], maxLines: 3, onChanged: (v) => _set('currentAddress', v)),
          ApplyField(label: 'City', required: true, initialValue: _f['currentCity'], error: fe['currentCity'], onChanged: (v) => _set('currentCity', v)),
          ApplyDropdown(label: 'State', required: true, value: _f['currentState'], options: _indiaStates, error: fe['currentState'], hint: 'Select State', onChanged: (v) => _set('currentState', v ?? '')),
          ApplyField(label: 'PIN Code', required: true, initialValue: _f['currentPinCode'], error: fe['currentPinCode'], keyboardType: TextInputType.number, onChanged: (v) => _set('currentPinCode', v)),
        ],
      ],
    );
  }

  // ---------------- Step 3 ----------------

  Widget _buildStep3(Map<String, String> fe) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel("Father's Details", topPad: 0),
        ApplyHiField(label: "Father's First & Middle Name", required: true, value: _f['fatherFirstMiddle']!, onChanged: (v) => _set('fatherFirstMiddle', v), hiValue: _f['fatherFirstMiddleHi']!, onHiChanged: (v) => _set('fatherFirstMiddleHi', v), error: fe['fatherFirstMiddle']),
        ApplyHiField(label: "Father's Last Name", required: true, value: _f['fatherLastName']!, onChanged: (v) => _set('fatherLastName', v), hiValue: _f['fatherLastNameHi']!, onHiChanged: (v) => _set('fatherLastNameHi', v), error: fe['fatherLastName']),
        ApplyField(label: "Father's Phone No.", required: true, initialValue: _f['fatherPhone'], error: fe['fatherPhone'], keyboardType: TextInputType.phone, onChanged: (v) => _set('fatherPhone', v)),
        ApplyField(label: "Father's Email ID", initialValue: _f['fatherEmail'], keyboardType: TextInputType.emailAddress, onChanged: (v) => _set('fatherEmail', v)),
        ApplyDropdown(label: "Father's Occupation", required: true, value: _f['fatherOccupation'], options: _occupations, onChanged: (v) => _set('fatherOccupation', v ?? '')),
        ApplyField(label: "Father's Organization", required: true, initialValue: _f['fatherOrg'], error: fe['fatherOrg'], onChanged: (v) => _set('fatherOrg', v)),
        ApplyField(label: "Father's Post", initialValue: _f['fatherPost'], onChanged: (v) => _set('fatherPost', v)),
        const SectionLabel("Mother's Details"),
        ApplyHiField(label: "Mother's First & Middle Name", required: true, value: _f['motherFirstMiddle']!, onChanged: (v) => _set('motherFirstMiddle', v), hiValue: _f['motherFirstMiddleHi']!, onHiChanged: (v) => _set('motherFirstMiddleHi', v), error: fe['motherFirstMiddle']),
        ApplyHiField(label: "Mother's Last Name", required: true, value: _f['motherLastName']!, onChanged: (v) => _set('motherLastName', v), hiValue: _f['motherLastNameHi']!, onHiChanged: (v) => _set('motherLastNameHi', v), error: fe['motherLastName']),
        ApplyField(label: "Mother's Phone No.", required: true, initialValue: _f['motherPhone'], error: fe['motherPhone'], keyboardType: TextInputType.phone, onChanged: (v) => _set('motherPhone', v)),
        ApplyField(label: "Mother's Email ID", initialValue: _f['motherEmail'], keyboardType: TextInputType.emailAddress, onChanged: (v) => _set('motherEmail', v)),
        ApplyDropdown(label: "Mother's Occupation", required: true, value: _f['motherOccupation'], options: _occupations, onChanged: (v) => _set('motherOccupation', v ?? '')),
        ApplyField(label: "Mother's Organization", required: true, initialValue: _f['motherOrg'], error: fe['motherOrg'], onChanged: (v) => _set('motherOrg', v)),
        ApplyField(label: "Mother's Post", initialValue: _f['motherPost'], onChanged: (v) => _set('motherPost', v)),
        const SectionLabel('Guardian (optional)'),
        ApplyField(label: 'Guardian Name', initialValue: _f['guardianName'], onChanged: (v) => _set('guardianName', v)),
        ApplyField(label: 'Relationship with Student', initialValue: _f['guardianRelation'], onChanged: (v) => _set('guardianRelation', v)),
        ApplyField(label: 'Guardian Phone (Resi.)', initialValue: _f['guardianPhoneResi'], keyboardType: TextInputType.phone, onChanged: (v) => _set('guardianPhoneResi', v)),
        ApplyField(label: 'Guardian Mobile No.', initialValue: _f['guardianMobile'], keyboardType: TextInputType.phone, onChanged: (v) => _set('guardianMobile', v)),
      ],
    );
  }

  // ---------------- Step 4 ----------------

  Widget _buildStep4(Map<String, String> fe) {
    final coursesAsync = ref.watch(coursesProvider);
    final courses = coursesAsync.valueOrNull ?? const <Course>[];
    final groupCourses = courses.where((c) => (c.group ?? 'Primary') == _f['courseGroup']).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel('Educational Details', topPad: 0),
        ApplyField(label: 'Last Institution Attended', initialValue: _f['lastInstitution'], hintText: 'School / College / University name', onChanged: (v) => _set('lastInstitution', v)),
        ApplyField(label: 'Last Exam Passed Out Year', required: true, initialValue: _f['lastExamYear'], error: fe['lastExamYear'], hintText: 'e.g. 2024', keyboardType: TextInputType.number, onChanged: (v) => _set('lastExamYear', v)),
        ApplyField(label: 'Last Exam Percentage', required: true, initialValue: _f['lastExamPercentage'], error: fe['lastExamPercentage'], hintText: 'e.g. 78%', onChanged: (v) => _set('lastExamPercentage', v)),
        ApplyDropdown(label: 'Result of Qualifying Exam', required: true, value: _f['resultStatus'], options: const ['Pass', 'Supplementary', 'Result Awaited'], onChanged: (v) => _set('resultStatus', v ?? '')),
        ApplyChoiceRow(label: 'Gap Between Study', value: _f['gapInStudy']!, options: const ['No', 'Yes'], onChanged: (v) => _set('gapInStudy', v)),
        ApplyChoiceRow(label: 'Lateral Entry', value: _f['lateralEntry']!, options: const ['No', 'Yes'], onChanged: (v) => _set('lateralEntry', v)),
        ApplyChoiceRow(label: 'Medium', required: true, value: _f['medium']!, options: const ['English', 'Hindi'], onChanged: (v) => _set('medium', v)),
        const SectionLabel('Class Selection'),
        if (fe['courseId'] != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(fe['courseId']!, style: const TextStyle(color: AppColors.danger, fontSize: 11.5))),
        ApplyDropdown(
          label: 'Class Group',
          value: _f['courseGroup'],
          options: _courseGroups,
          onChanged: (v) => setState(() {
            _f['courseGroup'] = v ?? 'Primary';
            _f['courseId'] = '';
            _f['amount'] = '';
            _dirty = true;
            _justSaved = false;
          }),
        ),
        Card(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: fe['courseId'] != null ? AppColors.danger : AppColors.border)),
          margin: const EdgeInsets.only(bottom: 18),
          child: coursesAsync.isLoading
              ? const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
              : groupCourses.isEmpty
                  ? const Padding(padding: EdgeInsets.all(20), child: Center(child: Text('No courses currently offered in this group.', style: TextStyle(color: AppColors.slate))))
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (final c in groupCourses)
                          RadioListTile<String>(
                            value: c.id,
                            groupValue: _f['courseId'],
                            onChanged: (v) => setState(() {
                              _f['courseId'] = c.id;
                              _f['amount'] = (c.admissionFee ?? c.fee) ?? '0';
                              _dirty = true;
                              _justSaved = false;
                            }),
                            title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                            subtitle: Text('Admission Fee: ₹${_inr.format(num.tryParse(c.admissionFee ?? c.fee ?? '0') ?? 0)}'),
                          ),
                      ],
                    ),
        ),
        ApplyField(key: ValueKey('amount-${_f['amount']}'), label: 'Amount', readOnly: true, initialValue: _f['amount']!.isEmpty ? '' : '₹${_inr.format(num.tryParse(_f['amount']!) ?? 0)}', hintText: 'Auto-filled on course selection', onChanged: (_) {}),
        ApplyField(label: 'Remarks', initialValue: _f['remarks'], maxLines: 3, onChanged: (v) => _set('remarks', v)),
      ],
    );
  }

  // ---------------- Step 5 ----------------

  Widget _buildStep5() {
    final missingDocs = _missingAcademicDocuments;
    final paymentsConfigAsync = ref.watch(paymentsConfigProvider);
    final config = paymentsConfigAsync.valueOrNull;
    final amount = num.tryParse(_f['amount'] ?? '') ?? 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel('Academic Details', topPad: 0),
        const Padding(
          padding: EdgeInsets.only(bottom: 12),
          child: Text("Add your previous school/class records, if any (e.g. previous class report card, 10th/12th board result) — you'll need to upload a matching document below for each one.", style: TextStyle(fontSize: 12.5, color: AppColors.slate)),
        ),
        for (final r in _academicRows) _AcademicRowCard(row: r, onChanged: () => setState(() => _dirty = true), onRemove: _academicRows.length > 1 ? () => setState(() => _academicRows.remove(r)) : null),
        Padding(
          padding: const EdgeInsets.only(bottom: 20),
          child: TextButton.icon(
            onPressed: () => setState(() => _academicRows.add(_AcademicRow(localId: _localId('arow')))),
            icon: const Icon(Icons.add, size: 16),
            label: const Text('Add More Details'),
          ),
        ),
        const SectionLabel('Documents'),
        const Padding(
          padding: EdgeInsets.only(bottom: 12),
          child: Text('Upload one document per academic record above (JPG, JPEG, PNG, or GIF, under 5MB each) — the document type must match the academic record it belongs to.', style: TextStyle(fontSize: 12.5, color: AppColors.slate)),
        ),
        for (final r in _documentRows)
          _DocumentRowCard(
            row: r,
            draftReady: _draftId != null,
            onChanged: () => setState(() {}),
            onPick: () => _pickDocumentFile(r),
            onRemove: _documentRows.length > 1 ? () => _removeDocumentRow(r) : null,
          ),
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: TextButton.icon(
            onPressed: () => setState(() => _documentRows.add(_DocumentRow(localId: _localId('drow')))),
            icon: const Icon(Icons.add, size: 16),
            label: const Text('Add More Details'),
          ),
        ),
        if (_attempted && missingDocs.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text('Missing a matching document for: ${missingDocs.map((r) => r.name).join(", ")}.', style: const TextStyle(color: AppColors.danger, fontSize: 11.5)),
          ),
        const SectionLabel('Admission Fee Payment'),
        Card(
          margin: const EdgeInsets.only(bottom: 18),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_payErr.isNotEmpty) ApplyBanner(text: _payErr),
                Text('Admission Fee: ₹${_inr.format(amount)}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
                const SizedBox(height: 4),
                Text(
                  _paidNow ? 'Payment received — thank you.${_admissionTxnId.isNotEmpty ? " Transaction ID: $_admissionTxnId" : ""}' : 'Please pay the admission fee before submitting your application.',
                  style: const TextStyle(color: AppColors.slate, fontSize: 12),
                ),
                const SizedBox(height: 12),
                if (_paidNow)
                  const Chip(avatar: Icon(Icons.check_circle, size: 16, color: AppColors.success), label: Text('Paid'), backgroundColor: AppColors.successBg)
                else if (config?.available == true && _draftId != null)
                  FilledButton.icon(
                    onPressed: _paying || amount <= 0 ? null : _payAdmissionFee,
                    icon: _paying ? const SizedBox(height: 14, width: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.account_balance_wallet, size: 16),
                    label: Text(_paying ? 'Opening Payment…' : 'Pay Now'),
                  )
                else
                  const Text("Online payment isn't available right now.", style: TextStyle(color: AppColors.slate, fontSize: 12)),
              ],
            ),
          ),
        ),
        const SectionLabel('घोषणा (Declaration)'),
        Card(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: _attempted && !_agreeTerms ? AppColors.danger : AppColors.border)),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _agreeTerms,
                  onChanged: (v) => setState(() => _agreeTerms = v ?? false),
                  title: const Text('I agree to the terms and conditions.', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                  subtitle: const Text(
                    'मैंने विद्यालय की प्रवेश नीति एवं नियमों को पढ़ लिया है, यह स्वीकार्य है, तथा इस प्रार्थना पत्र में दी गई समस्त जानकारी सत्य एवं सही है। यदि कोई जानकारी असत्य पाई जाती है, तो विद्यालय मेरा प्रवेश निरस्त करने का अधिकार रखता है।\n\nI have read and accept the school\'s admission policy and rules, will abide by them, and declare that all information in this application is true and correct.',
                    style: TextStyle(fontSize: 12, color: AppColors.slate),
                  ),
                ),
                if (_attempted && !_agreeTerms)
                  const Padding(
                    padding: EdgeInsets.only(top: 4),
                    child: Text('You must accept the terms and conditions before submitting.', style: TextStyle(color: AppColors.danger, fontSize: 11)),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _StepIndicator extends StatelessWidget {
  const _StepIndicator({required this.step});
  final int step;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      color: AppColors.paper,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Step $step of 5 — ${_stepLabels[step - 1]}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: 8),
          Row(
            children: [
              for (var i = 1; i <= 5; i++) ...[
                Expanded(
                  child: Container(
                    height: 4,
                    decoration: BoxDecoration(color: i <= step ? AppColors.maroon : AppColors.border, borderRadius: BorderRadius.circular(2)),
                  ),
                ),
                if (i < 5) const SizedBox(width: 4),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _FileUploadTile extends StatelessWidget {
  const _FileUploadTile({required this.label, required this.hint, required this.fileName, required this.error, required this.onPick});
  final String label;
  final String hint;
  final String fileName;
  final String error;
  final VoidCallback onPick;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.ink)),
          const SizedBox(height: 2),
          Text(hint, style: const TextStyle(fontSize: 11, color: AppColors.slate)),
          const SizedBox(height: 6),
          OutlinedButton.icon(
            onPressed: onPick,
            icon: const Icon(Icons.upload_outlined, size: 16),
            label: Text(fileName.isEmpty ? 'Choose File' : 'Replace'),
          ),
          if (fileName.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text('✓ $fileName', style: const TextStyle(color: AppColors.success, fontSize: 11))),
          if (error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(error, style: const TextStyle(color: AppColors.danger, fontSize: 11))),
        ],
      ),
    );
  }
}

class _AcademicRowCard extends StatelessWidget {
  const _AcademicRowCard({required this.row, required this.onChanged, this.onRemove});
  final _AcademicRow row;
  final VoidCallback onChanged;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: row.name.isEmpty ? null : row.name,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Name *', isDense: true),
                    hint: const Text('Select'),
                    items: [for (final n in _academicNameOptions) DropdownMenuItem(value: n, child: Text(n))],
                    onChanged: (v) {
                      row.name = v ?? '';
                      onChanged();
                    },
                  ),
                ),
                if (onRemove != null) IconButton(icon: const Icon(Icons.delete_outline, size: 20), onPressed: onRemove),
              ],
            ),
            TextFormField(
              initialValue: row.board,
              decoration: const InputDecoration(labelText: 'Board / University *', hintText: 'e.g. CBSE, RBSE', isDense: true),
              onChanged: (v) {
                row.board = v;
                onChanged();
              },
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    initialValue: row.passingYear,
                    decoration: const InputDecoration(labelText: 'Passing Year *', hintText: 'e.g. 2023', isDense: true),
                    onChanged: (v) {
                      row.passingYear = v;
                      onChanged();
                    },
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextFormField(
                    initialValue: row.grade,
                    decoration: const InputDecoration(labelText: 'Grade', hintText: 'e.g. A1, 78%', isDense: true),
                    onChanged: (v) {
                      row.grade = v;
                      onChanged();
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            TextFormField(
              initialValue: row.subject,
              decoration: const InputDecoration(labelText: 'Subject', hintText: 'e.g. Science', isDense: true),
              onChanged: (v) {
                row.subject = v;
                onChanged();
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _DocumentRowCard extends StatelessWidget {
  const _DocumentRowCard({required this.row, required this.draftReady, required this.onChanged, required this.onPick, this.onRemove});
  final _DocumentRow row;
  final bool draftReady;
  final VoidCallback onChanged;
  final VoidCallback onPick;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: row.documentType.isEmpty ? null : row.documentType,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Document *', isDense: true),
                    hint: const Text('Select'),
                    items: [for (final t in _documentTypes) DropdownMenuItem(value: t, child: Text(t, overflow: TextOverflow.ellipsis))],
                    onChanged: (v) {
                      row.documentType = v ?? '';
                      onChanged();
                    },
                  ),
                ),
                if (onRemove != null) IconButton(icon: const Icon(Icons.delete_outline, size: 20), onPressed: onRemove),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: row.originalPhotocopy,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Original / Photocopy', isDense: true),
                    items: const [DropdownMenuItem(value: 'Original', child: Text('Original')), DropdownMenuItem(value: 'Photocopy', child: Text('Photocopy'))],
                    onChanged: (v) {
                      row.originalPhotocopy = v ?? 'Original';
                      onChanged();
                    },
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextFormField(
                    initialValue: row.documentNo,
                    decoration: const InputDecoration(labelText: 'Document No.', hintText: 'Optional', isDense: true),
                    onChanged: (v) {
                      row.documentNo = v;
                      onChanged();
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: !draftReady || row.uploading ? null : onPick,
              icon: const Icon(Icons.upload_outlined, size: 16),
              label: Text(row.uploading ? 'Uploading…' : row.fileName.isNotEmpty ? 'Replace' : 'Choose File'),
            ),
            if (!draftReady) const Padding(padding: EdgeInsets.only(top: 4), child: Text('Save Step 1 first to enable uploads.', style: TextStyle(color: AppColors.slate, fontSize: 11))),
            if (row.fileName.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text('✓ ${row.fileName}', style: const TextStyle(color: AppColors.success, fontSize: 11))),
            if (row.docErr.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(row.docErr, style: const TextStyle(color: AppColors.danger, fontSize: 11))),
          ],
        ),
      ),
    );
  }
}
