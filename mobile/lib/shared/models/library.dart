/// Mirrors server/routes/library.js response shapes (BOOK_TITLE_FIELDS /
/// BOOK_COPY_FIELDS from server/fieldMap.js, plus the bespoke loanToCamel/
/// settingsToCamel shapes for loans and policy settings). See
/// gps-library-management-prd.md for the feature this backs.
library;

class BookTitle {
  BookTitle({
    required this.id,
    required this.title,
    this.authors,
    this.publisher,
    this.isbn,
    this.category = 'Fiction',
    this.readingLevel,
    this.price,
    this.summerList = false,
    this.totalCopies = 0,
    this.availableCopies = 0,
  });

  factory BookTitle.fromJson(Map<String, dynamic> json) => BookTitle(
        id: json['id'] as String,
        title: json['title'] as String? ?? '',
        authors: json['authors'] as String?,
        publisher: json['publisher'] as String?,
        isbn: json['isbn'] as String?,
        category: json['category'] as String? ?? 'Fiction',
        readingLevel: json['readingLevel'] as String?,
        price: (json['price'] as num?)?.toDouble(),
        summerList: json['summerList'] as bool? ?? false,
        totalCopies: (json['totalCopies'] as num?)?.toInt() ?? 0,
        availableCopies: (json['availableCopies'] as num?)?.toInt() ?? 0,
      );

  final String id;
  final String title;
  final String? authors;
  final String? publisher;
  final String? isbn;
  final String category;
  final String? readingLevel;
  final double? price;
  final bool summerList;
  final int totalCopies;
  final int availableCopies;
}

class BookCopy {
  BookCopy({
    required this.id,
    required this.titleId,
    required this.accessionNo,
    this.shelfLocation,
    this.condition = 'Good',
    this.status = 'available',
  });

  factory BookCopy.fromJson(Map<String, dynamic> json) => BookCopy(
        id: json['id'] as String,
        titleId: json['titleId'] as String? ?? '',
        accessionNo: json['accessionNo'] as String? ?? '',
        shelfLocation: json['shelfLocation'] as String?,
        condition: json['condition'] as String? ?? 'Good',
        status: json['status'] as String? ?? 'available',
      );

  final String id;
  final String titleId;
  final String accessionNo;
  final String? shelfLocation;
  final String condition;
  final String status;
}

class BookLoan {
  BookLoan({
    required this.id,
    required this.copyId,
    required this.borrowerType,
    required this.borrowerId,
    this.gradeBand,
    required this.issuedAt,
    required this.dueDate,
    this.returnedAt,
    this.renewedCount = 0,
    this.consequenceType = 'none',
    this.fineAmount = 0,
    this.fineStatus = 'none',
    this.title,
    this.authors,
    this.accessionNo,
    this.borrowerName,
    this.borrowerRef,
  });

  factory BookLoan.fromJson(Map<String, dynamic> json) => BookLoan(
        id: json['id'] as String,
        copyId: json['copyId'] as String? ?? '',
        borrowerType: json['borrowerType'] as String? ?? 'student',
        borrowerId: json['borrowerId'] as String? ?? '',
        gradeBand: json['gradeBand'] as String?,
        issuedAt: json['issuedAt'] as String? ?? '',
        dueDate: json['dueDate'] as String? ?? '',
        returnedAt: json['returnedAt'] as String?,
        renewedCount: (json['renewedCount'] as num?)?.toInt() ?? 0,
        consequenceType: json['consequenceType'] as String? ?? 'none',
        fineAmount: (json['fineAmount'] as num?)?.toDouble() ?? 0,
        fineStatus: json['fineStatus'] as String? ?? 'none',
        title: json['title'] as String?,
        authors: json['authors'] as String?,
        accessionNo: json['accessionNo'] as String?,
        borrowerName: json['borrowerName'] as String?,
        borrowerRef: json['borrowerRef'] as String?,
      );

  final String id;
  final String copyId;
  final String borrowerType;
  final String borrowerId;
  final String? gradeBand;
  final String issuedAt;
  final String dueDate;
  final String? returnedAt;
  final int renewedCount;
  final String consequenceType;
  final double fineAmount;
  final String fineStatus;
  final String? title;
  final String? authors;
  final String? accessionNo;
  final String? borrowerName;
  final String? borrowerRef;

  bool get isReturned => returnedAt != null;

  bool get isOverdue {
    if (isReturned) return false;
    final due = DateTime.tryParse(dueDate);
    if (due == null) return false;
    final today = DateTime.now();
    return due.isBefore(DateTime(today.year, today.month, today.day));
  }
}

class LibrarySettings {
  LibrarySettings({
    required this.gradeBand,
    required this.loanPeriodDays,
    required this.maxSimultaneousLoans,
    required this.consequenceType,
    required this.dailyFineRate,
    required this.fineCap,
    required this.renewalLimit,
  });

  factory LibrarySettings.fromJson(Map<String, dynamic> json) => LibrarySettings(
        gradeBand: json['gradeBand'] as String? ?? '',
        loanPeriodDays: (json['loanPeriodDays'] as num?)?.toInt() ?? 14,
        maxSimultaneousLoans: (json['maxSimultaneousLoans'] as num?)?.toInt() ?? 3,
        consequenceType: json['consequenceType'] as String? ?? 'hold',
        dailyFineRate: (json['dailyFineRate'] as num?)?.toDouble() ?? 0,
        fineCap: (json['fineCap'] as num?)?.toDouble() ?? 0,
        renewalLimit: (json['renewalLimit'] as num?)?.toInt() ?? 2,
      );

  final String gradeBand;
  final int loanPeriodDays;
  final int maxSimultaneousLoans;
  final String consequenceType;
  final double dailyFineRate;
  final double fineCap;
  final int renewalLimit;
}

class ReadingRecord {
  ReadingRecord({required this.booksRead, required this.milestonesReached, this.nextMilestone});

  factory ReadingRecord.fromJson(Map<String, dynamic> json) => ReadingRecord(
        booksRead: (json['booksRead'] as num?)?.toInt() ?? 0,
        milestonesReached: (json['milestonesReached'] as List? ?? const []).map((e) => (e as num).toInt()).toList(),
        nextMilestone: (json['nextMilestone'] as num?)?.toInt(),
      );

  final int booksRead;
  final List<int> milestonesReached;
  final int? nextMilestone;
}

/// The same grade bands used for classes/courses (courses.course_group on
/// the server) — reused here rather than inventing a separate vocabulary,
/// same reasoning as the web app's COURSE_GROUPS constant.
const kLibraryGradeBands = ['Pre-Primary', 'Primary', 'Middle', 'Secondary', 'Senior Secondary'];

const kBookCategories = ['Picture Book', 'Early Reader', 'Fiction', 'Non-Fiction', 'Reference', 'Periodical/Magazine'];

const kConsequenceLabels = {'none': 'No consequence', 'hold': 'Borrowing hold', 'fine': 'Monetary fine'};
