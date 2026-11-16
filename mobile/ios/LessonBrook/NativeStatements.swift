import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

struct StatementEditor: View {
    @EnvironmentObject private var store: WorkspaceStore
    let record: LedgerRecord?
    let onCreated: ((String) -> Void)?
    @State private var studentID: String
    @State private var period: LedgerPeriod
    @State private var from: Date
    @State private var to: Date
    @State private var due: Date
    @State private var eligible: [LedgerRecord] = []
    @State private var selected: Set<String>
    @State private var loading = false
    @State private var loadedKey: String?
    @State private var error: String?
    @State private var includeBank: Bool

    init(studentID: String? = nil, record: LedgerRecord? = nil, onCreated: ((String) -> Void)? = nil) {
        self.record = record
        self.onCreated = onCreated
        _studentID = State(initialValue: studentID ?? record?.text("studentId") ?? "")
        _period = State(initialValue: record == nil ? .month : .custom)
        let dates = LedgerDate.range(.month)
        _from = State(initialValue: LedgerDate.date(record?.text("periodStart") ?? dates.0) ?? .now)
        _to = State(initialValue: LedgerDate.date(record?.text("periodEnd") ?? dates.1) ?? .now)
        _due = State(initialValue: LedgerDate.date(record?.text("dueDate") ?? "") ??
            LedgerDate.calendar.date(byAdding: .day, value: 7, to: .now) ?? .now)
        _selected = State(initialValue: Set(record?.objects("items").map { $0.text("sessionId") } ?? []))
        _includeBank = State(initialValue: record?.flag("includeBankDetails") ?? true)
    }

    private var query: [String: String] {
        let dates = period == .custom ? (LedgerDate.text(from), LedgerDate.text(to)) : period.dates
        var query = ["studentId": studentID, "periodStart": dates.0 ?? LedgerDate.today, "periodEnd": dates.1 ?? LedgerDate.today]
        if let record, record.text("status") == "issued" { query["statementId"] = record.id }
        return query
    }

    var body: some View {
        let p = store.palette
        LedgerEditorForm(title: record == nil ? "Create tuition statement" : "Edit statement",
                         valid: loadedKey == key && !loading && !selected.isEmpty,
                         draftKey: [key, selected.sorted().joined(), LedgerDate.text(due), String(includeBank)].joined(separator: "\u{0}"),
                         layout: record == nil ? .page : .standard,
                         shouldDismissAfterSave: onCreated == nil, save: save) {
            WorkspaceSection(padding: 14) {
                LearnerPicker(selected: $studentID, includeArchived: true)
                    .disabled(record?.text("status") == "issued")
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 6) {
                        WorkspaceChoice(label: store.t("Lesson period"), selection: Binding(get: { period }, set: selectPeriod),
                            options: [LedgerPeriod.week, .month, .custom].map { ($0, store.t($0.rawValue)) })
                        if period != .custom {
                            let dates = period.dates
                            Text([dates.0, dates.1].compactMap { $0 }.map { LedgerDate.localized($0, locale: store.language) }.joined(separator: " – "))
                                .font(p.font(13)).foregroundStyle(p.secondaryInk)
                        }
                    }
                    WorkspaceDatePicker(store.t("Due date"), selection: $due)
                }
                if period == .custom {
                    HStack(alignment: .top, spacing: 10) {
                        WorkspaceDatePicker(store.t("From date"), selection: $from)
                        WorkspaceDatePicker(store.t("To date"), selection: $to)
                    }
                }
                if record?.text("status") != "issued" { Toggle(store.t("Include bank transfer details"), isOn: $includeBank) }
            }
            WorkspaceListCard {
                HStack {
                    Text(store.t("Eligible lessons")).font(p.font(16, .heavy)).accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 0)
                    if !eligible.isEmpty {
                        Toggle(store.t("Select all lessons"), isOn: Binding(get: { selected.count == eligible.count }, set: { all in
                            selected = all ? Set(eligible.map(\.id)) : []
                        }))
                        .disabled(eligible.count > 100)
                        .accessibilityIdentifier("select-all-eligible-lessons")
                        .fixedSize(horizontal: true, vertical: false)
                    }
                }
                .padding(12)
                Divider().overlay(p.border)
                if eligible.count > 100 {
                    Text(store.t("Each statement can include up to 100 lessons. Split them across multiple statements."))
                        .font(p.font(13)).foregroundStyle(p.secondaryInk).padding(12)
                    Divider().overlay(p.border)
                }
                if loading {
                    ProgressView().tint(p.controlTint).padding(12)
                } else if let error {
                    LedgerError(message: error) { Task { await load() } }.padding(12)
                } else if eligible.isEmpty {
                    Text(store.t(studentID.isEmpty || from > to && period == .custom
                                 ? "Choose a student and a valid date range to see lessons."
                                 : "No eligible lessons in this range."))
                        .font(p.font(14)).foregroundStyle(p.secondaryInk).padding(12)
                } else {
                    ForEach(Array(eligible.enumerated()), id: \.element.id) { index, session in
                        if index > 0 { Divider().overlay(p.border) }
                        Toggle(isOn: Binding(get: { selected.contains(session.id) }, set: { value in
                            if value { selected.insert(session.id) } else { selected.remove(session.id) }
                        })) {
                            HStack {
                                let date = LedgerDate.localized(session.text("sessionDate"), locale: store.language)
                                Text([date, session.string("startTime")].compactMap { $0 }.joined(separator: " · "))
                                Spacer(minLength: 6)
                                Text(store.money(session.int("amountVnd"))).fontWeight(.bold)
                            }
                        }
                        .disabled(!selected.contains(session.id) && selected.count >= 100)
                        .padding(.horizontal, 12).padding(.vertical, 2)
                    }
                }
            }
            WorkspaceKeyValue(store.t("Total tuition"),
                               value: store.money(eligible.filter { selected.contains($0.id) }.reduce(0) { $0 + $1.int("amountVnd") }))
        }
        .toggleStyle(WorkspaceCheckbox())
        .task(id: key + "#\(store.revision)") { await load() }
    }

    private func selectPeriod(_ next: LedgerPeriod) {
        if next == .custom && period != .custom {
            let dates = period.dates
            from = LedgerDate.date(dates.0 ?? "") ?? from
            to = LedgerDate.date(dates.1 ?? "") ?? to
        }
        period = next
    }

    private var key: String { ledgerPath("/api/statements/eligible", query) }

    private func load() async {
        error = nil
        guard !studentID.isEmpty, let start = query["periodStart"], let end = query["periodEnd"], start <= end else {
            eligible = []; selected = []; loadedKey = nil; loading = false
            return
        }
        loading = true
        let key = key
        do {
            let rows = try await store.all("/api/statements/eligible", query: query)
            try Task.checkCancellation()
            guard key == self.key else { return }
            eligible = rows
            selected.formIntersection(rows.map(\.id))
            loadedKey = key
            loading = false
        } catch {
            if !Task.isCancelled, key == self.key {
                loadedKey = nil; loading = false; self.error = store.t(error.localizedDescription)
            }
        }
    }

    private func save() async throws {
        var input = query.mapValues { LedgerValue.string($0) }
        input["statementId"] = nil
        input["dueDate"] = .string(LedgerDate.text(due))
        input["sessionIds"] = .strings(eligible.filter { selected.contains($0.id) }.map(\.id))
        input["includeBankDetails"] = .flag(includeBank)
        let path: String
        let method: String
        if let record {
            input["version"] = .number(record.int("version"))
            let issued = record.text("status") == "issued"
            path = "/api/statements/" + record.id + (issued ? "/issued" : "/publish")
            method = issued ? "PATCH" : "POST"
        } else {
            path = "/api/statements/issue"
            method = "POST"
        }
        let result = try await store.write(path, method: method, body: input)
        if record == nil { onCreated?(result.id) }
    }
}

struct NativeStatementDetail: View {
    let id: String
    @EnvironmentObject private var store: WorkspaceStore
    @State private var record: LedgerRecord?
    @State private var payments: [LedgerRecord] = []
    @State private var share: LedgerRecord?
    @State private var email: LedgerRecord?
    @State private var token: String?
    @State private var tokenHash: String?
    @State private var error: String?
    @State private var notice: String?
    @State private var edit = false
    @State private var cash = false
    @State private var cancel = false
    @State private var reason = ""
    @State private var paymentEditing: LedgerRecord?
    @State private var paymentDeleting: LedgerRecord?
    @State private var demoPreview = false

    private var path: String { "/api/statements/" + id }
    private var remaining: Int { max(0, (record?.int("totalVnd") ?? 0) - (record?.int("paidVnd") ?? 0)) }
    private var issued: Bool { record?.text("status") == "issued" }
    private var activeToken: String? {
        guard remaining > 0, let tokenHash, record?.text("activeShareTokenHash") == tokenHash else { return nil }
        return token
    }

    var body: some View {
        WorkspaceScroll(eager: true) {
            WorkspaceBackLink("Statement list", tab: .statements)
            if let record {
                VStack(alignment: .leading, spacing: 10) {
                    Text(record.string("number") ?? store.t("Draft"))
                        .font(store.palette.font(25, .heavy)).accessibilityAddTraits(.isHeader)
                    WorkspaceActionRows {
                        if record.text("status") == "draft" || (issued && record.int("activePaymentCount") == 0) {
                            Button(store.t("Edit statement")) { edit = true }
                        }
                        if record.flag("canCancel") {
                            Button(store.t("Cancel statement")) {
                                cancel.toggle()
                                reason = ""
                            }
                            .accessibilityValue(store.t(cancel ? "Expanded" : "Collapsed"))
                        }
                    }
                    .disabled(store.saving)
                }
                if record.flag("canCancel"), cancel { cancellationForm(record) }
                statement(record)
                if issued || record.text("status") == "void" { history }
                if issued, remaining > 0 { sharing }
            } else if error == nil { ProgressView() }
            if let error { LedgerError(message: error) { Task { await load() } } }
            if let notice { WorkspaceNotice(message: notice) }
        }
        .scrollContentBackground(.hidden)
        .background(store.palette.background)
        .task(id: store.revision) { await load() }
        .refreshable { await load() }
        .task {
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 30_000_000_000) } catch { return }
                if !store.saving && !edit && !cash && paymentEditing == nil { await load() }
            }
        }
        .sheet(isPresented: $edit) { if let record { StatementEditor(record: record) } }
        .sheet(item: $paymentEditing) { payment in
            PaymentEditor(statementID: id, maximum: remaining + payment.int("amountVnd"), record: payment)
        }
        .sheet(isPresented: $demoPreview) {
            if let record { NativeStatementPreview(record: record) }
        }
        .confirmationDialog(store.t("Delete payment"), isPresented: Binding(
            get: { paymentDeleting != nil }, set: { if !$0 { paymentDeleting = nil } }
        ), titleVisibility: .visible) {
            Button(store.t("Delete payment"), role: .destructive) {
                if let item = paymentDeleting {
                    Task { await perform("/api/payments/" + item.id + "/void", ["reason": .string(store.t("Payment entered in error."))]) }
                }
            }
        }
    }

    private func cancellationForm(_ record: LedgerRecord) -> some View {
        WorkspaceSection {
            Text(store.t("Cancelling revokes the share link and makes the lessons available for a new statement."))
                .font(store.palette.font(14)).foregroundStyle(store.palette.secondaryInk)
            WorkspaceField(store.t("Cancellation reason"), text: $reason, axis: .vertical)
            if let error { WorkspaceNotice(message: error, tone: .error) }
            Button(store.t("Confirm cancellation"), role: .destructive) {
                Task {
                    do {
                        _ = try await store.write(path + "/void", body: [
                            "version": .number(record.int("version")), "reason": .string(reason)
                        ])
                        cancel = false
                        reason = ""
                    } catch { self.error = store.t(error.localizedDescription) }
                }
            }
            .buttonStyle(WorkspaceActionButton(palette: store.palette))
            .disabled(store.saving || reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }

    private func statement(_ record: LedgerRecord) -> some View {
        let p = store.palette
        let items = record.objects("items")
        let issueDate = record.string("issueDate").map(displayDate) ?? store.t("Not issued")
        return WorkspaceListCard {
            VStack(alignment: .leading, spacing: 11) {
                HStack(alignment: .top) {
                    Text(store.t("Tuition statement").uppercased()).font(p.font(12, .semibold)).tracking(1.5)
                    Spacer(minLength: 6)
                    LedgerBadge(code: issued ? (remaining == 0 ? "paid" : "unpaid") : record.text("status"))
                }
                Text(record.object("teacherSnapshot")?.name ?? "").font(p.font(24, .heavy))
                Text(store.t("Student") + ": " + (record.object("recipientSnapshot")?.name ?? "")).font(p.font(16, .bold))
                Text(store.t("Lesson period") + " " + displayDate(record.text("periodStart")) + " – " + displayDate(record.text("periodEnd")))
                    .font(p.font(13))
                WorkspaceActionRows(spacing: 14) {
                    Text(store.t("Issue date") + ": " + issueDate)
                    Text(store.t("Due date") + ": " + displayDate(record.text("dueDate")))
                }
                .font(p.font(13))
            }
            .padding(14)
            .background(p.retroRows ? p.yellow : p.recordAccent)
            Divider().overlay(p.border)
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                if index > 0 { Divider().overlay(p.border) }
                WorkspaceKeyValue("\(index + 1). " + store.t("Lesson") + " " + displayDate(item.text("sessionDate")),
                                  value: store.money(item.int("amountVnd")))
                    .padding(12)
            }
            Divider().overlay(p.border)
            VStack(alignment: .leading, spacing: 10) {
                WorkspaceKeyValue(store.t("Total tuition") + " · \(items.count) " + store.t(items.count == 1 ? "lesson" : "lessons"),
                                  value: store.money(record.int("totalVnd")))
                if issued || record.text("status") == "void" {
                    WorkspaceKeyValue(store.t("Recorded payments"), value: store.money(record.int("paidVnd")))
                    WorkspaceKeyValue(store.t(record.text("status") == "void" ? "Cancelled receivable" : "Outstanding"),
                                      value: store.money(record.text("status") == "void" ? 0 : remaining))
                }
                if issued && remaining > 0 {
                    if cash {
                        PaymentEditor(statementID: id, maximum: remaining, onClose: { cash = false })
                    } else {
                        Button(store.t("Paid by cash")) { cash = true }
                    }
                }
                if record.text("status") == "draft" {
                    Button(store.t("Issue statement")) {
                        Task { await perform(path + "/issue", ["version": .number(record.int("version"))]) }
                    }
                    .buttonStyle(WorkspaceActionButton(palette: p))
                }
            }
            .padding(14)
            if issued, remaining > 0 { transfer(record) }
        }
    }

    @ViewBuilder private func transfer(_ record: LedgerRecord) -> some View {
        if let bank = record.object("bankTransferSnapshot"), let reference = record.string("transferReference") {
            Divider().overlay(store.palette.border)
            VStack(alignment: .leading, spacing: 10) {
                Text(store.t("Bank transfer details")).font(store.palette.font(18, .heavy))
                if let payload = VietQRImage.payload(bank: bank, amount: remaining, reference: reference) {
                    VietQRCode(payload: payload, size: 190, label: "VietQR")
                        .padding(12).background(.white)
                        .frame(maxWidth: .infinity)
                }
                WorkspaceKeyValue(store.t("Bank"), value: bank.text("bankName"))
                WorkspaceKeyValue(store.t("Account number"), value: bank.text("accountNumber")).textSelection(.enabled)
                WorkspaceKeyValue(store.t("Account holder"), value: bank.text("accountName"))
                WorkspaceKeyValue(store.t("Transfer reference"), value: reference).textSelection(.enabled)
            }
            .padding(14)
        } else if let legacy = record.string("bankSnapshot"), !legacy.isEmpty {
            WorkspaceSection(store.t("Bank transfer details")) { Text(legacy) }
        }
    }

    private var history: some View {
        let p = store.palette
        return WorkspaceSection {
            Text(store.t("Payment history")).font(p.font(21, .heavy)).accessibilityAddTraits(.isHeader)
            if payments.isEmpty {
                Text(store.t("No payments yet.")).foregroundStyle(p.secondaryInk)
            }
            ForEach(payments) { item in
                let deleted = item.string("voidedAt") != nil
                let method = store.t(item.text("method") == "cash" ? "Cash" : "Bank transfer")
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .center, spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(store.money(item.int("amountVnd"))).font(p.font(15, .bold))
                            Text(recordedAt(item.text("recordedAt")) + " · " + method)
                                .font(p.font(12)).foregroundStyle(p.secondaryInk)
                        }
                        Spacer(minLength: 0)
                        if deleted {
                            Text(store.t("Deleted")).font(p.font(13)).foregroundStyle(p.secondaryInk)
                        } else if issued {
                            Button(store.t("Edit")) { paymentEditing = item }
                            Button(store.t("Delete"), role: .destructive) { paymentDeleting = item }
                        }
                    }
                    .buttonStyle(WorkspaceOutlineButton(palette: p, compact: true))
                    if !item.text("privateNote").isEmpty {
                        Text(item.text("privateNote")).font(p.font(13))
                    }
                    if deleted, !item.text("voidReason").isEmpty {
                        Text(item.text("voidReason")).font(p.font(13)).foregroundStyle(p.secondaryInk)
                    }
                }
                .padding(8)
                .overlay(RoundedRectangle(cornerRadius: p.fieldRadius).strokeBorder(p.border, lineWidth: 1))
            }
        }
    }

    private func displayDate(_ date: String) -> String {
        LedgerDate.localized(date, locale: store.language)
    }

    private var sharing: some View {
        let p = store.palette
        return WorkspaceSection {
            Text(store.t("Share statement")).font(p.font(21, .heavy)).accessibilityAddTraits(.isHeader)
            Text(store.t("Review the statement above before sharing."))
                .font(p.font(13)).foregroundStyle(p.secondaryInk)
            if store.demo {
                Text(store.t("This sample link opens in the current demo tab."))
                    .font(p.font(13)).foregroundStyle(p.secondaryInk)
            }
            if let activeToken {
                if store.demo {
                    Button(store.t("Open public statement")) { demoPreview = true }
                    Text(store.t("The demo does not send real email."))
                        .font(p.font(13)).foregroundStyle(p.secondaryInk)
                } else if let url = URL(string: MobileSignIn.origin.absoluteString + "/s#" + activeToken) {
                    Text(url.absoluteString)
                        .font(p.font(13)).textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .modifier(WorkspaceControl())
                        .accessibilityLabel(store.t("New share link"))
                    WorkspaceActionRows {
                        Button(store.t("Copy link")) {
                            UIPasteboard.general.url = url
                            notice = store.t("Link copied.")
                        }
                        ShareLink(item: url) { Label(store.t("Share link"), systemImage: "square.and.arrow.up") }
                    }
                    Link(store.t("Open public statement"), destination: url)
                    if email?.flag("available") == true, let recipient = email?.string("recipient") {
                        Button(store.t("Send email")) {
                            Task {
                                await perform(path + "/share-email", ["token": .string(activeToken), "recipient": .string(recipient)],
                                              success: store.t("Email sent"))
                            }
                        }
                    }
                }
            }
            WorkspaceActionRows {
                Button(store.t(share?.flag("active") == true ? "Create new share link" : "Share")) {
                    Task { await shareLink() }
                }
                .buttonStyle(WorkspaceActionButton(palette: p))
                .disabled(record == nil)
                if share?.flag("active") == true, let record {
                    Button(store.t("Revoke link")) {
                        Task {
                            do {
                                _ = try await store.write(path + "/revoke-share", body: ["version": .number(record.int("version"))])
                                token = nil
                                tokenHash = nil
                            } catch { self.error = store.t(error.localizedDescription) }
                        }
                    }
                }
            }
        }
        .disabled(store.saving)
    }

    private func recordedAt(_ value: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = parser.date(from: value) ?? ISO8601DateFormatter().date(from: value)
        guard let date else { return value }
        let display = DateFormatter()
        display.locale = store.language
        display.timeZone = LedgerDate.zone
        display.dateStyle = .medium
        display.timeStyle = .medium
        return display.string(from: date)
    }

    private func load() async {
        error = nil
        do {
            let data: LedgerRecord = try await store.read(path)
            try Task.checkCancellation()
            record = data
            if data.text("status") != "draft" {
                payments = try await store.all(path + "/payments", refresh: true)
            }
            if data.text("status") == "issued", remaining > 0 {
                if store.demo {
                    share = try await store.read(path + "/share")
                } else {
                    async let link: LedgerRecord = store.read(path + "/share")
                    async let options: LedgerRecord = store.read(path + "/share-email")
                    (share, email) = try await (link, options)
                }
            }
        } catch { if !Task.isCancelled { self.error = store.t(error.localizedDescription) } }
    }

    private func perform(_ path: String, _ body: [String: LedgerValue], success: String? = nil) async {
        do { _ = try await store.write(path, body: body); notice = success }
        catch { self.error = store.t(error.localizedDescription) }
    }

    private func shareLink() async {
        guard let record else { return }
        do {
            let result = try await store.write(path + "/share", body: ["version": .number(record.int("version"))])
            token = result.string("token")
            tokenHash = result.string("tokenHash")
            if token == nil { notice = store.t("Create new link") }
        } catch { self.error = store.t(error.localizedDescription) }
    }
}

struct PaymentEditor: View {
    @EnvironmentObject private var store: WorkspaceStore
    let statementID: String
    let maximum: Int
    let record: LedgerRecord?
    let onClose: (() -> Void)?
    @State private var date: Date
    @State private var amount: String
    @State private var note: String
    @State private var error: String?

    init(statementID: String, maximum: Int, record: LedgerRecord? = nil, onClose: (() -> Void)? = nil) {
        self.statementID = statementID
        self.maximum = maximum
        self.record = record
        self.onClose = onClose
        _date = State(initialValue: LedgerDate.date(record?.text("receivedDate") ?? "") ?? .now)
        _amount = State(initialValue: record.map { String($0.int("amountVnd")) } ?? "")
        _note = State(initialValue: record?.text("privateNote") ?? "")
    }

    private var valid: Bool { Int(amount).map { $0 > 0 && $0 <= maximum } ?? false }

    var body: some View {
        if let onClose {
            let p = store.palette
            VStack(alignment: .leading, spacing: 10) {
                Text(store.t("Paid by cash")).font(p.font(16, .heavy)).accessibilityAddTraits(.isHeader)
                fields
                if let error { WorkspaceNotice(message: error, tone: .error) }
                WorkspaceActionRows {
                    Button(store.t("Save payment")) {
                        Task {
                            do { try await save(); onClose() }
                            catch { self.error = store.t(error.localizedDescription) }
                        }
                    }
                    .buttonStyle(WorkspaceActionButton(palette: p))
                    .accessibilityIdentifier("Save")
                    .disabled(!valid || store.saving)
                    Button(store.t("Cancel"), action: onClose).disabled(store.saving)
                }
            }
            .padding(12)
            .foregroundStyle(p.foreground)
            .background(p.surface, in: RoundedRectangle(cornerRadius: p.fieldRadius))
            .overlay(RoundedRectangle(cornerRadius: p.fieldRadius).strokeBorder(p.border, lineWidth: 1))
        } else {
            LedgerEditorForm(title: "Edit payment", valid: valid,
                             draftKey: [amount, LedgerDate.text(date), note].joined(separator: "\u{0}"), save: save) {
                fields
            }
        }
    }

    @ViewBuilder private var fields: some View {
        WorkspaceField(store.t("Amount received (VND)"), text: $amount).keyboardType(.numberPad)
        WorkspaceDatePicker(store.t("Receipt date"), selection: $date, in: ...Date.now, displayedComponents: .date)
        WorkspaceField(store.t("Payment note (private)"), text: $note, axis: .vertical).lineLimit(2...5)
    }

    private func save() async throws {
        var body: [String: LedgerValue] = ["amountVnd": .number(Int(amount) ?? 0),
            "receivedDate": .string(LedgerDate.text(date)), "privateNote": .string(note)]
        if let record {
            body["expectedUpdatedAt"] = .text(record.string("updatedAt"))
            _ = try await store.write("/api/payments/" + record.id, method: "PATCH", body: body)
        } else {
            body["method"] = .string("cash")
            _ = try await store.write("/api/statements/" + statementID + "/payments", body: body)
        }
    }
}

struct NativeStatementPreview: View {
    @EnvironmentObject private var store: WorkspaceStore
    @Environment(\.dismiss) private var dismiss
    let record: LedgerRecord

    private let paper = WorkspacePalette.color(0xf6f7f2)
    private let summary = WorkspacePalette.color(0xf4f6ed)
    private let ink = WorkspacePalette.color(0x21392e)
    private let border = WorkspacePalette.color(0xd9dfd2)
    private var outstanding: Int { max(0, record.int("totalVnd") - record.int("paidVnd")) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Spacer(minLength: 0)
                    Button(store.t("Close")) { dismiss() }.font(.system(size: 14, weight: .bold))
                        .padding(.horizontal, 15).frame(minHeight: 42)
                        .background(.white, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(border))
                        .buttonStyle(.plain)
                }
                HStack(spacing: 4) {
                    Text("LessonBrook").font(.system(size: 22, weight: .semibold, design: .serif))
                    Text("· " + store.t("Lesson & tuition ledger")).font(.system(size: 13))
                }
                VStack(alignment: .leading, spacing: 0) {
                    header
                    let items = record.objects("items")
                    ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                        Divider().overlay(border)
                        amountRow("\(index + 1). " + store.t("Lessons") + " " + date(item.text("sessionDate")),
                                  item.int("amountVnd")).padding(14)
                    }
                    Divider().overlay(border)
                    VStack(alignment: .leading, spacing: 12) {
                        amountRow(store.t("Total tuition"), record.int("totalVnd"))
                        amountRow(store.t("Recorded payments"), record.int("paidVnd"))
                        amountRow(store.t("Outstanding"), outstanding).font(.system(size: 16))
                        Text(store.t(outstanding == 0 ? "Paid" : "Unpaid"))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(outstanding == 0 ? WorkspacePalette.color(0x265d47) : WorkspacePalette.color(0x9e2623))
                            .padding(.horizontal, 7).padding(.vertical, 4)
                            .background(outstanding == 0 ? WorkspacePalette.color(0xe4f1e7) : WorkspacePalette.color(0xf8e9e5),
                                        in: RoundedRectangle(cornerRadius: 5))
                    }.padding(14)
                    if outstanding > 0, let bank = record.object("bankTransferSnapshot"), let reference = record.string("transferReference") {
                        payment(bank, reference: reference)
                    }
                }
                .background(.white)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(border))
            }
            .frame(maxWidth: 600)
            .padding(16)
            .frame(maxWidth: .infinity)
        }
        .font(.system(size: 14))
        .foregroundStyle(ink)
        .background(paper.ignoresSafeArea())
        .preferredColorScheme(.light)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(store.t("Tuition statement").uppercased()).font(.system(size: 12, weight: .bold)).tracking(1.2)
            Text(record.object("teacherSnapshot")?.name ?? "")
                .font(.system(size: 29, weight: .semibold, design: .serif)).accessibilityAddTraits(.isHeader)
            Text(store.t("Student") + ": " + (record.object("recipientSnapshot")?.name ?? ""))
            Text(record.text("number") + " · " + date(record.text("issueDate"))).font(.system(size: 13))
            Text(store.t("Due date") + " " + date(record.text("dueDate"))).font(.system(size: 13))
        }
        .padding(17)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(summary)
    }

    private func payment(_ bank: LedgerRecord, reference: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider().overlay(border)
            VStack(alignment: .leading, spacing: 8) {
                Text(store.t("Payment details")).fontWeight(.bold)
                Text(store.t("Bank name") + " " + bank.text("bankName"))
                Text(store.t("Account number") + " " + bank.text("accountNumber")).textSelection(.enabled)
                Text(store.t("Account holder name") + " " + bank.text("accountName"))
                Text(store.t("Transfer reference") + " " + reference).textSelection(.enabled)
                if let payload = VietQRImage.payload(bank: bank, amount: outstanding, reference: reference) {
                    VietQRCode(payload: payload, size: 148, label: store.t("Sample QR code"))
                    Text(store.t("This is a sample QR code.")).font(.system(size: 12))
                }
            }.padding(14)
        }
    }

    private func amountRow(_ label: String, _ amount: Int) -> some View {
        HStack(alignment: .top) {
            Text(label)
            Spacer(minLength: 6)
            Text(store.money(amount)).fontWeight(.bold).monospacedDigit()
        }
    }

    private func date(_ value: String) -> String { LedgerDate.localized(value, locale: store.language) }
}

private struct VietQRCode: View {
    struct Rendered {
        let payload: String
        let image: CGImage
    }

    let payload: String
    let size: CGFloat
    let label: String
    @State private var rendered: Rendered?

    var body: some View {
        Group {
            if let rendered, rendered.payload == payload {
                Image(decorative: rendered.image, scale: 1)
                    .interpolation(.none).resizable().scaledToFit()
                    .accessibilityLabel(label)
            } else {
                Color.white.accessibilityHidden(true)
            }
        }
        .frame(width: size, height: size)
        .task(id: payload) {
            let image = await Task.detached(priority: .utility) {
                VietQRImage.image(payload: payload)
            }.value
            guard !Task.isCancelled else { return }
            rendered = image.map { Rendered(payload: payload, image: $0) }
        }
    }
}

enum VietQRImage {
    static func payload(bank: LedgerRecord, amount: Int, reference: String) -> String? {
        guard amount > 0, !reference.isEmpty else { return nil }
        func field(_ tag: String, _ value: String) -> String { tag + String(format: "%02d", value.utf8.count) + value }
        let account = field("00", bank.text("bankBin")) + field("01", bank.text("accountNumber"))
        let recipient = field("00", "A000000727") + field("01", account) + field("02", "QRIBFTTA")
        let payload = "000201010212" + field("38", recipient) + "5303704" + field("54", String(amount)) +
            "5802VN" + field("62", field("08", reference)) + "6304"
        var crc: UInt16 = 0xffff
        for byte in payload.utf8 {
            crc ^= UInt16(byte) << 8
            for _ in 0..<8 { crc = (crc << 1) ^ (crc & 0x8000 == 0 ? 0 : 0x1021) }
        }
        return payload + String(format: "%04X", crc)
    }

    static func image(payload: String) -> CGImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(payload.utf8)
        guard let image = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)) else { return nil }
        return CIContext().createCGImage(image, from: image.extent)
    }
}
