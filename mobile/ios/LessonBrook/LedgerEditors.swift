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

    private var saveTitle: String {
        if title.contains("student") { return "Save student" }
        if title.contains("class") { return "Save class" }
        if title == "Create statement" { return "Create statement" }
        if title.contains("statement") { return "Save statement" }
        if title == "Paid by cash" || title == "Edit payment" { return "Save payment" }
        return "Save lesson"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(store.t("Your ledger").uppercased()).font(store.palette.font(11, .semibold)).tracking(2)
                        Text(store.t(title)).font(store.palette.font(25, .bold))
                    }
                    Spacer()
                    Button { if changed { discard = true } else { dismiss() } } label: { Image(systemName: "xmark").frame(width: 36, height: 36) }
                        .buttonStyle(.plain).accessibilityLabel(store.t("Cancel")).disabled(store.saving)
                }
                Divider().overlay(store.palette.border)
                VStack(alignment: .leading, spacing: 14) { content() }
                if let error { Text(error).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently) }
                Divider().overlay(store.palette.border)
                HStack {
                    Spacer()
                    Button(store.t("Cancel")) { if changed { discard = true } else { dismiss() } }
                        .buttonStyle(WorkspaceOutlineButton(palette: store.palette)).disabled(store.saving)
                    Button(store.t(store.saving ? "Saving changes" : saveTitle)) {
                        Task {
                            do { try await save(); dismiss() }
                            catch { self.error = store.t(error.localizedDescription) }
                        }
                    }.buttonStyle(WorkspaceActionButton(palette: store.palette)).disabled(!valid || store.saving)
                        .accessibilityIdentifier("Save")
                }
            }.padding(16).font(store.palette.font()).foregroundStyle(store.palette.foreground)
        }
        .scrollDismissesKeyboard(.interactively)
        .modifier(WorkspacePanel(palette: store.palette, fill: store.palette.surface))
        .padding(12)
        .workspaceModalBackground()
        .toolbar(.hidden, for: .navigationBar)
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
            LedgerEditorForm(title: record == nil ? "Add student" : "Edit student",
                             valid: !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                             draftKey: [name, contact, phone, email, note].joined(separator: "\u{0}"), save: save) {
                WorkspaceField(store.t("Student name"), text: $name).textContentType(.name)
                WorkspaceField(store.t("Contact name"), text: $contact)
                WorkspaceField(store.t("Phone number"), text: $phone).keyboardType(.phonePad).textContentType(.telephoneNumber)
                WorkspaceField(store.t("Statement email"), text: $email).keyboardType(.emailAddress)
                    .textContentType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                WorkspaceField(store.t("Private notes"), text: $note, axis: .vertical).lineLimit(3...6)
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
                             draftKey: [name, rate, note, students.sorted().joined(), slots.map { "\($0.weekday):\(lessonTime($0.time))" }.joined()].joined(separator: "\u{0}"), save: save) {
                WorkspaceSection {
                    WorkspaceField(store.t("Class name"), text: $name)
                    WorkspaceField(store.t("Price per lesson (VND)"), text: $rate).keyboardType(.numberPad)
                    WorkspaceField(store.t("Private notes"), text: $note, axis: .vertical).lineLimit(2...6)
                }
                WorkspaceSection(store.t("Weekly schedule")) {
                    ForEach($slots) { $slot in
                        HStack(alignment: .bottom, spacing: 12) {
                            WorkspaceChoice(label: store.t("Day"), selection: $slot.weekday,
                                options: (1...7).map { ($0, weekday($0, locale: store.language)) })
                            WorkspaceDatePicker(store.t("Start time"), selection: $slot.time, displayedComponents: .hourAndMinute)
                            Button(role: .destructive) { slots.removeAll { $0.id == slot.id } } label: {
                                Image(systemName: "minus.circle")
                                    .frame(width: 44, height: 44)
                            }.buttonStyle(.borderless).accessibilityLabel(store.t("Remove time"))
                        }
                    }
                    if slots.count < 35 {
                        Button(store.t("Add weekly time")) { slots.append(.init(weekday: 1, time: lessonTimeDate("18:00"))) }
                    }
                }
                WorkspaceSection(store.t("Students")) { LearnerChecklist(selection: $students) }
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
        WorkspaceField(store.t("Search students"), text: $query)
            .task(id: store.revision) { if roster == nil { await load() } }
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
        VStack(alignment: .leading, spacing: 6) {
            Text(store.t("Students")).font(store.palette.font(15, .semibold))
            Button { query = ""; presented = true } label: {
                HStack {
                    Text(items.first { $0.id == selected }?.name ?? (label.isEmpty ? store.t(allOption ? "All students" : "Choose a student") : label))
                        .font(store.palette.font(16)).lineLimit(2)
                    Spacer(minLength: 2)
                    Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold))
                }.foregroundStyle(store.palette.foreground).modifier(WorkspaceControl())
            }.buttonStyle(.plain)
        }
        .task(id: selected) {
            if selected.isEmpty { label = ""; return }
            if let item = items.first(where: { $0.id == selected }) { label = item.name; return }
            if let record: LedgerRecord = try? await store.read("/api/students/" + selected) { label = record.name }
        }
        .sheet(isPresented: $presented) {
            NavigationStack {
                WorkspaceScroll {
                    HStack {
                        Text(store.t("Choose a student")).font(store.palette.font(21, .bold))
                        Spacer()
                        Button(store.t("Close")) { presented = false }.buttonStyle(WorkspaceOutlineButton(palette: store.palette, compact: true))
                    }
                    WorkspaceField(store.t("Search students"), text: $query)
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
                .toolbar(.hidden, for: .navigationBar)
                .task(id: store.revision) { await load() }
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
                WorkspaceChoice(label: store.t("Teach"), selection: $target,
                    options: Target.allCases.map { ($0, store.t($0.rawValue)) })
            }
            switch target {
            case .student:
                if let record { Text(record.text("studentName")) }
                else { LearnerPicker(selected: $student) }
            case .group:
                WorkspaceSection(store.t("Students")) { LearnerChecklist(selection: $participants) }
            case .teachingClass:
                WorkspaceChoice(label: store.t("Classes"), selection: $classID,
                    options: [("", store.t("Choose a class"))] + classes.map { ($0.id, $0.name) } +
                        (!classID.isEmpty && !classes.contains(where: { $0.id == classID }) ? [(classID, currentClass?.name ?? record?.text("className") ?? store.t("Classes"))] : []))
                .disabled(record != nil)
                if !classID.isEmpty {
                    WorkspaceSection(store.t("Attendance")) {
                        if let rosterError { LedgerError(message: rosterError) { Task { await loadClass() } } }
                        LearnerChecklist(selection: $participants, roster: classMembers)
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
                WorkspaceField(store.t("Lesson price (VND)"), text: $rate).keyboardType(.numberPad).disabled(lockedDate)
                if status != "keep" && status != "cancelled" { Toggle(store.t("Charge for this lesson"), isOn: $billable) }
                WorkspaceKeyValue(store.t("Lesson tuition"), value: store.money((status == "cancelled" || !billable) ? 0 : (Int(rate) ?? 0)))
                    .padding(12).background(store.palette.recordAccent, in: RoundedRectangle(cornerRadius: store.palette.fieldRadius))
                WorkspaceField(store.t("Private notes"), text: $note, axis: .vertical).lineLimit(2...6)
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
