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
    @EnvironmentObject private var store: WorkspaceStore
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
    @State private var items: [LedgerRecord] = []
    @State private var cursor: String?
    @State private var ready = false
    @State private var loadedPath: String?
    @State private var loadingMore = false
    @State private var error: String?
    @State private var editing = false
    @State private var month = Date()
    @State private var selecting = false
    @State private var selected: Set<String> = []
    private static let logger = Logger(subsystem: "tech.devoralabs.lessonbrook", category: "performance")

    init(_ kind: LedgerKind, relation: [String: String] = [:]) {
        self.kind = kind
        self.relation = relation
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
            if !student.isEmpty { query["studentId"] = student }
            if kind == .sessions {
                query["order"] = "chronological"
                query["type"] = type
                query["billing"] = billing
                if !selectedClass.isEmpty { query["classId"] = selectedClass }
            }
        case .lessons:
            query["order"] = "chronological"
        }
        return query
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                controls
                if kind == .sessions && selecting && layout != .calendar { selectionControls }
                if let error { LedgerError(message: error) { Task { await load(refresh: true) } } }
                if !ready {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 64)
                } else if layout == .calendar {
                    LedgerMonth(kind: kind, records: items, month: $month)
                } else if items.isEmpty {
                    Text(store.t("No records found.")).foregroundStyle(.secondary).padding(12)
                } else {
                    let columns = layout == .notes && (kind == .students || kind == .classes) ? 2 : 1
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top),
                                             count: columns), spacing: 10) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                            row(item, index: index)
                        }
                    }
                    if cursor != nil {
                        Button(store.t("Load more")) { Task { await more() } }
                            .buttonStyle(.bordered).disabled(loadingMore)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            .padding(12)
        }
        .background(store.palette.background)
        .foregroundStyle(store.palette.foreground)
        .refreshable { await load(refresh: true) }
        .task(id: ledgerPath(kind.endpoint, query) + "#\(layout.rawValue)#\(store.revision)") { await load() }
        .sheet(isPresented: $editing) { addEditor }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text(store.t(kind.title)).font(.system(.title2, design: store.palette.fontDesign).bold())
                Spacer()
                Button { editing = true } label: { Label(store.t(kind.addTitle), systemImage: "plus") }
                    .buttonStyle(WorkspaceActionButton(palette: store.palette))
            }
            Picker(store.t("View"), selection: $layout) {
                ForEach(kind.hasCalendar ? Layout.allCases : [.notes, .list], id: \.self) {
                    Text(store.t($0.rawValue)).tag($0)
                }
            }
            .pickerStyle(.segmented)
            if kind == .students || kind == .classes {
                TextField(store.t(kind == .students ? "Search students" : "Search classes"), text: $search)
                    .textFieldStyle(.roundedBorder)
                Toggle(store.t("Show archived"), isOn: $archived)
                    .font(.subheadline)
            }
            if kind == .sessions || kind == .statements {
                DisclosureGroup(store.t("Filters")) { filters }
                    .padding(.vertical, 2)
            }
            if kind == .sessions {
                HStack {
                    NavigationLink(value: WorkspaceRoute.schedule) { Text(store.t("Upcoming lessons")) }
                    Spacer()
                    if layout != .calendar {
                        Button(store.t(selecting ? "Done selecting" : "Select")) {
                            selecting.toggle()
                            selected.removeAll()
                        }
                    }
                }.font(.subheadline.weight(.semibold))
            }
        }
        .padding(12)
        .modifier(WorkspacePanel(palette: store.palette, fill: store.palette.surface))
    }

    private var filters: some View {
        VStack(alignment: .leading, spacing: 7) {
            if layout != .calendar {
                Picker(store.t("Date range"), selection: $period) {
                    ForEach(LedgerPeriod.allCases, id: \.self) { Text(store.t($0.rawValue)).tag($0) }
                }
                if period == .custom {
                    DatePicker(store.t("From date"), selection: $from, displayedComponents: .date)
                    DatePicker(store.t("To date"), selection: $to, displayedComponents: .date)
                }
            }
            if relation["studentId"] == nil {
                LearnerPicker(selected: $student, includeArchived: true, allOption: true)
            }
            if kind == .sessions && relation["classId"] == nil {
                Picker(store.t("Classes"), selection: $selectedClass) {
                    Text(store.t("All classes")).tag("")
                    ForEach(classes) { Text($0.name).tag($0.id) }
                }
            }
            Picker(store.t("Status"), selection: $status) {
                Text(store.t("All")).tag("all")
                let values = kind == .sessions ? ["planned", "completed", "cancelled"] : ["unpaid", "paid", "overdue", "draft", "void"]
                ForEach(values, id: \.self) { Text(store.t(ledgerStatus($0))).tag($0) }
            }
            if kind == .sessions {
                Picker(store.t("Lesson type"), selection: $type) {
                    Text(store.t("All")).tag("all")
                    Text(store.t("One student")).tag("individual")
                    Text(store.t("Custom student group")).tag("group")
                    Text(store.t("A class")).tag("class")
                }
                Picker(store.t("Tuition"), selection: $billing) {
                    Text(store.t("All")).tag("all")
                    ForEach(["paid", "unpaid", "free"], id: \.self) { Text(store.t(ledgerStatus($0))).tag($0) }
                }
            }
            Button(store.t("Clear filters")) {
                period = .all; status = "all"; billing = "all"; type = "all"; student = ""; selectedClass = ""
            }
        }
        .task {
            do {
                if kind == .sessions && relation["classId"] == nil {
                    classes = try await store.all("/api/classes", query: ["order": "schedule", "archived": "all"])
                }
            } catch {
                if !Task.isCancelled { self.error = store.t(error.localizedDescription) }
            }
        }
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
        HStack(alignment: .top, spacing: 8) {
            if kind == .sessions && selecting && item.text("status") == "planned" {
                Button {
                    if selected.contains(item.id) { selected.remove(item.id) }
                    else if selected.count < 100 { selected.insert(item.id) }
                } label: {
                    Image(systemName: selected.contains(item.id) ? "checkmark.square.fill" : "square")
                        .frame(minWidth: 36, minHeight: 44)
                }.buttonStyle(.plain).accessibilityLabel(store.t("Select"))
            }
            NavigationLink(value: kind.route(item)) {
                LedgerRow(kind: kind, item: item, note: layout == .notes, index: index)
            }.buttonStyle(.plain)
        }
    }

    @ViewBuilder private var addEditor: some View {
        switch kind {
        case .students: StudentEditor()
        case .classes: ClassEditor()
        case .sessions, .lessons:
            NavigationStack { LessonEditor(classID: relation["classId"], studentID: relation["studentId"]) }
        case .statements: StatementEditor(studentID: relation["studentId"])
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
    var body: some View {
        let color = code == "paid" || code == "completed" ? store.palette.mint :
            ["unpaid", "cancelled", "void", "overdue"].contains(code) ? Color(red: 0.98, green: 0.62, blue: 0.67) : store.palette.yellow
        Text(store.t(ledgerStatus(code))).font(.caption.weight(.semibold))
            .padding(.horizontal, 7).padding(.vertical, 3)
            .foregroundStyle(store.palette.dashboardInk)
            .background(color, in: Capsule())
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct LedgerRow: View {
    @EnvironmentObject private var store: WorkspaceStore
    let kind: LedgerKind
    let item: LedgerRecord
    let note: Bool
    let index: Int
    @State private var hovering = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var title: String {
        switch kind {
        case .students, .classes: return item.name
        case .sessions, .lessons:
            return item.string("className") ?? item.string("studentName") ?? store.t("Group lesson")
        case .statements:
            return [item.string("number"), item.object("recipientSnapshot")?.name]
                .compactMap { $0 }.joined(separator: " · ")
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 8) {
                if kind == .students || kind == .classes {
                    Text(String(title.prefix(1)).uppercased()).font(.headline)
                        .frame(width: 32, height: 32)
                        .background(store.palette.recordAccent.opacity(0.45), in: RoundedRectangle(cornerRadius: 5))
                        .accessibilityHidden(true)
                }
                Text(title).font(.system(.subheadline, design: store.palette.fontDesign).bold())
                    .padding(kind == .students || kind == .classes ? 4 : 0)
                    .background(kind == .students || kind == .classes ? store.palette.recordAccent.opacity(0.25) : .clear,
                                in: RoundedRectangle(cornerRadius: min(8, store.palette.radius)))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.trailing, note ? 18 : 0)
                if !note { Image(systemName: "chevron.right").font(.caption2).accessibilityHidden(true) }
            }
            switch kind {
            case .students:
                if !item.text("contactName").isEmpty { Text(item.text("contactName")).font(.caption) }
                if !item.text("phone").isEmpty { Text(item.text("phone")).font(.caption) }
            case .classes:
                Text("\(item.strings("studentIds").count) " + store.t("students")).font(.caption)
                if !item.objects("weeklySchedule").isEmpty {
                    Text(item.objects("weeklySchedule").map { weekday($0.int("weekday"), locale: store.language) + " " + $0.text("time") }
                        .joined(separator: " · ")).font(.caption)
                }
            case .sessions, .lessons:
                Text([item.text("sessionDate"), item.text("startTime")].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption.monospacedDigit())
                if kind == .sessions {
                    HStack(spacing: 5) {
                        LedgerBadge(code: item.text("status"))
                        if let payment = item.string("paymentStatus") { LedgerBadge(code: payment) }
                        else if item.text("status") != "planned" || !item.flag("billable") { LedgerBadge(code: "no_charge") }
                        Spacer(minLength: 0)
                        if item.int("amountVnd") > 0 { Text(store.money(item.int("amountVnd"))).font(.caption.bold()) }
                    }
                }
            case .statements:
                Text(item.text("periodStart") + " – " + item.text("periodEnd")).font(.caption)
                HStack {
                    LedgerBadge(code: item.text("status") == "issued" ? (item.int("paidVnd") == item.int("totalVnd") ? "paid" : "unpaid") : item.text("status"))
                    Spacer()
                    Text(store.money(item.int("totalVnd"))).font(.subheadline.bold())
                }
            }
            if item.string("archivedAt") != nil {
                Text(store.t("Archived")).font(.caption.weight(.semibold))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .foregroundStyle(store.palette.foreground)
        .modifier(WorkspacePanel(palette: store.palette, fill: note ? noteFill : store.palette.surface))
        .overlay(alignment: .topTrailing) {
            if note {
                NativeNotePin().rotationEffect(.degrees(index % 2 == 0 ? 20 : -18))
                    .padding(5).accessibilityHidden(true)
            }
        }
        .rotationEffect(.degrees(note && !reduceMotion ? (hovering ? 0 : (index % 2 == 0 ? -0.5 : 0.5)) : 0))
        .scaleEffect(hovering && !reduceMotion ? 1.015 : 1)
        .animation(.easeOut(duration: 0.16), value: hovering)
        .onHover { hovering = $0 }
    }

    private var noteFill: Color {
        if store.palette.dark { return store.palette.surface }
        let colors: [Color] = store.palette.retroRows ? [
            Color(red: 1, green: 0.78, blue: 0.86), Color(red: 1, green: 0.82, blue: 0.69),
            Color(red: 1, green: 0.92, blue: 0.62), Color(red: 0.89, green: 0.79, blue: 0.99),
            Color(red: 0.69, green: 0.92, blue: 0.79), Color(red: 0.74, green: 0.89, blue: 0.99)
        ] : [store.palette.yellow, store.palette.mint, store.palette.blue]
        return colors[index % colors.count]
    }
}

struct LedgerError: View {
    @EnvironmentObject private var store: WorkspaceStore
    let message: String
    let retry: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(message).font(.subheadline).foregroundStyle(.red)
            Button(store.t("Try again"), action: retry).buttonStyle(.bordered)
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
