import SwiftUI

struct LedgerEditorForm<Content: View>: View {
    enum Layout { case standard, record, teachingClass, page }

    @EnvironmentObject private var store: WorkspaceStore
    @Environment(\.dismiss) private var dismiss
    let title: String
    let valid: Bool
    let draftKey: String
    var layout: Layout = .standard
    var shouldDismissAfterSave = true
    let save: () async throws -> Void
    @ViewBuilder let content: () -> Content
    @State private var error: String?
    @State private var initialDraft: String?
    @State private var discard = false
    @State private var contentHeight: CGFloat = 0
    private var changed: Bool { initialDraft.map { $0 != draftKey } ?? false }

    private var saveTitle: String {
        if title.contains("student") { return "Save student" }
        if title.contains("class") { return "Save class" }
        if title == "Create tuition statement" { return "Create statement" }
        if title.contains("statement") { return "Save statement" }
        if title == "Paid by cash" || title == "Edit payment" { return "Save payment" }
        return "Save lesson"
    }

    var body: some View {
        Group {
            if layout == .page {
                editorPage
            } else if layout == .standard {
                editorPanel.padding(12)
            } else {
                GeometryReader { viewport in
                    editorPanel.frame(maxWidth: 560)
                        .frame(height: min(contentHeight > 0 ? contentHeight : viewport.size.height,
                                           max(0, viewport.size.height - 24)))
                        .padding(.horizontal, 12)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .onPreferenceChange(EditorContentHeight.self) { contentHeight = $0 }
                .background(store.palette.background.ignoresSafeArea())
            }
        }
        .accessibilityHidden(discard)
        .overlay { if discard { discardPrompt } }
        .workspaceModalBackground()
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(changed || store.saving)
        .interactiveDismissDisabled(changed || store.saving || discard)
        .onAppear { if initialDraft == nil { initialDraft = draftKey }; store.hasUnsavedEdits = changed }
        .onChange(of: draftKey) { _ in store.hasUnsavedEdits = changed }
        .onDisappear { store.hasUnsavedEdits = false }
    }

    private var editorPage: some View {
        let p = store.palette
        return WorkspaceScroll(eager: true) {
            Button(action: close) {
                Label(store.t("Statement list"), systemImage: "arrow.left")
                    .font(p.font(14)).underline()
            }
            .buttonStyle(.plain)
            Text(store.t(title)).font(p.font(25, .heavy)).accessibilityAddTraits(.isHeader)
            content()
            if let error { WorkspaceNotice(message: error, tone: .error) }
            editorSaveButton
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private var editorSaveButton: some View {
        Button(store.t(store.saving ? "Saving changes" : error != nil ? "Try saving again" : saveTitle)) {
            Task {
                do {
                    try await save()
                    if shouldDismissAfterSave { dismiss() }
                } catch { self.error = store.t(error.localizedDescription) }
            }
        }
        .buttonStyle(WorkspaceActionButton(palette: store.palette))
        .disabled(!valid || store.saving)
        .accessibilityIdentifier("Save")
    }

    private var editorPanel: some View {
        let p = store.palette
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        if layout != .teachingClass {
                            Text(store.t("Your ledger").uppercased())
                                .font(p.font(11, .semibold)).tracking(1.8).foregroundStyle(p.secondaryInk)
                        }
                        Text(store.t(title)).font(p.font(25, .heavy)).accessibilityAddTraits(.isHeader)
                    }
                    Spacer(minLength: 8)
                    Button(action: close) { Image(systemName: "xmark").frame(width: 20, height: 24) }
                        .buttonStyle(WorkspaceOutlineButton(palette: p, compact: true))
                        .accessibilityLabel(store.t("Cancel")).disabled(store.saving)
                }
                .padding(.horizontal, 14).padding(.vertical, 12)
                Divider().overlay(p.border)
                VStack(alignment: .leading, spacing: 12) {
                    content()
                    if let error {
                        WorkspaceNotice(message: error, tone: .error).accessibilityAddTraits(.updatesFrequently)
                    }
                }
                .padding(14)
                Divider().overlay(p.border)
                    .padding(.horizontal, 14)
                HStack(spacing: 12) {
                    Spacer(minLength: 0)
                    Button(store.t(layout == .standard ? "Cancel" : "Later"), action: close)
                        .buttonStyle(WorkspaceOutlineButton(palette: p))
                        .accessibilityLabel(store.t("Cancel")).disabled(store.saving)
                    editorSaveButton
                }
                .padding(.horizontal, 14).padding(.vertical, 12)
            }
            .font(p.font()).foregroundStyle(p.foreground)
            .background {
                if layout != .standard {
                    GeometryReader { content in
                        Color.clear.preference(key: EditorContentHeight.self, value: content.size.height)
                    }
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .clipShape(RoundedRectangle(cornerRadius: p.radius))
        .modifier(WorkspacePanel(palette: p, fill: p.surface))
    }

    private func close() {
        if changed { discard = true } else { dismiss() }
    }

    private var discardPrompt: some View {
        let p = store.palette
        return ZStack {
            Color.black.opacity(0.42).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                Text(store.t("Discard unsaved changes?")).font(p.font(20, .heavy)).accessibilityAddTraits(.isHeader)
                WorkspaceActionRows {
                    Button(store.t("Keep editing")) { discard = false }
                        .buttonStyle(WorkspaceOutlineButton(palette: p))
                    Button(store.t("Discard changes"), role: .destructive) { dismiss() }
                        .buttonStyle(WorkspaceActionButton(palette: p))
                }
            }
            .padding(16).foregroundStyle(p.foreground)
            .modifier(WorkspacePanel(palette: p, fill: p.surface))
            .padding(20).frame(maxWidth: 420)
            .accessibilityAddTraits(.isModal)
        }
    }
}

private struct EditorContentHeight: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

struct StudentEditor: View {
    @EnvironmentObject private var store: WorkspaceStore
    let record: LedgerRecord?
    @State private var name: String
    @State private var contact: String
    @State private var phone: String
    @State private var email: String
    @State private var note: String

    init(record: LedgerRecord? = nil) {
        self.record = record
        _name = State(initialValue: record?.name ?? "")
        _contact = State(initialValue: record?.text("contactName") ?? "")
        _phone = State(initialValue: record?.text("phone") ?? "")
        _email = State(initialValue: record?.text("email") ?? "")
        _note = State(initialValue: record?.text("privateNote") ?? "")
    }

    var body: some View {
        LedgerEditorForm(title: record == nil ? "Add student" : "Edit student",
                         valid: !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                         draftKey: [name, contact, phone, email, note].joined(separator: "\u{0}"),
                         layout: .record, save: save) {
            WorkspaceField(store.t("Student name"), text: $name, placeholder: store.t("Example: Linh Nguyen"), required: true)
                .textContentType(.name)
            WorkspaceFieldColumns {
                WorkspaceField(store.t("Contact name"), text: $contact)
                WorkspaceField(store.t("Phone number"), text: $phone).keyboardType(.phonePad).textContentType(.telephoneNumber)
            }
            WorkspaceField(store.t("Statement email"), text: $email).keyboardType(.emailAddress)
                .textContentType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
            WorkspaceField(store.t("Private notes"), text: $note, axis: .vertical, placeholder: store.t("Only you can see this"))
        }
    }

    private func save() async throws {
        let endpoint = "/api/students" + (record.map { "/" + $0.id } ?? "")
        _ = try await store.write(endpoint, method: record == nil ? "POST" : "PATCH", body: [
            "displayName": .string(name), "contactName": .string(contact), "phone": .string(phone),
            "email": .string(email), "privateNote": .string(note)
        ])
    }
}

struct ClassEditor: View {
    private struct Slot: Identifiable {
        let id = UUID()
        var weekday: Int
        var time: Date
    }
    @EnvironmentObject private var store: WorkspaceStore
    let record: LedgerRecord?
    @State private var name: String
    @State private var rate: String
    @State private var note: String
    @State private var students: Set<String>
    @State private var slots: [Slot]

    init(record: LedgerRecord? = nil) {
        self.record = record
        _name = State(initialValue: record?.name ?? "")
        _rate = State(initialValue: record.map { String($0.int("rateVnd")) } ?? "")
        _note = State(initialValue: record?.text("privateNote") ?? "")
        _students = State(initialValue: Set(record?.strings("studentIds") ?? []))
        _slots = State(initialValue: record?.objects("weeklySchedule").map {
            Slot(weekday: $0.int("weekday"), time: lessonTimeDate($0.text("time")))
        } ?? [])
    }

    var body: some View {
        LedgerEditorForm(title: record == nil ? "Add class" : "Edit class",
                         valid: !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                            !students.isEmpty && validRate(rate),
                         draftKey: [name, rate, note, students.sorted().joined(), slots.map { "\($0.weekday):\(lessonTime($0.time))" }.joined()].joined(separator: "\u{0}"),
                         layout: .teachingClass, save: save) {
            WorkspaceField(store.t("Class name"), text: $name, placeholder: store.t("Example: Tuesday evening piano"), required: true)
            WorkspaceField(store.t("Tuition per student per lesson (VND)"), text: $rate, required: true).keyboardType(.numberPad)
            Text(store.t("Each student pays the same rate. Changes to the rate or roster apply to new lessons."))
                .font(store.palette.font(13)).foregroundStyle(store.palette.secondaryInk)
            LearnerChecklist(selection: $students)
            VStack(alignment: .leading, spacing: 10) {
                Text(store.t("Weekly schedule")).font(store.palette.font(15, .bold)).accessibilityAddTraits(.isHeader)
                Text(store.t("Vietnam time. Scheduled lessons appear under Upcoming lessons."))
                    .font(store.palette.font(13)).foregroundStyle(store.palette.secondaryInk)
                ForEach($slots) { $slot in
                    HStack(alignment: .bottom, spacing: 12) {
                        WorkspaceChoice(label: store.t("Day"), selection: $slot.weekday,
                            options: (1...7).map { ($0, weekday($0, locale: store.language)) })
                        WorkspaceDatePicker(store.t("Start time"), selection: $slot.time, displayedComponents: .hourAndMinute)
                        Button(role: .destructive) { slots.removeAll { $0.id == slot.id } } label: {
                            Image(systemName: "trash").frame(width: 20, height: 28)
                        }.buttonStyle(WorkspaceOutlineButton(palette: store.palette, compact: true))
                            .accessibilityLabel(store.t("Remove time"))
                    }
                }
                if slots.count < 35 {
                    Button { slots.append(.init(weekday: 1, time: lessonTimeDate("18:00"))) } label: {
                        Label(store.t("Add weekly time"), systemImage: "plus")
                    }.buttonStyle(WorkspaceOutlineButton(palette: store.palette))
                }
            }
            WorkspaceField(store.t("Private notes"), text: $note, axis: .vertical, placeholder: store.t("Only you can see this"))
        }
    }

    private func save() async throws {
        let hours = slots.map { LedgerValue.object(["weekday": .number($0.weekday), "time": .string(lessonTime($0.time))]) }
        _ = try await store.write("/api/classes" + (record.map { "/" + $0.id } ?? ""),
            method: record == nil ? "POST" : "PATCH", body: [
                "displayName": .string(name), "rateVnd": .number(Int(rate) ?? 0), "privateNote": .string(note),
                "studentIds": .strings(students.sorted()), "weeklySchedule": .array(hours)
            ])
    }
}

struct LearnerChecklist: View {
    @EnvironmentObject private var store: WorkspaceStore
    @Binding var selection: Set<String>
    let roster: [LedgerRecord]?
    @State private var originalSelection: Set<String>
    @State private var items: [LedgerRecord] = []
    @State private var query = ""
    @State private var loading = true
    @State private var error: String?
    @ScaledMetric(relativeTo: .body) private var studentRowHeight = 44.0

    init(selection: Binding<Set<String>>, roster: [LedgerRecord]? = nil) {
        _selection = selection
        self.roster = roster
        _originalSelection = State(initialValue: selection.wrappedValue)
    }

    var body: some View {
        let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let students = roster ?? items
        let matches = students.filter {
            search.isEmpty || $0.name.range(of: search, options: [.diacriticInsensitive, .caseInsensitive]) != nil
        }
        let p = store.palette
        VStack(alignment: .leading, spacing: 8) {
            Text(store.t(roster == nil ? "Students" : "Attendance") + " (\(selection.count)/\(roster?.count ?? 50))")
                .font(p.font(15, .bold)).accessibilityAddTraits(.isHeader)
            WorkspaceField(store.t("Search students"), text: $query, placeholder: store.t("With or without accents"))
            if roster == nil && !selection.isEmpty {
                chosenStudents(students.filter { selection.contains($0.id) })
            }
            if let error {
                LedgerError(message: error) { Task { await load() } }
            } else if roster == nil && loading && items.isEmpty {
                ProgressView().tint(p.controlTint)
            } else if matches.isEmpty {
                WorkspaceNotice(message: store.t("No matching students"))
            } else {
                let shape = RoundedRectangle(cornerRadius: p.fieldRadius)
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(matches) { item in studentRow(item) }
                    }.padding(5)
                }
                .frame(height: min(224, CGFloat(matches.count) * (studentRowHeight + 2) + 10))
                .background(p.background, in: shape)
                .clipShape(shape)
                .overlay(shape.strokeBorder(p.border, lineWidth: max(1, p.outline)))
                .accessibilityIdentifier("workspace-student-list")
            }
            Text(store.t(roster == nil ? "Choose up to 50 students. Searching keeps your selections." :
                "Clear the checkbox for anyone who is absent."))
                .font(p.font(13)).foregroundStyle(p.secondaryInk)
        }
        .toggleStyle(WorkspaceCheckbox())
        .task(id: store.revision) { if roster == nil { await load() } }
    }

    private func studentRow(_ item: LedgerRecord) -> some View {
        let selected = selection.contains(item.id)
        let p = store.palette
        return Toggle(item.name, isOn: Binding(get: { selection.contains(item.id) }, set: { enabled in
            if enabled { selection.insert(item.id) } else { selection.remove(item.id) }
        }))
        .padding(.horizontal, 6).frame(minHeight: studentRowHeight)
        .background(selected ? p.recordAccent.opacity(0.48) : p.surface,
                    in: RoundedRectangle(cornerRadius: min(8, p.fieldRadius)))
        .disabled(!selected && selection.count >= 50)
    }

    private func chosenStudents(_ students: [LedgerRecord]) -> some View {
        let p = store.palette
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 128), spacing: 6)], alignment: .leading, spacing: 6) {
            ForEach(students) { student in
                Button { selection.remove(student.id) } label: {
                    HStack(spacing: 4) {
                        Text(student.name).lineLimit(1)
                        Image(systemName: "xmark").font(.caption2.bold()).accessibilityHidden(true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(WorkspaceOutlineButton(palette: p, compact: true))
                .accessibilityIdentifier("remove-student-\(student.id)")
            }
        }
    }

    private func load() async {
        loading = true
        error = nil
        defer { if !Task.isCancelled { loading = false } }
        do {
            let students = try await store.learners(includeArchived: !originalSelection.isEmpty)
            try Task.checkCancellation()
            items = students.filter { $0.string("archivedAt") == nil || originalSelection.contains($0.id) }
        } catch {
            if !Task.isCancelled { self.error = store.t(error.localizedDescription) }
        }
    }
}

struct LearnerPicker: View {
    @EnvironmentObject private var store: WorkspaceStore
    @Binding var selected: String
    var includeArchived = false
    var allOption = false
    var inlineSearch = false
    @State private var items: [LedgerRecord] = []
    @State private var label = ""
    @State private var presented = false
    @State private var query = ""
    @State private var error: String?
    @State private var loading = true

    private var matches: [LedgerRecord] {
        let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return items.filter { search.isEmpty || $0.name.range(of: search, options: [.diacriticInsensitive, .caseInsensitive]) != nil }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if inlineSearch {
                WorkspaceField(store.t("Search students by name"), text: $query, placeholder: store.t("With or without accents"))
                    .padding(.bottom, 6)
            }
            Text(inlineSearch ? store.t("Student") + " *" : store.t("Students")).font(store.palette.font(15, .semibold))
            WorkspaceChoiceTrigger(title: items.first { $0.id == selected }?.name ??
                (label.isEmpty ? store.t(allOption ? "All students" : "Choose a student") : label)) {
                if !inlineSearch { query = "" }
                presented = true
            }
        }
        .task(id: selected) {
            if selected.isEmpty { label = ""; return }
            if let item = items.first(where: { $0.id == selected }) { label = item.name; return }
            if let record: LedgerRecord = try? await store.read("/api/students/" + selected) { label = record.name }
        }
        .sheet(isPresented: $presented) {
            WorkspaceOptionPanel(title: store.t("Choose a student"), search: inlineSearch ? nil : $query, searchLabel: store.t("Search students")) {
                if allOption {
                    WorkspaceOptionRow(title: store.t("All students"), selected: selected.isEmpty) {
                        selected = ""; label = ""; presented = false
                    }
                }
                if let error {
                    LedgerError(message: error) { Task { await load() } }
                } else if loading && items.isEmpty {
                    ProgressView().tint(store.palette.controlTint).padding(10)
                } else if matches.isEmpty {
                    WorkspaceNotice(message: store.t("No matching students"))
                }
                ForEach(matches) { item in
                    WorkspaceOptionRow(title: item.name, selected: item.id == selected) {
                        selected = item.id
                        label = item.name
                        presented = false
                    }
                }
            }
            .presentationDetents([.large])
            .task(id: store.revision) { await load() }
        }
    }

    private func load() async {
        loading = true
        error = nil
        defer { if !Task.isCancelled { loading = false } }
        do { items = try await store.learners(includeArchived: includeArchived) }
        catch { if !Task.isCancelled { self.error = store.t(error.localizedDescription) } }
    }
}

struct LessonEditor: View {
    private enum Target: String, CaseIterable { case student = "One student", group = "Custom student group", teachingClass = "A class" }
    @EnvironmentObject private var store: WorkspaceStore
    let record: LedgerRecord?
    let editingGroup: Bool
    @State private var target: Target
    @State private var student: String
    @State private var classID: String
    @State private var participants: Set<String>
    @State private var classes: [LedgerRecord] = []
    @State private var classMembers: [LedgerRecord] = []
    @State private var currentClass: LedgerRecord?
    @State private var classesError: String?
    @State private var rosterError: String?
    @State private var date: Date
    @State private var hasTime: Bool
    @State private var time: Date
    @State private var rate: String
    @State private var duration: String
    @State private var status: String
    @State private var billable: Bool
    @State private var note: String

    init(classID: String? = nil, studentID: String? = nil, proposedDate: String? = nil, proposedTime: String? = nil,
         record: LedgerRecord? = nil, editingGroup: Bool = false, markingComplete: Bool = false) {
        self.record = record
        self.editingGroup = editingGroup
        let initialClass = classID ?? record?.string("classId")
        _target = State(initialValue: editingGroup ? (initialClass == nil ? .group : .teachingClass) :
                        record != nil || initialClass == nil ? .student : .teachingClass)
        _classID = State(initialValue: initialClass ?? "")
        _student = State(initialValue: studentID ?? record?.text("studentId") ?? "")
        _participants = State(initialValue: Set(record?.strings("studentIds") ?? []))
        _date = State(initialValue: LedgerDate.date(proposedDate ?? record?.text("sessionDate") ?? "") ?? .now)
        let initialTime = proposedTime ?? record?.string("startTime")
        _hasTime = State(initialValue: initialTime != nil)
        _time = State(initialValue: lessonTimeDate(initialTime ?? "18:00"))
        _rate = State(initialValue: record.map { String($0.int("rateVnd")) } ?? "")
        _duration = State(initialValue: record.flatMap { $0.int("durationMinutes") > 0 ? String($0.int("durationMinutes")) : nil } ?? "")
        _status = State(initialValue: editingGroup ? "keep" : markingComplete ? "completed" : record?.string("status") ?? "completed")
        _billable = State(initialValue: record?.flag("billable") ?? true)
        _note = State(initialValue: record?.text("privateNote") ?? "")
    }

    private var lockedDate: Bool { record?.string("lessonId") != nil && !editingGroup }
    private var valid: Bool {
        let rateOkay = rate.isEmpty ? (!billable || record != nil) && target == .student : validRate(rate)
        let durationOkay = duration.isEmpty || (Int(duration).map { (1...1440).contains($0) } ?? false)
        return rateOkay && durationOkay && (target == .student ? !student.isEmpty :
            !participants.isEmpty && (target != .teachingClass || !classID.isEmpty))
    }

    private var tuitionPreview: String {
        guard status != "cancelled", billable else { return store.money(0) }
        guard validRate(rate), let amount = Int(rate) else { return "—" }
        return store.money(amount * (target == .student ? 1 : participants.count))
    }

    var body: some View {
        LedgerEditorForm(title: record == nil ? "Record lesson" : "Edit lesson", valid: valid,
                         draftKey: [target.rawValue, student, classID, participants.sorted().joined(), LedgerDate.text(date), String(hasTime), lessonTime(time), rate, duration, status, String(billable), note].joined(separator: "\u{0}"),
                         layout: .record, save: save) {
            if record == nil {
                WorkspaceChoice(label: store.t("Teach"), selection: $target,
                    options: Target.allCases.map { ($0, store.t($0.rawValue)) })
            }
            switch target {
            case .student:
                if let record { Text(record.text("studentName")) }
                else { LearnerPicker(selected: $student, inlineSearch: true) }
            case .group:
                LearnerChecklist(selection: $participants)
            case .teachingClass:
                WorkspaceChoice(label: store.t("Classes"), selection: $classID,
                    options: [("", store.t("Choose a class"))] + classes.map { ($0.id, $0.name) } +
                        (!classID.isEmpty && !classes.contains(where: { $0.id == classID }) ? [(classID, currentClass?.name ?? record?.text("className") ?? store.t("Classes"))] : []))
                .disabled(record != nil)
                if let classesError { LedgerError(message: classesError) { Task { await loadClasses() } } }
                if !classID.isEmpty {
                    if let rosterError {
                        LedgerError(message: rosterError) { Task { await loadClass() } }
                    } else if currentClass?.id == classID {
                        LearnerChecklist(selection: $participants, roster: classMembers)
                    } else {
                        ProgressView().tint(store.palette.controlTint)
                    }
                }
            }
            VStack(alignment: .leading, spacing: 14) {
                WorkspaceFieldColumns {
                    WorkspaceDatePicker(store.t("Lesson date"), selection: $date).disabled(lockedDate)
                    WorkspaceChoice(label: store.t("Status"), selection: $status,
                        options: (editingGroup ? [("keep", store.t("Keep each student's status"))] : []) +
                            ["planned", "completed", "cancelled"].map { ($0, store.t(ledgerStatus($0))) })
                }
                WorkspaceFieldColumns {
                    WorkspaceDatePicker(store.t("Start time"), selection: $time, displayedComponents: .hourAndMinute, optional: $hasTime).disabled(lockedDate)
                    WorkspaceField(store.t("Duration (minutes)"), text: $duration).keyboardType(.numberPad).disabled(lockedDate)
                }
                WorkspaceField(store.t(target == .student ? "Lesson price (VND)" : "Tuition per student (VND)"), text: $rate)
                    .keyboardType(.numberPad).disabled(lockedDate)
                if status != "keep" && status != "cancelled" { Toggle(store.t("Charge for this lesson"), isOn: $billable) }
                WorkspaceKeyValue(store.t(status == "planned" ? "Expected tuition" : "Lesson tuition"), value: tuitionPreview)
                    .padding(12).modifier(WorkspacePanel(palette: store.palette, fill: store.palette.recordAccent))
                WorkspaceField(store.t("Private notes"), text: $note, axis: .vertical, placeholder: store.t("Only you can see this"))
            }
            .toggleStyle(WorkspaceCheckbox())

        }
        .onChange(of: target) { next in
            if record == nil { participants.removeAll() }
            if next == .teachingClass, let currentClass {
                participants = Set(classMembers.map(\.id)); rate = String(currentClass.int("rateVnd"))
            }
        }
        .task(id: target) {
            if target == .teachingClass && classes.isEmpty { await loadClasses() }
        }
        .task(id: classID) { await loadClass() }
    }

    private func loadClasses() async {
        classesError = nil
        do { classes = try await store.all("/api/classes", query: ["order": "schedule"]) }
        catch { if !Task.isCancelled { classesError = store.t(error.localizedDescription) } }
    }

    private func loadClass() async {
        rosterError = nil
        guard !classID.isEmpty else { currentClass = nil; classMembers = []; return }
        let id = classID
        if record == nil { participants.removeAll() }
        do {
            let item: LedgerRecord = try await store.read("/api/classes/" + id)
            guard id == classID, !Task.isCancelled else { return }
            currentClass = item
            classMembers = item.objects("students").filter { $0.string("archivedAt") == nil || participants.contains($0.id) }
            if record == nil && target == .teachingClass {
                participants = Set(classMembers.map(\.id))
                rate = String(item.int("rateVnd"))
            }
        } catch {
            if !Task.isCancelled { rosterError = store.t(error.localizedDescription) }
        }
    }

    private func save() async throws {
        let group = target != .student
        let endpoint = (group ? "/api/lessons" : "/api/sessions") + (record.map { "/" + $0.id } ?? "")
        var input: [String: LedgerValue] = [
            "sessionDate": .string(LedgerDate.text(date)),
            "startTime": hasTime ? .string(lessonTime(time)) : .null,
            "durationMinutes": Int(duration).map(LedgerValue.number) ?? .null,
            "status": status == "keep" ? .null : .string(status),
            "billable": status == "keep" ? .null : .flag(status != "cancelled" && billable),
            "privateNote": .string(note)
        ]
        if let price = Int(rate) { input["rateVnd"] = .number(price) }
        if group {
            input["classId"] = target == .teachingClass ? .string(classID) : .null
            input["studentIds"] = .strings(participants.sorted())
        } else {
            input["studentId"] = .string(student)
        }
        _ = try await store.write(endpoint, method: record == nil ? "POST" : "PATCH", body: input)
        if let detail = currentClass, !detail.id.isEmpty { await store.refreshDashboard() }
    }
}

func validRate(_ value: String) -> Bool { Int(value).map { (0...1_000_000_000).contains($0) } ?? false }

func lessonTime(_ date: Date) -> String {
    let values = LedgerDate.calendar.dateComponents([.hour, .minute], from: date)
    return String(format: "%02d:%02d", values.hour ?? 0, values.minute ?? 0)
}

func lessonTimeDate(_ value: String) -> Date {
    let parts = value.split(separator: ":").compactMap { Int($0) }
    guard parts.count == 2 else { return .now }
    return LedgerDate.calendar.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: .now) ?? .now
}
