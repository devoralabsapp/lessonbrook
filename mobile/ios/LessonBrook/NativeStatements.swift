import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI

struct StatementEditor: View {
    @EnvironmentObject private var store: WorkspaceStore
    let record: LedgerRecord?
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

    init(studentID: String? = nil, record: LedgerRecord? = nil) {
        self.record = record
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
            LedgerEditorForm(title: record == nil ? "Create statement" : "Edit statement",
                             valid: loadedKey == key && !loading && !selected.isEmpty,
                             draftKey: [key, selected.sorted().joined(), LedgerDate.text(due), String(includeBank)].joined(separator: "\u{0}"), save: save) {
                WorkspaceSection {
                    LearnerPicker(selected: $studentID, includeArchived: true)
                        .disabled(record?.text("status") == "issued")
                    HStack(alignment: .top, spacing: 12) {
                        WorkspaceChoice(label: store.t("Date range"), selection: $period,
                            options: [LedgerPeriod.week, .month, .custom].map { ($0, store.t($0.rawValue)) })
                        WorkspaceDatePicker(store.t("Due date"), selection: $due)
                    }
                    if period == .custom {
                        HStack(alignment: .top, spacing: 12) {
                            WorkspaceDatePicker(store.t("From date"), selection: $from)
                            WorkspaceDatePicker(store.t("To date"), selection: $to)
                        }
                    }
                    if record?.text("status") != "issued" { Toggle(store.t("Include bank transfer details"), isOn: $includeBank) }
                }
                WorkspaceSection(store.t("Eligible lessons")) {
                    if loading { ProgressView() }
                    else if let error { LedgerError(message: error) { Task { await load() } } }
                    else if eligible.isEmpty { Text(store.t("Choose a student and date range to see lessons.")) }
                    else {
                        Button(store.t(selected.count == eligible.count ? "Clear selection" : "Select all lessons")) {
                            if selected.count == eligible.count { selected.removeAll() }
                            else { selected = Set(eligible.prefix(100).map(\.id)) }
                        }
                        ForEach(eligible) { session in
                            Toggle(isOn: Binding(get: { selected.contains(session.id) }, set: { value in
                                if value { selected.insert(session.id) } else { selected.remove(session.id) }
                            })) {
                                HStack {
                                    Text(session.text("sessionDate"))
                                    Spacer()
                                    Text(store.money(session.int("amountVnd"))).fontWeight(.semibold)
                                }
                            }.disabled(!selected.contains(session.id) && selected.count >= 100)
                        }
                        WorkspaceKeyValue(store.t("Total tuition"),
                                       value: store.money(eligible.filter { selected.contains($0.id) }.reduce(0) { $0 + $1.int("amountVnd") }))
                    }
                }
            }
            .task(id: key) { await load() }
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
        _ = try await store.write(path, method: method, body: input)
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
        WorkspaceScroll {
            if let record {
                HStack {
                    Text(record.string("number") ?? store.t("Draft")).font(store.palette.font(25, .heavy))
                    Spacer()
                    if record.text("status") == "draft" || (issued && record.int("activePaymentCount") == 0) {
                        Button(store.t("Edit statement")) { edit = true }.buttonStyle(WorkspaceOutlineButton(palette: store.palette))
                    }
                }
                statement(record)
                if issued, remaining > 0 { transfer(record) }
                if issued || record.text("status") == "void" { history }
                if issued, remaining > 0 { sharing }
                if record.flag("canCancel") {
                    WorkspaceSection {
                        Button(store.t("Cancel statement"), role: .destructive) { reason = ""; cancel = true }
                            .disabled(store.saving)
                    }
                }
            } else if error == nil { ProgressView() }
            if let error { LedgerError(message: error) { Task { await load() } } }
            if let notice { Text(notice).foregroundStyle(.secondary) }
        }
        .scrollContentBackground(.hidden)
        .background(store.palette.background)
        .navigationTitle(store.t("Tuition statement"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let record, record.text("status") == "draft" ||
                (issued && record.int("activePaymentCount") == 0) {
                ToolbarItem(placement: .primaryAction) { Button(store.t("Edit")) { edit = true } }
            }
        }
        .task(id: store.revision) { await load() }
        .refreshable { await load() }
        .task {
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 30_000_000_000) } catch { return }
                if !store.saving && !edit && !cash && paymentEditing == nil { await load() }
            }
        }
        .sheet(isPresented: $edit) { if let record { StatementEditor(record: record) } }
        .sheet(isPresented: $cash) { PaymentEditor(statementID: id, maximum: remaining) }
        .sheet(item: $paymentEditing) { payment in
            PaymentEditor(statementID: id, maximum: remaining + payment.int("amountVnd"), record: payment)
        }
        .sheet(isPresented: $demoPreview) {
            if let record { NativeStatementPreview(record: record) }
        }
        .alert(store.t("Cancel statement"), isPresented: $cancel) {
            TextField(store.t("Reason"), text: $reason)
            Button(store.t("Cancel"), role: .cancel) {}
            Button(store.t("Confirm cancellation"), role: .destructive) {
                if let record {
                    Task { await perform(path + "/void", ["version": .number(record.int("version")), "reason": .string(reason)]) }
                }
            }
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

    private func statement(_ record: LedgerRecord) -> some View {
        WorkspaceSection(fill: store.palette.retroRows ? store.palette.yellow : store.palette.recordAccent) {
            HStack {
                Text(store.t("Tuition statement").uppercased()).font(store.palette.font(12, .semibold)).tracking(1.5)
                Spacer()
                LedgerBadge(code: issued ? (remaining == 0 ? "paid" : "unpaid") : record.text("status"))
            }
            Text(record.object("teacherSnapshot")?.name ?? "").font(store.palette.font(24, .heavy))
            Text(store.t("Student") + ": " + (record.object("recipientSnapshot")?.name ?? "")).font(store.palette.font(16, .bold))
            Text(record.text("periodStart") + " – " + record.text("periodEnd")).foregroundStyle(.secondary)
            WorkspaceKeyValue(store.t("Due date"), value: record.text("dueDate"))
            ForEach(Array(record.objects("items").enumerated()), id: \.offset) { _, item in
                WorkspaceKeyValue(item.text("sessionDate"), value: store.money(item.int("amountVnd")))
            }
            WorkspaceKeyValue(store.t("Total tuition"), value: store.money(record.int("totalVnd")))
            WorkspaceKeyValue(store.t("Paid"), value: store.money(record.int("paidVnd")))
            WorkspaceKeyValue(store.t("Remaining balance"), value: store.money(remaining))
            if issued && remaining > 0 { Button(store.t("Paid by cash")) { cash = true } }
            if record.text("status") == "draft" {
                Button(store.t("Issue statement")) {
                    Task { await perform(path + "/issue", ["version": .number(record.int("version"))]) }
                }
            }
        }
    }

    @ViewBuilder private func transfer(_ record: LedgerRecord) -> some View {
        if let bank = record.object("bankTransferSnapshot"), let reference = record.string("transferReference") {
            WorkspaceSection(store.t("Bank transfer details")) {
                if let qr = VietQRImage.image(bank: bank, amount: remaining, reference: reference) {
                    Image(decorative: qr, scale: 1).interpolation(.none).resizable().scaledToFit()
                        .frame(maxWidth: 190, maxHeight: 190).padding(12).background(.white)
                        .frame(maxWidth: .infinity)
                        .accessibilityLabel("VietQR")
                }
                WorkspaceKeyValue(store.t("Bank"), value: bank.text("bankName"))
                WorkspaceKeyValue(store.t("Account number"), value: bank.text("accountNumber")).textSelection(.enabled)
                WorkspaceKeyValue(store.t("Account holder"), value: bank.text("accountName"))
                WorkspaceKeyValue(store.t("Transfer reference"), value: reference).textSelection(.enabled)
            }
        } else if let legacy = record.string("bankSnapshot"), !legacy.isEmpty {
            WorkspaceSection(store.t("Bank transfer details")) { Text(legacy) }
        }
    }

    private var history: some View {
        WorkspaceSection(store.t("Payment history")) {
            if payments.isEmpty { Text(store.t("No payments yet.")).foregroundStyle(.secondary) }
            ForEach(payments) { item in
                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        Text(store.money(item.int("amountVnd"))).font(.headline)
                        Spacer(minLength: 6)
                        Text(store.t(item.text("method") == "cash" ? "Cash" : "Bank transfer"))
                    }
                    Text(recordedAt(item.text("recordedAt"))).font(.caption).foregroundStyle(.secondary)
                    if !item.text("privateNote").isEmpty { Text(item.text("privateNote")).font(.caption) }
                    if item.string("voidedAt") != nil {
                        Text(store.t("Deleted")).font(.caption).foregroundStyle(.secondary)
                        if !item.text("voidReason").isEmpty { Text(item.text("voidReason")).font(.caption) }
                    } else if issued {
                        HStack {
                            Button(store.t("Edit")) { paymentEditing = item }
                            Spacer()
                            Button(store.t("Delete"), role: .destructive) { paymentDeleting = item }
                        }.buttonStyle(.borderless)
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private var sharing: some View {
        WorkspaceSection(store.t("Share statement")) {
            if store.demo {
                Button(store.t("Preview statement")) { demoPreview = true }
            } else {
                if let activeToken, let url = URL(string: MobileSignIn.origin.absoluteString + "/s#" + activeToken) {
                    ShareLink(item: url) { Label(store.t("Share link"), systemImage: "square.and.arrow.up") }
                    if email?.flag("available") == true, let recipient = email?.string("recipient") {
                        Button(store.t("Send email")) {
                            Task {
                                await perform(path + "/share-email", ["token": .string(activeToken), "recipient": .string(recipient)],
                                              success: store.t("Email sent"))
                            }
                        }
                    }
                } else {
                    Button(store.t(share?.flag("active") == true ? "Create new link" : "Share statement")) {
                        Task { await shareLink() }
                    }.disabled(record == nil)
                }
                if share?.flag("active") == true, let record {
                    Button(store.t("Revoke link"), role: .destructive) {
                        Task {
                            await perform(path + "/revoke-share", ["version": .number(record.int("version"))])
                            token = nil; tokenHash = nil
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
        guard let date = parser.date(from: value) else { return value }
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
            if !store.demo, data.text("status") == "issued", remaining > 0 {
                async let link: LedgerRecord = store.read(path + "/share")
                async let options: LedgerRecord = store.read(path + "/share-email")
                (share, email) = try await (link, options)
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
    @State private var date: Date
    @State private var amount: String
    @State private var note: String

    init(statementID: String, maximum: Int, record: LedgerRecord? = nil) {
        self.statementID = statementID
        self.maximum = maximum
        self.record = record
        _date = State(initialValue: LedgerDate.date(record?.text("receivedDate") ?? "") ?? .now)
        _amount = State(initialValue: String(record?.int("amountVnd") ?? maximum))
        _note = State(initialValue: record?.text("privateNote") ?? "")
    }

    var body: some View {
            LedgerEditorForm(title: record == nil ? "Paid by cash" : "Edit payment",
                             valid: (Int(amount).map { $0 > 0 && $0 <= maximum } ?? false),
                             draftKey: [amount, LedgerDate.text(date), note].joined(separator: "\u{0}"), save: save) {
                WorkspaceField(store.t("Amount received (VND)"), text: $amount).keyboardType(.numberPad)
                WorkspaceDatePicker(store.t("Date received"), selection: $date, in: ...Date.now, displayedComponents: .date)
                WorkspaceField(store.t("Private notes"), text: $note, axis: .vertical).lineLimit(2...5)
            }
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
    var body: some View {
        let light = WorkspacePalette("playful-retro")
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text(store.t("Tuition statement").uppercased()).font(light.font(12, .semibold)).tracking(1.5)
                    Spacer()
                    Button(store.t("Close")) { dismiss() }.buttonStyle(WorkspaceOutlineButton(palette: light, compact: true))
                }
                Text(record.text("number")).font(light.font(24, .heavy))
                Text(record.object("teacherSnapshot")?.name ?? "").font(light.font(22, .bold))
                Text(record.object("recipientSnapshot")?.name ?? "").font(light.font(17, .semibold))
                Text(record.text("periodStart") + " – " + record.text("periodEnd")).font(light.font(14))
                Divider()
                ForEach(Array(record.objects("items").enumerated()), id: \.offset) { _, item in
                    HStack { Text(item.text("sessionDate")); Spacer(); Text(store.money(item.int("amountVnd"))) }
                }
                Divider()
                HStack { Text(store.t("Total tuition")); Spacer(); Text(store.money(record.int("totalVnd"))).bold() }
                HStack { Text(store.t("Remaining balance")); Spacer(); Text(store.money(record.int("totalVnd") - record.int("paidVnd"))).bold() }
            }.font(light.font(15)).padding(18).foregroundStyle(light.foreground)
                .modifier(WorkspacePanel(palette: light, fill: light.surface)).padding(12)
        }.background(light.background).preferredColorScheme(.light)
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

    static func image(bank: LedgerRecord, amount: Int, reference: String) -> CGImage? {
        guard let payload = payload(bank: bank, amount: amount, reference: reference) else { return nil }
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(payload.utf8)
        guard let image = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)) else { return nil }
        return CIContext().createCGImage(image, from: image.extent)
    }
}
