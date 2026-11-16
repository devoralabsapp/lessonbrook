import SwiftUI

struct LedgerRecordDetail: View {
    let kind: LedgerKind
    let id: String
    @EnvironmentObject private var store: WorkspaceStore
    @State private var record: LedgerRecord?
    @State private var error: String?
    @State private var editing = false
    @State private var recordingStudent = false
    @State private var markingComplete = false
    @State private var archive = false

    var body: some View {
        WorkspaceScroll(eager: kind == .classes || kind == .students) {
            if kind != .students {
                WorkspaceBackLink(backTitle, tab: kind == .classes ? .classes : nil)
            }
            if let record {
                switch kind {
                case .students: student(record)
                case .classes: teachingClass(record)
                case .sessions, .lessons: lesson(record)
                case .statements: EmptyView()
                }
                if kind != .classes && !record.text("privateNote").isEmpty {
                    WorkspaceSection(store.t("Private notes")) { Text(record.text("privateNote")) }
                }
            } else if error == nil { ProgressView() }
            if let error { LedgerError(message: error) { Task { await load() } } }
        }
        .scrollContentBackground(.hidden)
        .background(store.palette.background)
        .sheet(isPresented: $editing) {
            if let record {
                switch kind {
                case .students: StudentEditor(record: record)
                case .classes: ClassEditor(record: record)
                case .sessions, .lessons:
                    LessonEditor(record: record, editingGroup: kind == .lessons, markingComplete: markingComplete)
                case .statements: EmptyView()
                }
            }
        }
        .sheet(isPresented: $recordingStudent) { LessonEditor(studentID: id) }
        .confirmationDialog(store.t(record?.string("archivedAt") == nil ? "Archive" : "Restore"),
                            isPresented: $archive, titleVisibility: .visible) {
            Button(store.t(record?.string("archivedAt") == nil ? "Archive" : "Restore")) {
                Task { await changeArchive() }
            }
        }
        .task(id: store.revision) { await load() }
        .refreshable { await load() }
    }

    private var backTitle: String {
        switch kind {
        case .students: return "Students"
        case .classes: return "Classes"
        default: return "Lessons"
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
        let p = store.palette
        let archived = record.string("archivedAt") != nil
        VStack(alignment: .leading, spacing: 8) {
            Text(store.t("Lesson & tuition ledger").uppercased()).font(p.font(11, .semibold)).tracking(1.8)
            Text(record.name).font(p.font(25, .heavy)).accessibilityAddTraits(.isHeader)
            Text(store.t(archived ? "Archived" : "Record each lesson and track tuition accurately."))
                .font(p.font(15)).foregroundStyle(p.secondaryInk)
            WorkspaceActionRows {
                if !archived {
                    Button { recordingStudent = true } label: {
                        Label(store.t("Record lesson"), systemImage: "plus")
                    }
                    .buttonStyle(WorkspaceActionButton(palette: p))
                }
                Button(store.t("Edit student")) { editing = true }
                    .buttonStyle(WorkspaceOutlineButton(palette: p, compact: true))
                Button(store.t(archived ? "Restore" : "Archive student")) { archive = true }
                    .buttonStyle(WorkspaceOutlineButton(palette: p, compact: true))
            }
        }
        WorkspaceActionRows {
            NavigationLink(value: WorkspaceRoute.studentHistory(.statements, id)) {
                Text(store.t("Student's statements")).underline()
            }.buttonStyle(.plain)
            NavigationLink(value: WorkspaceRoute.createStatement(id)) { Text(store.t("Create statement")) }
        }
        LedgerDirectory(.sessions, relation: ["studentId": id], embedded: true)
        if !record.text("contactName").isEmpty || !record.text("phone").isEmpty || !record.text("email").isEmpty {
            WorkspaceSection(store.t("Contact information")) {
                row("Contact name", record.text("contactName"))
                row("Phone number", record.text("phone"))
                row("Email", record.text("email"))
            }
        }
    }

    @ViewBuilder private func teachingClass(_ record: LedgerRecord) -> some View {
        let members = record.objects("students")
        classOverview(record, count: members.count)
        classSchedule(record.objects("weeklySchedule"))
        classRoster(members, note: record.text("privateNote"))
        ClassLessonList(classID: id)
    }

    private func classOverview(_ record: LedgerRecord, count: Int) -> some View {
        let p = store.palette
        let archived = record.string("archivedAt") != nil
        let tuition = store.money(record.int("rateVnd")) + " " + store.t("per student per lesson")
        let students = "\(count) " + store.t(count == 1 ? "student" : "students")
        let details = (archived ? [tuition, students, store.t("Archived")] : [tuition, students]).joined(separator: " · ")
        return VStack(alignment: .leading, spacing: 8) {
            Text(record.name).font(p.font(27, .heavy)).accessibilityAddTraits(.isHeader)
                .fixedSize(horizontal: false, vertical: true)
            Text(details).font(p.font(14)).foregroundStyle(p.secondaryInk)
            WorkspaceActionRows {
                Button(store.t("Edit class")) { editing = true }
                    .buttonStyle(WorkspaceOutlineButton(palette: p, compact: true))
                if !archived {
                    NavigationLink(value: WorkspaceRoute.recordLesson(classID: id)) {
                        Text(store.t("Record class lesson"))
                    }.buttonStyle(WorkspaceActionButton(palette: p))
                        .accessibilityLabel(store.t("Record lesson for class"))
                }
                Button(store.t(archived ? "Restore class" : "Archive class")) { archive = true }
                    .buttonStyle(WorkspaceOutlineButton(palette: p, compact: true))
            }.disabled(store.saving)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func classSchedule(_ schedule: [LedgerRecord]) -> some View {
        let p = store.palette
        return WorkspaceSection {
            Text(store.t("Weekly class schedule")).font(p.font(21, .heavy)).accessibilityAddTraits(.isHeader)
            if schedule.isEmpty {
                Text(store.t("No scheduled times.")).font(p.font(14)).foregroundStyle(p.secondaryInk)
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 106), spacing: 7)], alignment: .leading, spacing: 7) {
                    ForEach(Array(schedule.enumerated()), id: \.offset) { _, slot in
                        let shape = RoundedRectangle(cornerRadius: min(8, p.fieldRadius))
                        Text(weekday(slot.int("weekday"), locale: store.language) + " · " + slot.text("time"))
                            .font(p.font(14, .semibold)).monospacedDigit()
                            .frame(maxWidth: .infinity, minHeight: 34)
                            .background(p.background, in: shape)
                            .overlay(shape.strokeBorder(p.border, lineWidth: 1))
                    }
                }
            }
        }
    }

    private func classRoster(_ members: [LedgerRecord], note: String) -> some View {
        let p = store.palette
        return WorkspaceSection {
            Text(store.t("Class students")).font(p.font(21, .heavy)).accessibilityAddTraits(.isHeader)
            Text(store.t("When recording a lesson, select only those attending. Changing class members or prices does not change past lessons."))
                .font(p.font(13)).foregroundStyle(p.secondaryInk)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(members.enumerated()), id: \.element.id) { index, student in
                    if index > 0 { Rectangle().fill(p.border.opacity(0.6)).frame(height: 1) }
                    NavigationLink(value: WorkspaceRoute.student(student.id)) {
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(student.name).font(p.font(15, .bold))
                                if student.string("archivedAt") != nil {
                                    Text(store.t("Archived · excluded from new lessons")).font(p.font(12)).foregroundStyle(p.secondaryInk)
                                }
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.caption).accessibilityHidden(true)
                        }
                        .padding(.vertical, 8).frame(minHeight: 44).contentShape(Rectangle())
                    }.buttonStyle(.plain)
                }
            }
            if !note.isEmpty {
                Divider().overlay(p.border)
                VStack(alignment: .leading, spacing: 4) {
                    Text(store.t("Private notes")).font(p.font(14, .bold))
                    Text(note).font(p.font(14))
                }.fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder private func lesson(_ record: LedgerRecord) -> some View {
        let p = store.palette
        let date = LedgerDate.localized(record.text("sessionDate"), locale: store.language)
        let time = record.string("startTime") ?? store.t("Time not set")
        Text(record.string("className") ?? record.string("studentName") ?? store.t("Group lesson"))
            .font(p.font(25, .heavy)).accessibilityAddTraits(.isHeader)
        WorkspaceSection {
            Text(date + " · " + time).font(p.font(16))
            if record.int("durationMinutes") > 0 { row("Duration (minutes)", String(record.int("durationMinutes"))) }
            row("Lesson price (VND)", store.money(record.int("rateVnd")))
            if kind == .sessions {
                LedgerBadge(code: record.text("status"))
                if let payment = record.string("paymentStatus") { LedgerBadge(code: payment) }
            }
            if editable(record) {
                WorkspaceActionRows {
                    if kind == .sessions && record.text("status") == "planned" {
                        Button(store.t("Mark completed")) { markingComplete = true; editing = true }
                            .buttonStyle(WorkspaceActionButton(palette: p)).disabled(store.saving)
                    }
                    Button(store.t("Edit lesson")) { markingComplete = false; editing = true }
                }
            }
        }
        WorkspaceSection {
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
        }
        if kind == .lessons {
            WorkspaceSection(store.t("Attendance")) {
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
        if !value.isEmpty { WorkspaceKeyValue(store.t(name), value: value) }
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


}

private struct ClassLessonList: View {
    @EnvironmentObject private var store: WorkspaceStore
    let classID: String
    @State private var page: LedgerPage?
    @State private var error: String?
    @State private var addingPage = false

    var body: some View {
        let p = store.palette
        VStack(alignment: .leading, spacing: 10) {
            Text(store.t("Class lessons")).font(p.font(20, .heavy)).accessibilityAddTraits(.isHeader)
            if let page {
                WorkspaceListCard {
                    if page.items.isEmpty {
                        Text(store.t("No lessons for this class yet.")).font(p.font(14))
                            .foregroundStyle(p.secondaryInk).padding(14)
                    }
                    ForEach(Array(page.items.enumerated()), id: \.element.id) { index, lesson in
                        if index > 0 { Rectangle().fill(p.border.opacity(0.6)).frame(height: 1) }
                        lessonRow(lesson, palette: p)
                    }
                }
                if let cursor = page.nextCursor {
                    Button(store.t("Load more")) { Task { await load(cursor: cursor) } }
                        .buttonStyle(WorkspaceOutlineButton(palette: p)).disabled(addingPage)
                }
            } else if error == nil {
                ProgressView().tint(p.controlTint)
            }
            if let error { LedgerError(message: error) { Task { await load(refresh: true) } } }
            NavigationLink(value: WorkspaceRoute.classHistory(classID)) { Text(store.t("View all lessons")) }
                .buttonStyle(WorkspaceOutlineButton(palette: p, compact: true))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: store.revision) { await load() }
    }

    private func lessonRow(_ lesson: LedgerRecord, palette p: WorkspacePalette) -> some View {
        let date = LedgerDate.localized(lesson.text("sessionDate"), locale: store.language)
        let time = lesson.string("startTime").map { " · " + $0 } ?? ""
        let count = lesson.strings("studentIds").count
        return NavigationLink(value: WorkspaceRoute.lesson(lesson.id)) {
            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(lesson.string("className") ?? store.t("Group lesson")).font(p.font(15, .bold))
                    Text(date + time + " · \(count) " + store.t(count == 1 ? "student" : "students"))
                        .font(p.font(13)).foregroundStyle(p.secondaryInk)
                }
                Spacer(minLength: 0)
                Text(store.money(lesson.int("rateVnd")) + " " + store.t("per student"))
                    .font(p.font(13, .semibold)).multilineTextAlignment(.trailing)
            }
            .padding(12).frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .contentShape(Rectangle())
            .modifier(WorkspaceListTone(palette: p, color: p.blue))
        }.buttonStyle(.plain)
            .accessibilityIdentifier("class-lesson-\(lesson.id)")
    }

    private func load(cursor: String? = nil, refresh: Bool = false) async {
        if cursor != nil && addingPage { return }
        if cursor != nil { addingPage = true }
        defer { if cursor != nil { addingPage = false } }
        error = nil
        let revision = store.revision
        var query = ["classId": classID, "order": "chronological", "limit": "20"]
        query["cursor"] = cursor
        do {
            let result = try await store.page(ledgerPath("/api/lessons", query), refresh: refresh)
            guard !Task.isCancelled, revision == store.revision else { return }
            if let cursor, let previous = page, previous.nextCursor == cursor {
                let known = Set(previous.items.map(\.id))
                page = LedgerPage(items: previous.items + result.items.filter { !known.contains($0.id) },
                                  nextCursor: result.nextCursor == cursor ? nil : result.nextCursor)
            } else if cursor == nil {
                page = result
            }
        } catch {
            if !Task.isCancelled && revision == store.revision { self.error = store.t(error.localizedDescription) }
        }
    }
}
