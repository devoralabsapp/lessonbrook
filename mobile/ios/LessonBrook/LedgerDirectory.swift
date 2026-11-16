import SwiftUI
import OSLog

enum LedgerKind: String {
    case students, classes, sessions, lessons, statements

    var endpoint: String { "/api/" + rawValue }
    var title: String {
        switch self {
        case .students: return "Students"
        case .classes: return "Classes"
        case .sessions, .lessons: return "Lessons"
        case .statements: return "Statements"
        }
    }
    var addTitle: String {
        switch self {
        case .students: return "Add student"
        case .classes: return "Add class"
        case .sessions, .lessons: return "Record lesson"
        case .statements: return "Create statement"
        }
    }
    var hasCalendar: Bool { self == .classes || self == .sessions }

    func route(_ record: LedgerRecord) -> WorkspaceRoute {
        switch self {
        case .students: return .student(record.id)
        case .classes: return .teachingClass(record.id)
        case .sessions:
            return record.string("lessonId").map(WorkspaceRoute.lesson) ?? .session(record.id)
        case .lessons: return .lesson(record.id)
        case .statements: return .statement(record.id)
        }
    }
}

enum LedgerPeriod: String, CaseIterable {
    case today = "Today", week = "This week", month = "This month", all = "All time", custom = "Custom"

    var dates: (String?, String?) {
        switch self {
        case .today: return (LedgerDate.today, LedgerDate.today)
        case .week: return LedgerDate.range(.weekOfYear)
        case .month: return LedgerDate.range(.month)
        default: return (nil, nil)
        }
    }
}

struct LedgerDirectory: View {
    private enum Layout: String, CaseIterable {
        case notes = "Notes", list = "List", calendar = "Month calendar"
    }
    let kind: LedgerKind
    let relation: [String: String]
    let embedded: Bool
    @EnvironmentObject private var store: WorkspaceStore
    @Environment(\.dynamicTypeSize) private var textSize
    @State private var layout = Layout.notes
    @State private var search = ""
    @State private var archived = false
    @State private var status = "all"
    @State private var type = "all"
    @State private var billing = "all"
    @State private var period: LedgerPeriod
    @State private var from = Date()
    @State private var to = Date()
    @State private var student = ""
    @State private var selectedClass = ""
    @State private var classes: [LedgerRecord] = []
    @State private var searchBy = "student"
    @State private var recordEditing: LedgerRecord?
    @State private var archiveRecord: LedgerRecord?
    @State private var items: [LedgerRecord] = []
    @State private var cursor: String?
    @State private var ready = false
    @State private var loadedPath: String?
    @State private var loadingMore = false
    @State private var error: String?
    @State private var editing = false
    @State private var month = Date()
    @State private var selectedCalendarDay = LedgerDate.today
    @State private var selecting = false
    @State private var selected: Set<String> = []
    private static let logger = Logger(subsystem: "tech.devoralabs.lessonbrook", category: "performance")

    init(_ kind: LedgerKind, relation: [String: String] = [:], embedded: Bool = false) {
        self.kind = kind
        self.relation = relation
        self.embedded = embedded
        _period = State(initialValue: relation.isEmpty ? .month : .all)
    }

    private var query: [String: String] {
        var query = relation
        switch kind {
        case .students, .classes:
            query["q"] = String(search.trimmingCharacters(in: .whitespacesAndNewlines).prefix(100))
            query["archived"] = String(archived)
            query["order"] = kind == .students ? "name" : "schedule"
        case .sessions, .statements:
            let dates = layout == .calendar ? LedgerDate.range(.month, at: month) :
                period == .custom ? (LedgerDate.text(from), LedgerDate.text(to)) : period.dates
            query["from"] = dates.0
            query["to"] = dates.1
            query["status"] = status
            if !student.isEmpty && (kind == .statements || searchBy == "student") { query["studentId"] = student }
            if kind == .sessions {
                query["order"] = "chronological"
                query["type"] = type
                query["billing"] = billing
                if !selectedClass.isEmpty && searchBy == "class" { query["classId"] = selectedClass }
            }
        case .lessons:
            query["order"] = "chronological"
        }
        return query
    }

    private var directoryTitle: String {
        switch kind {
        case .students: return "Student list"
        case .classes: return "Class list"
        case .statements: return "Statement list"
        default: return "Lesson list"
        }
    }
    private var pageTitle: String {
        switch kind {
        case .students: return "Your students"
        case .statements: return "Tuition statements"
        case .sessions: return "Lesson ledger"
        default: return kind.title
        }
    }
    private var description: String {
        switch kind {
        case .students: return "Manage student profiles and contact information."
        case .classes: return "Organise students into classes, record one lesson and track each person's tuition separately."
        case .statements: return "Reconcile each lesson and finalise the amount to collect."
        default: return "Record each lesson and track tuition accurately."
        }
    }
    var body: some View {
        Group {
            if embedded {
                directoryCard
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        pageHeading
                        directoryCard
                    }
                    .padding(12).padding(.bottom, 4)
                }
            }
        }
        .background(store.palette.background).foregroundStyle(store.palette.foreground)
        .font(store.palette.font())
        .refreshable { await load(refresh: true) }
        .task(id: ledgerPath(kind.endpoint, query) + "#\(layout.rawValue)#\(store.revision)") { await load() }
        .sheet(isPresented: $editing) { addEditor }
        .sheet(item: $recordEditing) { item in
            switch kind {
            case .students: StudentEditor(record: item)
            case .classes: ClassEditor(record: item)
            default: LessonEditor(record: item, editingGroup: kind == .lessons)
            }
        }
        .confirmationDialog(store.t("Archive"), isPresented: Binding(get: { archiveRecord != nil }, set: { if !$0 { archiveRecord = nil } })) {
            if let item = archiveRecord {
                Button(store.t(item.string("archivedAt") == nil ? "Archive" : "Restore")) {
                    Task {
                        do { _ = try await store.write(kind.endpoint + "/" + item.id + "/archive", body: ["archived": .flag(item.string("archivedAt") == nil)]) }
                        catch { self.error = store.t(error.localizedDescription) }
                        archiveRecord = nil
                    }
                }
            }
        }
    }
    private var pageHeading: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(store.t("Lesson & tuition ledger").uppercased()).font(store.palette.font(11, .semibold)).tracking(1.8)
            Text(store.t(pageTitle)).font(store.palette.font(25, .heavy)).accessibilityAddTraits(.isHeader)
            Text(store.t(description)).font(store.palette.font(15)).foregroundStyle(store.palette.secondaryInk).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                if kind == .sessions {
                    NavigationLink(value: WorkspaceRoute.schedule) { Label(store.t("Upcoming lessons"), systemImage: "calendar") }
                        .buttonStyle(WorkspaceOutlineButton(palette: store.palette))
                }
                if kind == .statements {
                    NavigationLink(value: WorkspaceRoute.createStatement(relation["studentId"])) {
                        Text(store.t(kind.addTitle))
                    }
                    .buttonStyle(WorkspaceActionButton(palette: store.palette))
                } else {
                    Button { editing = true } label: { Label(store.t(kind.addTitle), systemImage: "plus") }
                        .buttonStyle(WorkspaceActionButton(palette: store.palette))
                }
            }.padding(.top, 4)
        }
    }

    private var directoryCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            controls
            Divider().overlay(store.palette.border)
            if kind == .students || kind == .classes {
                let students = kind == .students
                WorkspaceField(store.t(students ? "Find a student" : "Search classes by name"), text: $search,
                               placeholder: store.t(students ? "Enter a name, with or without accents" : "With or without accents"))
                    .padding(12)
            } else if kind == .sessions || kind == .statements { filters.padding(12) }
            Divider().overlay(store.palette.border)
            if kind == .sessions && selecting && layout != .calendar { selectionControls.padding(12) }
            if let error { LedgerError(message: error) { Task { await load(refresh: true) } } }
            if !ready { ProgressView().frame(maxWidth: .infinity, minHeight: 64) }
            else if layout == .calendar { LedgerMonth(kind: kind, records: items, month: $month, selected: $selectedCalendarDay).padding(10) }
            else if items.isEmpty { Text(store.t("No records found.")).padding(16) }
            else {
                Group {
                    if pairedNotes {
                        notePairs
                    } else {
                        LazyVStack(spacing: layout == .notes ? 10 : 0) {
                            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in row(item, index: index) }
                        }
                    }
                }.padding(.horizontal, layout == .notes ? 6 : 0).padding(.vertical, layout == .notes ? 16 : 0)
                if cursor != nil {
                    Button(store.t("Load more")) { Task { await more() } }
                        .buttonStyle(WorkspaceOutlineButton(palette: store.palette)).disabled(loadingMore)
                        .frame(maxWidth: .infinity).padding(12)
                }
            }
        }.modifier(WorkspacePanel(palette: store.palette, fill: store.palette.surface))
    }

    private var pairedNotes: Bool { layout == .notes && kind != .statements && !textSize.isAccessibilitySize }

    private var notePairs: some View {
        let rows = stride(from: 0, to: items.count, by: 2).map { $0 }
        return LazyVStack(spacing: 10) {
            ForEach(rows, id: \.self) { index in
                HStack(spacing: 8) {
                    row(items[index], index: index)
                    if index + 1 < items.count {
                        row(items[index + 1], index: index + 1)
                    } else {
                        Color.clear.frame(maxWidth: .infinity, maxHeight: 0).accessibilityHidden(true)
                    }
                }.fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var controls: some View {
        let p = store.palette
        let label = VStack(alignment: .leading, spacing: 3) {
            Text(store.t(directoryTitle)).font(p.font(15, .heavy))
            if kind != .statements {
                Text(store.t(kind == .classes ? "Select a name to open the class" : kind == .students ? "Select a name to open that student's ledger" : "Each lesson keeps its own price"))
                    .font(p.font(13)).foregroundStyle(p.secondaryInk).fixedSize(horizontal: false, vertical: true)
            }
        }
        return Group {
            if kind == .students || kind == .classes {
                VStack(alignment: .leading, spacing: 8) {
                    label
                    HStack(spacing: 8) {
                        viewButtons
                        WorkspaceChoice(label: store.t("Status"), selection: $archived,
                            options: [(false, store.t("Active")), (true, store.t("Archived"))], compact: true)
                            .frame(width: 92)
                    }
                }
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) {
                        label.fixedSize()
                        Spacer(minLength: 0)
                        viewButtons
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        label
                        viewButtons
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
    }

    private var viewButtons: some View {
        HStack(spacing: 5) {
            ForEach(kind.hasCalendar ? [Layout.list, .notes, .calendar] : [.list, .notes], id: \.self) { option in
                Button {
                    if option == .calendar && layout != .calendar {
                        month = .now
                        selecting = false
                        selected.removeAll()
                    }
                    layout = option
                } label: {
                    Image(systemName: option == .list ? "list.bullet" : option == .notes ? "note" : "calendar")
                        .frame(width: 18, height: 20)
                }
                .buttonStyle(WorkspaceViewButton(palette: store.palette, active: layout == option))
                .accessibilityLabel(store.t(option.rawValue))
                .accessibilityAddTraits(layout == option ? .isSelected : [])
            }
        }
        .fixedSize(horizontal: true, vertical: false)
    }
    private var startBinding: Binding<Date> { Binding(get: { dateBounds.0 }, set: {
        let end = dateBounds.1; from = $0; to = end; period = .custom
    }) }
    private var endBinding: Binding<Date> { Binding(get: { dateBounds.1 }, set: {
        let start = dateBounds.0; from = start; to = $0; period = .custom
    }) }
    private var dateBounds: (Date, Date) {
        if period == .custom { return (from, to) }
        let dates = period.dates
        return (LedgerDate.date(dates.0 ?? "") ?? .now, LedgerDate.date(dates.1 ?? "") ?? .now)
    }
    private var filters: some View {
        VStack(alignment: .leading, spacing: 10) {
            if kind == .statements {
                if relation["studentId"] == nil { LearnerPicker(selected: $student, includeArchived: true, allOption: true) }
                HStack(alignment: .top, spacing: 10) {
                    WorkspaceChoice(label: store.t("Statement status"), selection: $status, options: statusOptions)
                    WorkspaceChoice(label: store.t("Statement date"), selection: $period,
                                    options: LedgerPeriod.allCases.map { ($0, store.t($0.rawValue)) })
                }
                if period == .custom { dateFields }
            } else {
                if layout != .calendar { dateFields }
                if relation["studentId"] == nil && relation["classId"] == nil {
                    HStack(alignment: .top, spacing: 10) {
                        WorkspaceChoice(label: store.t("Search by"), selection: $searchBy,
                            options: [("student", store.t("Search by student")), ("class", store.t("Search by group/class"))])
                        if searchBy == "student" { LearnerPicker(selected: $student, includeArchived: true, allOption: true) }
                        else {
                            WorkspaceChoice(label: store.t("Group or class"), selection: $selectedClass,
                                options: [("", store.t("All groups and classes"))] + classes.map { ($0.id, $0.name) })
                        }
                    }
                }
                HStack(alignment: .top, spacing: 10) {
                    WorkspaceChoice(label: store.t("Lesson status"), selection: $status, options: statusOptions)
                    WorkspaceChoice(label: store.t("Payment status"), selection: $billing,
                        options: [("all", store.t("All"))] + ["paid", "unpaid", "free"].map { ($0, store.t(ledgerStatus($0))) })
                }
                WorkspaceChoice(label: store.t("Lesson type"), selection: $type,
                    options: [("all", store.t("All")), ("individual", store.t("One student")), ("group", store.t("Custom student group")), ("class", store.t("A class"))])
                HStack(spacing: 4) {
                    if layout != .calendar {
                        Button(store.t("Today")) { period = .today }
                        Button(store.t("This month")) { period = .month }
                    }
                    Button(store.t("Clear filters")) { period = .all; status = "all"; billing = "all"; type = "all"; student = ""; selectedClass = "" }
                    if layout != .calendar {
                        Button(store.t(selecting ? "Done selecting" : "Select")) { selecting.toggle(); selected.removeAll() }
                    }
                }.font(store.palette.font(12, .bold)).buttonStyle(WorkspaceOutlineButton(palette: store.palette, compact: true))
            }
        }
        .task(id: store.revision) {
            if kind == .sessions && relation["studentId"] == nil && relation["classId"] == nil {
                do { classes = try await store.all("/api/classes", query: ["order": "schedule", "archived": "all"]) }
                catch { if !Task.isCancelled { self.error = store.t(error.localizedDescription) } }
            }
        }
    }
    private var dateFields: some View {
        HStack(alignment: .top, spacing: 10) {
            WorkspaceDatePicker(store.t("From date"), selection: startBinding, placeholder: period == .all ? "dd/mm/yyyy" : nil)
            WorkspaceDatePicker(store.t("To date"), selection: endBinding, placeholder: period == .all ? "dd/mm/yyyy" : nil)
        }
    }
    private var statusOptions: [(String, String)] {
        [("all", store.t("All"))] + (kind == .sessions ? ["planned", "completed", "cancelled"] : ["unpaid", "paid", "overdue", "draft", "void"]).map { ($0, store.t(ledgerStatus($0))) }
    }

    private var selectionControls: some View {
        HStack {
            Button(store.t("Select all planned")) {
                Task {
                    do {
                        if status == "all" || status == "planned" {
                            var parameters = query
                            parameters["status"] = "planned"
                            selected = Set(try await store.all(kind.endpoint, query: parameters).prefix(100).map(\.id))
                        }
                    } catch { self.error = store.t(error.localizedDescription) }
                }
            }
            Spacer()
            Button(store.t("Complete") + " (\(selected.count))") {
                Task {
                    do {
                        _ = try await store.write("/api/sessions/complete", body: ["ids": .strings(selected.sorted())])
                        selected.removeAll()
                        selecting = false
                    } catch { self.error = store.t(error.localizedDescription) }
                }
            }.disabled(selected.isEmpty || store.saving)
        }
        .font(.footnote.weight(.semibold))
        .padding(.vertical, 4)
    }

    @ViewBuilder private func row(_ item: LedgerRecord, index: Int) -> some View {
        LedgerRow(kind: kind, item: item, note: layout == .notes, index: index, paired: pairedNotes,
                  selecting: selecting, checked: selected.contains(item.id),
                  select: {
                    if selected.contains(item.id) { selected.remove(item.id) }
                    else if selected.count < 100 { selected.insert(item.id) }
                  }, edit: {
                    Task {
                        do {
                            recordEditing = kind == .classes ? try await store.read(kind.endpoint + "/" + item.id) : item
                        } catch { self.error = store.t(error.localizedDescription) }
                    }
                  }, archive: { archiveRecord = item })
    }

    @ViewBuilder private var addEditor: some View {
        switch kind {
        case .students: StudentEditor()
        case .classes: ClassEditor()
        case .sessions, .lessons:
            LessonEditor(classID: relation["classId"], studentID: relation["studentId"])
        case .statements: EmptyView()
        }
    }

    private func load(refresh: Bool = false) async {
        let start = ProcessInfo.processInfo.systemUptime
        let filters = query
        let currentLayout = layout
        error = nil
        let path = ledgerPath(kind.endpoint, filters) + currentLayout.rawValue
        if loadedPath != path { ready = false; items = []; cursor = nil }
        selected.removeAll()
        do {
            if currentLayout == .calendar {
                let loaded = try await store.all(kind.endpoint, query: filters, refresh: refresh)
                try Task.checkCancellation()
                items = loaded
                cursor = nil
            } else {
                let page = try await store.page(ledgerPath(kind.endpoint, filters), refresh: refresh)
                try Task.checkCancellation()
                items = page.items
                cursor = page.nextCursor
            }
            loadedPath = path
            ready = true
            let ms = Int((ProcessInfo.processInfo.systemUptime - start) * 1000)
            Self.logger.debug("Directory loaded: \(self.kind.rawValue, privacy: .public) \(ms, privacy: .public) ms")
        } catch {
            if !Task.isCancelled { self.error = store.t(error.localizedDescription); ready = true }
        }
    }

    private func more() async {
        guard let cursor, !loadingMore else { return }
        loadingMore = true
        defer { loadingMore = false }
        let parameters = query
        var next = parameters
        next["cursor"] = cursor
        do {
            let page = try await store.page(ledgerPath(kind.endpoint, next))
            guard parameters == query, layout != .calendar else { return }
            var known = Set(items.map(\.id))
            items.append(contentsOf: page.items.filter { known.insert($0.id).inserted })
            self.cursor = page.nextCursor == cursor ? nil : page.nextCursor
        } catch { self.error = store.t(error.localizedDescription) }
    }
}

func ledgerStatus(_ code: String) -> String {
    switch code {
    case "planned": return "Planned"
    case "completed": return "Completed"
    case "cancelled", "void": return "Cancelled"
    case "paid": return "Paid"
    case "unpaid": return "Unpaid"
    case "free", "no_charge": return "No charge"
    case "overdue": return "Overdue"
    case "draft": return "Draft"
    default: return code
    }
}

struct LedgerBadge: View {
    @EnvironmentObject private var store: WorkspaceStore
    let code: String
    var compact = false
    var fontIncrease: CGFloat = 0
    var body: some View {
        let color = code == "paid" || code == "completed" ? store.palette.mint :
            ["unpaid", "cancelled", "void", "overdue"].contains(code) ? Color(red: 0.98, green: 0.62, blue: 0.67) : store.palette.yellow
        Text(store.t(ledgerStatus(code)))
            .modifier(LedgerBadgeFrame(palette: store.palette, fill: color, ink: store.palette.dashboardInk, compact: compact, fontIncrease: fontIncrease))
    }
}

func ledgerSessionPayment(_ record: LedgerRecord) -> String? {
    if let status = record.string("paymentStatus") { return status }
    return record.text("status") == "planned" && record.flag("billable") ? nil : "no_charge"
}

private struct LedgerBadgeFrame: ViewModifier {
    let palette: WorkspacePalette
    let fill: Color
    let ink: Color
    var compact = false
    var fontIncrease: CGFloat = 0

    func body(content: Content) -> some View {
        content.font(palette.font((compact ? 11 : 12) + fontIncrease, .bold))
            .padding(.horizontal, compact ? 4 : 7).padding(.vertical, compact ? 2 : 3)
            .foregroundStyle(ink)
            .background(fill, in: Capsule())
            .overlay(Capsule().stroke(palette.border, lineWidth: palette.outline))
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct LedgerRow: View {
    @EnvironmentObject private var store: WorkspaceStore
    let kind: LedgerKind
    let item: LedgerRecord
    let note: Bool
    let index: Int
    var paired = false
    var selecting = false
    var checked = false
    var select: () -> Void = {}
    var edit: () -> Void = {}
    var archive: () -> Void = {}
    @Environment(\.dynamicTypeSize) private var textSize
    private var people: Bool { kind == .students || kind == .classes }
    private var p: WorkspacePalette { store.palette }
    private var paper: Color { workspacePaperColor(item.id) }
    private var paperIntensity: Double {
        switch kind {
        case .students: return p.dark ? 0.30 : 0.56
        case .classes: return p.dark ? 0.30 : 0.56
        case .statements: return p.dark ? 0.37 : 0.94
        case .sessions, .lessons: return p.dark ? 0.25 : 0.70
        }
    }
    private var compactLessonNote: Bool { paired && !people }
    private var pinPositions: [CGFloat] { [0.28, 0.78, 0.43, 0.66, 0.5] }
    private var payment: String? {
        if kind == .statements { return item.text("status") == "issued" ? (item.int("totalVnd") == item.int("paidVnd") ? "paid" : "unpaid") : nil }
        return ledgerSessionPayment(item)
    }
    var body: some View {
        Group {
            if note {
                noteCard.accessibilityElement(children: .contain)
                    .accessibilityIdentifier("ledger-note-\(item.id)")
            } else {
                content.padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .modifier(WorkspaceListTone(palette: p, color: listColor))
                    .overlay(alignment: .bottom) { Rectangle().fill(p.border).frame(height: 1) }
            }
        }.foregroundStyle(p.foreground).font(p.font(14))
    }
    private var noteCard: some View {
        content.padding(.horizontal, paired ? 7 : 12).padding(.top, compactLessonNote ? 19 : 24)
            .padding(.bottom, paired ? 6 : 10)
            .frame(maxWidth: .infinity, maxHeight: paired ? .infinity : nil, alignment: .topLeading)
            .background {
                let shape = WorkspacePaperShape(radius: min(16, p.radius))
                shape.fill(p.surface).overlay(shape.fill(paper.opacity(paperIntensity)))
                    .overlay(shape.stroke(p.dark ? paper.opacity(0.65) : p.border, lineWidth: p.outline))
                    .background(shape.fill(p.border).offset(x: p.shadowOffset, y: p.shadowOffset))
            }
            .overlay(alignment: .bottomTrailing) {
                Path { path in
                    path.move(to: .zero)
                    path.addLine(to: CGPoint(x: 12, y: 0))
                    path.addLine(to: CGPoint(x: 0, y: 12))
                    path.closeSubpath()
                }
                .fill(paper.opacity(0.7)).frame(width: 12, height: 12).allowsHitTesting(false)
            }
            .overlay(alignment: .top) {
                GeometryReader { proxy in
                    NativeNotePin().scaleEffect(1.3)
                        .rotationEffect(.degrees([-18.0,32,-28,14,24][index % 5]))
                        .position(x: proxy.size.width * pinPositions[index % 5], y: 3)
                }.allowsHitTesting(false).accessibilityHidden(true)
            }
            .padding(.vertical, 4)
    }
    private var listColor: Color {
        if kind == .statements { return payment == "paid" ? p.mint : Color(red: 1, green: 0.53, blue: 0.69) }
        return index % 2 == 0 ? p.blue : p.mint
    }
    @ViewBuilder private var content: some View {
        if people {
            if note || textSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    personLink
                    personActions.frame(maxWidth: .infinity, alignment: note ? .leading : .trailing)
                }
            } else {
                HStack(alignment: .center, spacing: 12) {
                    personLink
                    personActions.fixedSize(horizontal: true, vertical: false)
                }
            }
        } else if kind == .statements {
            NavigationLink(value: kind.route(item)) { statement }.buttonStyle(.plain)
        } else { lesson }
    }
    private var personLink: some View {
        NavigationLink(value: kind.route(item)) { identity.contentShape(Rectangle()) }.buttonStyle(.plain)
            .accessibilityIdentifier("ledger-person-\(item.id)")
    }
    private var personActions: some View {
        HStack(spacing: 12) {
            Button(action: edit) { Text(store.t("Edit")).frame(minHeight: note ? 34 : 44).contentShape(Rectangle()) }
            Button(action: archive) {
                Text(store.t(item.string("archivedAt") == nil ? "Archive" : "Restore"))
                    .frame(minHeight: note ? 34 : 44).contentShape(Rectangle())
            }
        }.font(p.font(note ? 13 : 14)).underline().buttonStyle(.plain)
    }
    private var identity: some View {
        HStack(alignment: .top, spacing: note ? 5 : 8) {
            Text(String(item.name.prefix(1)).uppercased()).font(p.font(note ? 15 : 19, .bold))
                .frame(width: note ? 24 : 36, height: note ? 24 : 36)
                .background(p.retroRows ? p.yellow : p.recordAccent, in: RoundedRectangle(cornerRadius: 4))
                .foregroundStyle(p.retroRows ? p.dashboardInk : p.foreground).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(item.name).font(p.font(note ? 15 : 17, .heavy)).fixedSize(horizontal: false, vertical: true)
                let detail = kind == .classes ? "\(item.strings("studentIds").count) " + store.t("students") :
                    [item.text("contactName"), item.text("phone")].filter { !$0.isEmpty }.joined(separator: " · ")
                if !detail.isEmpty { Text(detail).font(p.font(13)).foregroundStyle(p.secondaryInk).fixedSize(horizontal: false, vertical: true) }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.padding(note ? 5 : 8).frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: min(12, p.radius)).fill(p.surface)
                    .overlay(RoundedRectangle(cornerRadius: min(12, p.radius)).fill((note ? paper : p.recordAccent).opacity(p.dark ? 0.35 : 0.7)))
            }
            .overlay(RoundedRectangle(cornerRadius: min(12, p.radius)).stroke(p.controlTint, lineWidth: 2))
    }
    @ViewBuilder private var lesson: some View {
        if compactLessonNote {
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .top, spacing: 4) {
                    lessonName
                        .frame(maxWidth: .infinity, alignment: .leading)
                    lessonEdit
                }
                lessonGroupLink
                HStack(alignment: .center, spacing: 6) {
                    LessonDateBadge(date: item.text("sessionDate"), compact: true, fontIncrease: 2)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(dateText(item.text("sessionDate"))).font(p.font(13))
                        if !item.text("startTime").isEmpty {
                            Text(item.text("startTime")).font(p.font(13, .semibold))
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    lessonSelection
                }
                lessonPriceAndDuration(size: 13)
                Spacer(minLength: 0)
                Divider().overlay(p.border)
                HStack(spacing: 3) {
                    lessonBadges(compact: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("lesson-note-actions-\(item.id)")
            }
        } else if note {
            VStack(alignment: .leading, spacing: 5) {
                lessonSummary.frame(maxWidth: .infinity)
                Divider().overlay(p.border)
                WorkspaceActionRows(spacing: 7) {
                    lessonActions
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("lesson-note-actions-\(item.id)")
            }
        } else {
            HStack(alignment: .center, spacing: 10) {
                lessonSummary.frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 5) {
                    lessonActions
                }
                .fixedSize(horizontal: !textSize.isAccessibilitySize, vertical: false)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("lesson-list-actions-\(item.id)")
            }
        }
    }

    private var lessonSummary: some View {
        HStack(alignment: .center, spacing: 9) {
            lessonSelection
            LessonDateBadge(date: item.text("sessionDate"), fontIncrease: note ? 2 : 0)
            VStack(alignment: .leading, spacing: note ? 2 : 4) {
                lessonName
                lessonGroupLink
                Text(lessonDateTime)
                    .font(p.font(note ? 15 : 13)).lineLimit(1).minimumScaleFactor(0.8)
                lessonPriceAndDuration(size: note ? 15 : 13)
            }
        }
    }

    @ViewBuilder private var lessonSelection: some View {
        if selecting && item.text("status") == "planned" {
            Button(action: select) {
                Image(systemName: checked ? "checkmark.square.fill" : "square")
                    .font(.system(size: compactLessonNote ? 17 : 21)).frame(width: 24, height: 44)
                    .contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel(store.t("Select"))
        }
    }

    private var lessonName: some View {
        NavigationLink(value: item.string("studentId").map(WorkspaceRoute.student) ?? kind.route(item)) {
            Text(item.string("studentName") ?? item.string("className") ?? store.t("Group lesson"))
                .font(p.font((compactLessonNote ? 13 : 15) + (note ? 2 : 0), .bold))
                .fixedSize(horizontal: false, vertical: compactLessonNote)
        }.buttonStyle(.plain)
    }

    @ViewBuilder private var lessonGroupLink: some View {
        if let lessonID = item.string("lessonId") {
            NavigationLink(value: WorkspaceRoute.lesson(lessonID)) {
                Text(item.string("className") ?? store.t("Custom student group"))
                    .font(p.font((compactLessonNote ? 11 : 12) + (note ? 2 : 0))).underline()
                    .fixedSize(horizontal: false, vertical: compactLessonNote)
            }.buttonStyle(.plain)
        }
    }

    private var lessonDateTime: String {
        [dateText(item.text("sessionDate")), item.text("startTime")].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func lessonPriceAndDuration(size: CGFloat) -> some View {
        let price = item.flag("billable") ? store.money(item.int(item.text("status") == "completed" ? "amountVnd" : "rateVnd")) : store.t("Free")
        let amount = Text(compactLessonNote ? price : "· " + price).font(p.font(size, .bold))
        let duration = item.int("durationMinutes")
        return HStack(spacing: 3) {
            amount.fixedSize(horizontal: compactLessonNote, vertical: false)
            if duration > 0 {
                Text("· \(duration) " + store.t("minutes")).font(p.font(size))
                    .fixedSize(horizontal: false, vertical: compactLessonNote)
            }
        }
    }

    @ViewBuilder private var lessonActions: some View {
        lessonBadges()
        lessonEdit
    }

    @ViewBuilder private func lessonBadges(compact: Bool = false) -> some View {
        LedgerBadge(code: item.text("status"), compact: compact, fontIncrease: note ? 2 : 0)
        if let payment { LedgerBadge(code: payment, compact: compact, fontIncrease: note ? 2 : 0) }
    }

    @ViewBuilder private var lessonEdit: some View {
        let editDisabled = item.string("billedStatementId") != nil || store.saving
        if note {
            Button(action: edit) {
                Text(store.t("Edit"))
                    .modifier(LedgerBadgeFrame(palette: p, fill: p.surface, ink: p.foreground, compact: compactLessonNote, fontIncrease: 2))
                    .frame(minWidth: compactLessonNote ? 28 : 44, minHeight: 44, alignment: compactLessonNote ? .topTrailing : .center)
                    .padding(.top, compactLessonNote ? 2 : 0)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .opacity(editDisabled ? 0.45 : 1)
            .disabled(editDisabled)
            .accessibilityIdentifier("lesson-note-edit-\(item.id)")
        } else {
            Button(action: edit) { Text(store.t("Edit")).frame(minWidth: 36) }
                .buttonStyle(WorkspaceOutlineButton(palette: p, compact: true, cornerRadius: min(8, p.fieldRadius)))
                .disabled(editDisabled)
        }
    }

    private var statement: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                Text((item.string("number") ?? store.t("Draft")) + " · " + (item.object("recipientSnapshot")?.name ?? ""))
                    .font(p.font(15, .bold)).fixedSize(horizontal: false, vertical: true)
                if payment == nil { LedgerBadge(code: item.text("status")) }
            }
            Text(dateText(item.text("periodStart")) + " – " + dateText(item.text("periodEnd")) + " · \(item.objects("items").count) " + store.t("lessons"))
                .font(p.font(13))
            Text(store.t(item.string("issueDate") == nil ? "Created:" : "Issued:") + " " + dateText(item.string("issueDate") ?? String(item.text("createdAt").prefix(10))))
                .font(p.font(13))
            HStack {
                Text(store.t("Due") + " " + dateText(item.text("dueDate"))).font(p.font(13))
                Spacer(minLength: 4)
                Text(store.money(item.int("totalVnd"))).font(p.font(17, .bold))
            }
            if let payment {
                HStack {
                    Text(store.t("Remaining:") + " " + store.money(max(0, item.int("totalVnd") - item.int("paidVnd")))).font(p.font(13))
                    Spacer(minLength: 4)
                    LedgerBadge(code: payment)
                }
            }
        }
    }
    private func dateText(_ value: String) -> String {
        LedgerDate.date(value)?.formatted(.dateTime.day().month(.abbreviated).year().locale(store.language)) ?? value
    }
}

struct LessonDateBadge: View {
    @EnvironmentObject private var store: WorkspaceStore
    let date: String
    var compact = false
    var fontIncrease: CGFloat = 0
    var body: some View {
        let p = store.palette
        let shape = RoundedRectangle(cornerRadius: min(compact ? 8 : 12, p.radius))
        let actual = LedgerDate.date(date) ?? .now
        VStack(spacing: 0) {
            Text(actual.formatted(.dateTime.month(.abbreviated).locale(store.language)).uppercased())
                .font(p.font((compact ? 9 : 11) + fontIncrease, .bold)).lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity).padding(.vertical, compact ? 2 : 4)
                .background(p.retroRows ? p.yellow : p.accent).foregroundStyle(p.onAccent)
            Text(String(date.suffix(2))).font(p.font((compact ? 15 : 22) + fontIncrease, .heavy))
                .frame(maxWidth: .infinity).padding(.vertical, compact ? 2 : 4)
                .background(p.retroRows ? p.blue : p.recordAccent)
        }.frame(width: compact ? 48 : 72)
            .background(p.retroRows ? p.blue : p.recordAccent)
            .clipShape(shape)
            .overlay(shape.strokeBorder(p.border, lineWidth: p.outline))
            .background(shape.fill(p.border).offset(x: p.shadowOffset > 0 ? 2 : 0, y: p.shadowOffset > 0 ? 2 : 0))
            .accessibilityHidden(true)
    }
}

struct LedgerError: View {
    @EnvironmentObject private var store: WorkspaceStore
    let message: String
    let retry: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            WorkspaceNotice(message: message, tone: .error)
            Button(store.t("Try again"), action: retry)
                .buttonStyle(WorkspaceOutlineButton(palette: store.palette, compact: true))
        }.frame(maxWidth: .infinity, alignment: .leading).padding(12)
    }
}

func weekday(_ index: Int, locale: Locale) -> String {
    var cal = LedgerDate.calendar
    cal.locale = locale
    let symbols = cal.shortWeekdaySymbols
    return symbols[(min(7, max(1, index))) % 7]
}

/// The needle is embedded in the paper; only the shaded plastic head is visible.
struct NativeNotePin: View {
    var body: some View {
        ZStack {
            Ellipse().fill(.black.opacity(0.22)).frame(width: 17, height: 6).offset(x: 2, y: 8)
            Ellipse().fill(Color(red: 0.62, green: 0.06, blue: 0.13)).frame(width: 18, height: 9).offset(y: 6)
            Capsule().fill(LinearGradient(colors: [.red, Color(red: 0.68, green: 0.03, blue: 0.12)],
                                          startPoint: .leading, endPoint: .trailing))
                .frame(width: 9, height: 14)
            Ellipse().fill(Color(red: 0.98, green: 0.22, blue: 0.30)).frame(width: 17, height: 8).offset(y: -7)
            Ellipse().fill(.white.opacity(0.45)).frame(width: 7, height: 2).offset(x: -2, y: -8)
        }.frame(width: 20, height: 24)
    }
}
