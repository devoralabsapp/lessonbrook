import SwiftUI

struct LedgerEditorForm<Content: View>: View {
    @EnvironmentObject private var store: WorkspaceStore
    @Environment(\.dismiss) private var dismiss
    let title: String
    let valid: Bool
    let draftKey: String
    let save: () async throws -> Void
    @ViewBuilder let content: () -> Content
    @State private var error: String?
    @State private var initialDraft: String?
    @State private var discard = false
    private var changed: Bool { initialDraft.map { $0 != draftKey } ?? false }

    var body: some View {
        Form {
            content()
            if let error { Text(error).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently) }
        }
        .scrollContentBackground(.hidden)
        .background(store.palette.background)
        .navigationTitle(store.t(title))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(store.t("Cancel")) { if changed { discard = true } else { dismiss() } }.disabled(store.saving)
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(store.t(store.saving ? "Saving changes" : "Save")) {
                    Task {
                        do { try await save(); dismiss() }
                        catch { self.error = store.t(error.localizedDescription) }
                    }
                }.disabled(!valid || store.saving)
            }
        }
        .navigationBarBackButtonHidden(changed || store.saving)
        .interactiveDismissDisabled(changed || store.saving)
        .onAppear { if initialDraft == nil { initialDraft = draftKey }; store.hasUnsavedEdits = changed }
        .onChange(of: draftKey) { _ in store.hasUnsavedEdits = changed }
        .onDisappear { store.hasUnsavedEdits = false }
        .confirmationDialog(store.t("Discard unsaved changes?"), isPresented: $discard, titleVisibility: .visible) {
            Button(store.t("Discard changes"), role: .destructive) { dismiss() }
            Button(store.t("Keep editing"), role: .cancel) {}
        }
    }
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
        NavigationStack {
            LedgerEditorForm(title: record == nil ? "Add student" : "Edit student",
                             valid: !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                             draftKey: [name, contact, phone, email, note].joined(separator: "\u{0}"), save: save) {
                TextField(store.t("Student name"), text: $name).textContentType(.name)
                TextField(store.t("Contact name"), text: $contact)
                TextField(store.t("Phone number"), text: $phone).keyboardType(.phonePad).textContentType(.telephoneNumber)
                TextField(store.t("Email"), text: $email).keyboardType(.emailAddress)
                    .textContentType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                TextField(store.t("Private notes"), text: $note, axis: .vertical).lineLimit(3...6)
            }
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
        NavigationStack {
            LedgerEditorForm(title: record == nil ? "Add class" : "Edit class",
                             valid: !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                                !students.isEmpty && validRate(rate),
                             draftKey: [name, rate, note, students.sorted().joined(), slots.map { "\($0.weekday):\(lessonTime($0.time))" }.joined()].joined(separator: "\u{0}"), save: save) {
                Section {
                    TextField(store.t("Class name"), text: $name)
                    TextField(store.t("Price per lesson (VND)"), text: $rate).keyboardType(.numberPad)
                    TextField(store.t("Private notes"), text: $note, axis: .vertical).lineLimit(2...6)
                }
                Section(store.t("Weekly schedule")) {
                    ForEach($slots) { $slot in
                        HStack {
                            Picker(store.t("Day"), selection: $slot.weekday) {
                                ForEach(1...7, id: \.self) { day in
                                    Text(weekday(day, locale: store.language)).tag(day)
                                }
                            }.labelsHidden()
                            DatePicker(store.t("Start time"), selection: $slot.time, displayedComponents: .hourAndMinute)
                                .labelsHidden()
                            Spacer()
                            Button(role: .destructive) { slots.removeAll { $0.id == slot.id } } label: {
                                Image(systemName: "minus.circle")
                            }.buttonStyle(.borderless).accessibilityLabel(store.t("Remove time"))
                        }
                    }
                    if slots.count < 35 {
                        Button(store.t("Add weekly time")) { slots.append(.init(weekday: 1, time: lessonTimeDate("18:00"))) }
                    }
                }
                Section(store.t("Students")) { LearnerChecklist(selection: $students) }
            }
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
    var roster: [LedgerRecord]? = nil
    @State private var items: [LedgerRecord] = []
    @State private var query = ""
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        if let error {
            LedgerError(message: error) { Task { await load() } }
        }
        if roster == nil && loading { ProgressView() }
        TextField(store.t("Search students"), text: $query)
            .task { if roster == nil { await load() } }
        let list = roster ?? items
        ForEach(list.filter { query.isEmpty || $0.name.range(of: query, options: [.diacriticInsensitive, .caseInsensitive]) != nil }) { item in
            Toggle(item.name, isOn: Binding(get: { selection.contains(item.id) }, set: { enabled in
                if enabled { selection.insert(item.id) } else { selection.remove(item.id) }
            }))
            .disabled(!selection.contains(item.id) && selection.count >= 50)
        }
    }

    private func load() async {
        error = nil
        do {
            let students = try await store.all("/api/students", query: ["order": "name", "archived": "true"])
            items = students.filter { $0.string("archivedAt") == nil || selection.contains($0.id) }
            loading = false
        } catch {
            if !Task.isCancelled { loading = false; self.error = store.t(error.localizedDescription) }
        }
    }
}

struct LearnerPicker: View {
    @EnvironmentObject private var store: WorkspaceStore
    @Binding var selected: String
    var includeArchived = false
    var allOption = false
    @State private var items: [LedgerRecord] = []
    @State private var label = ""
    @State private var presented = false
    @State private var query = ""
    @State private var error: String?

    var body: some View {
        Button {
            presented = true
        } label: {
            HStack {
                Text(store.t("Student"))
                Spacer()
                Text(items.first { $0.id == selected }?.name ?? (label.isEmpty ? store.t(allOption ? "All students" : "Choose a student") : label))
                    .foregroundStyle(.secondary)
                Image(systemName: "chevron.up.chevron.down").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .task(id: selected) {
            if selected.isEmpty { label = ""; return }
            if let item = items.first(where: { $0.id == selected }) { label = item.name; return }
            if let record: LedgerRecord = try? await store.read("/api/students/" + selected) { label = record.name }
        }
        .sheet(isPresented: $presented) {
            NavigationStack {
                List {
                    if allOption {
                        Button(store.t("All students")) { selected = ""; label = ""; presented = false }
                    }
                    if let error { LedgerError(message: error) { Task { await load() } } }
                    ForEach(items.filter { query.isEmpty || $0.name.range(of: query, options: [.diacriticInsensitive, .caseInsensitive]) != nil }) { item in
                        Button {
                            selected = item.id
                            label = item.name
                            presented = false
                        } label: {
                            HStack {
                                Text(item.name)
                                Spacer()
                                if item.id == selected { Image(systemName: "checkmark") }
                            }
                        }
                    }
                }
                .navigationTitle(store.t("Choose a student"))
                .searchable(text: $query, prompt: store.t("Search students"))
                .task { await load() }
            }
        }
    }

    private func load() async {
        error = nil
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
         record: LedgerRecord? = nil, editingGroup: Bool = false) {
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
        _status = State(initialValue: editingGroup ? "keep" : record?.string("status") ?? "completed")
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

    var body: some View {
        LedgerEditorForm(title: record == nil ? "Record lesson" : "Edit lesson", valid: valid,
                         draftKey: [target.rawValue, student, classID, participants.sorted().joined(), LedgerDate.text(date), String(hasTime), lessonTime(time), rate, duration, status, String(billable), note].joined(separator: "\u{0}"), save: save) {
            if record == nil {
                Picker(store.t("Teach"), selection: $target) {
                    ForEach(Target.allCases, id: \.self) { Text(store.t($0.rawValue)).tag($0) }
                }
            }
            switch target {
            case .student:
                if let record { Text(record.text("studentName")) }
                else { LearnerPicker(selected: $student) }
            case .group:
                Section(store.t("Students")) { LearnerChecklist(selection: $participants) }
            case .teachingClass:
                Picker(store.t("Classes"), selection: $classID) {
                    Text(store.t("Choose a class")).tag("")
                    if !classID.isEmpty && !classes.contains(where: { $0.id == classID }) {
                        Text(currentClass?.name ?? record?.text("className") ?? store.t("Classes")).tag(classID)
                    }
                    ForEach(classes) { Text($0.name).tag($0.id) }
                }
                .disabled(record != nil)
                if !classID.isEmpty {
                    Section(store.t("Attendance")) {
                        if let rosterError { LedgerError(message: rosterError) { Task { await loadClass() } } }
                        LearnerChecklist(selection: $participants, roster: classMembers)
                    }
                }
            }
            Section {
                DatePicker(store.t("Lesson date"), selection: $date, displayedComponents: .date).disabled(lockedDate)
                Toggle(store.t("Set start time"), isOn: $hasTime).disabled(lockedDate)
                if hasTime {
                    DatePicker(store.t("Start time"), selection: $time, displayedComponents: .hourAndMinute).disabled(lockedDate)
                }
                TextField(store.t("Duration (minutes)"), text: $duration).keyboardType(.numberPad).disabled(lockedDate)
                TextField(store.t("Lesson price (VND)"), text: $rate).keyboardType(.numberPad).disabled(lockedDate)
                Picker(store.t("Status"), selection: $status) {
                    if editingGroup { Text(store.t("Keep each student's status")).tag("keep") }
                    ForEach(["planned", "completed", "cancelled"], id: \.self) { Text(store.t(ledgerStatus($0))).tag($0) }
                }
                if status != "keep" && status != "cancelled" { Toggle(store.t("Charge for this lesson"), isOn: $billable) }
                TextField(store.t("Private notes"), text: $note, axis: .vertical).lineLimit(2...6)
            }
        }
        .onChange(of: target) { next in
            if record == nil { participants.removeAll() }
            if next == .teachingClass, let currentClass {
                participants = Set(classMembers.map(\.id)); rate = String(currentClass.int("rateVnd"))
            }
        }
        .task(id: target) {
            if target == .teachingClass && classes.isEmpty {
                do { classes = try await store.all("/api/classes", query: ["order": "schedule"]) }
                catch { if !Task.isCancelled { rosterError = store.t(error.localizedDescription) } }
            }
        }
        .task(id: classID) { await loadClass() }
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
