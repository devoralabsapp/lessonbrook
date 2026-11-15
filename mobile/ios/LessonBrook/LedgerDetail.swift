import SwiftUI

struct LedgerRecordDetail: View {
    let kind: LedgerKind
    let id: String
    @EnvironmentObject private var store: WorkspaceStore
    @State private var record: LedgerRecord?
    @State private var error: String?
    @State private var editing = false
    @State private var archive = false
    @State private var statement = false

    var body: some View {
        List {
            if let record {
                switch kind {
                case .students: student(record)
                case .classes: teachingClass(record)
                case .sessions, .lessons: lesson(record)
                case .statements: EmptyView()
                }
                if !record.text("privateNote").isEmpty {
                    Section(store.t("Private notes")) { Text(record.text("privateNote")) }
                }
            } else if error == nil { ProgressView() }
            if let error { LedgerError(message: error) { Task { await load() } } }
        }
        .scrollContentBackground(.hidden)
        .background(store.palette.background)
        .navigationTitle(store.t(detailTitle))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let record, editable(record) {
                ToolbarItem(placement: .primaryAction) {
                    Button(store.t("Edit")) { editing = true }
                }
            }
        }
        .sheet(isPresented: $editing) {
            if let record {
                switch kind {
                case .students: StudentEditor(record: record)
                case .classes: ClassEditor(record: record)
                case .sessions, .lessons:
                    NavigationStack { LessonEditor(record: record, editingGroup: kind == .lessons) }
                case .statements: EmptyView()
                }
            }
        }
        .sheet(isPresented: $statement) { StatementEditor(studentID: id) }
        .confirmationDialog(store.t(record?.string("archivedAt") == nil ? "Archive" : "Restore"),
                            isPresented: $archive, titleVisibility: .visible) {
            Button(store.t(record?.string("archivedAt") == nil ? "Archive" : "Restore")) {
                Task { await changeArchive() }
            }
        }
        .task(id: store.revision) { await load() }
        .refreshable { await load() }
    }

    private var detailTitle: String {
        switch kind {
        case .students: return "Student"
        case .classes: return "Class"
        default: return "Lesson details"
        }
    }

    private func editable(_ record: LedgerRecord) -> Bool {
        if kind == .sessions { return record.string("billedStatementId") == nil }
        if kind == .lessons {
            return !record.objects("sessions").contains { $0.string("billedStatementId") != nil }
        }
        return true
    }

    @ViewBuilder private func student(_ record: LedgerRecord) -> some View {
        Section {
            Text(record.name).font(.title2.bold())
            if record.string("archivedAt") != nil { Text(store.t("Archived")).foregroundStyle(.secondary) }
            row("Contact name", record.text("contactName"))
            row("Phone number", record.text("phone"))
            row("Email", record.text("email"))
        }
        Section {
            NavigationLink(value: WorkspaceRoute.studentHistory(.sessions, id)) { Text(store.t("Lessons")) }
            NavigationLink(value: WorkspaceRoute.studentHistory(.statements, id)) { Text(store.t("Statements")) }
            Button(store.t("Create statement")) { statement = true }
            if record.string("archivedAt") == nil {
                NavigationLink(value: WorkspaceRoute.recordStudentLesson(id)) { Text(store.t("Record lesson")) }
            }
            Button(store.t(record.string("archivedAt") == nil ? "Archive" : "Restore")) { archive = true }
        }
    }

    @ViewBuilder private func teachingClass(_ record: LedgerRecord) -> some View {
        Section {
            Text(record.name).font(.title2.bold())
            row("Price per lesson (VND)", store.money(record.int("rateVnd")))
            if record.string("archivedAt") != nil { Text(store.t("Archived")).foregroundStyle(.secondary) }
        }
        Section(store.t("Weekly schedule")) {
            ForEach(Array(record.objects("weeklySchedule").enumerated()), id: \.offset) { _, slot in
                LabeledContent(weekday(slot.int("weekday"), locale: store.language), value: slot.text("time"))
            }
            if record.objects("weeklySchedule").isEmpty { Text(store.t("No scheduled times.")) }
        }
        Section(store.t("Students")) {
            ForEach(record.objects("students")) { student in
                NavigationLink(value: WorkspaceRoute.student(student.id)) { Text(student.name) }
            }
        }
        Section {
            NavigationLink(value: WorkspaceRoute.classHistory(id)) { Text(store.t("Lessons")) }
            if record.string("archivedAt") == nil {
                NavigationLink(value: WorkspaceRoute.recordLesson(classID: id)) { Text(store.t("Record lesson")) }
            }
            Button(store.t(record.string("archivedAt") == nil ? "Archive" : "Restore")) { archive = true }
        }
    }

    @ViewBuilder private func lesson(_ record: LedgerRecord) -> some View {
        Section {
            Text(record.string("className") ?? record.string("studentName") ?? store.t("Group lesson")).font(.title2.bold())
            row("Lesson date", record.text("sessionDate"))
            row("Start time", record.text("startTime"))
            if record.int("durationMinutes") > 0 { row("Duration (minutes)", String(record.int("durationMinutes"))) }
            row("Lesson price (VND)", store.money(record.int("rateVnd")))
            if kind == .sessions {
                LedgerBadge(code: record.text("status"))
                if let payment = record.string("paymentStatus") { LedgerBadge(code: payment) }
            }
        }
        Section {
            if let classID = record.string("classId") {
                NavigationLink(value: WorkspaceRoute.teachingClass(classID)) { Text(store.t("Class")) }
            }
            if let studentID = record.string("studentId") {
                NavigationLink(value: WorkspaceRoute.student(studentID)) { Text(store.t("Student")) }
            }
            if let statementID = record.string("billedStatementId") {
                NavigationLink(value: WorkspaceRoute.statement(statementID)) { Text(store.t("Tuition statement")) }
            }
            if let lessonID = record.string("lessonId") {
                NavigationLink(value: WorkspaceRoute.lesson(lessonID)) { Text(store.t("Group lesson")) }
            }
            if kind == .sessions && record.text("status") == "planned" && editable(record) {
                Button(store.t("Mark completed")) { Task { await complete() } }.disabled(store.saving)
            }
        }
        if kind == .lessons {
            Section(store.t("Attendance")) {
                ForEach(record.objects("sessions")) { session in
                    NavigationLink(value: WorkspaceRoute.session(session.id)) {
                        HStack {
                            Text(session.text("studentName"))
                            Spacer()
                            LedgerBadge(code: session.text("status"))
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private func row(_ name: String, _ value: String) -> some View {
        if !value.isEmpty { LabeledContent(store.t(name), value: value) }
    }

    private func load() async {
        error = nil
        do { record = try await store.read(kind.endpoint + "/" + id) }
        catch { if !Task.isCancelled { self.error = store.t(error.localizedDescription) } }
    }

    private func changeArchive() async {
        do {
            _ = try await store.write(kind.endpoint + "/" + id + "/archive", body: [
                "archived": .flag(record?.string("archivedAt") == nil)
            ])
        } catch { self.error = store.t(error.localizedDescription) }
    }

    private func complete() async {
        do { _ = try await store.write("/api/sessions/complete", body: ["ids": .strings([id])]) }
        catch { self.error = store.t(error.localizedDescription) }
    }
}
