import CryptoKit
import SwiftUI
import UniformTypeIdentifiers

struct NativeSettings: View {
    @EnvironmentObject private var store: WorkspaceStore
    private static let banks = [
        ("970425", "ABBANK"),
        ("970416", "ACB"),
        ("970405", "Agribank"),
        ("970409", "BacABank"),
        ("970438", "BaoVietBank"),
        ("970418", "BIDV"),
        ("546034", "CAKE"),
        ("970444", "CBBank"),
        ("422589", "CIMB"),
        ("970446", "COOPBANK"),
        ("970431", "Eximbank"),
        ("970437", "HDBank"),
        ("970434", "IndovinaBank"),
        ("668888", "KBank"),
        ("970452", "KienLongBank"),
        ("970463", "KookminHCM"),
        ("970462", "KookminHN"),
        ("970449", "LPBank"),
        ("970422", "MBBank"),
        ("970414", "MBV"),
        ("971025", "MoMo"),
        ("970426", "MSB"),
        ("971032", "MVAS"),
        ("970428", "NamABank"),
        ("970419", "NCB"),
        ("970448", "OCB"),
        ("970430", "PGBank"),
        ("970412", "PVcomBank"),
        ("971133", "PVcomBank Pay"),
        ("970403", "Sacombank"),
        ("970400", "SaigonBank"),
        ("970429", "SCB"),
        ("970440", "SeABank"),
        ("970443", "SHB"),
        ("970424", "ShinhanBank"),
        ("970407", "Techcombank"),
        ("963388", "Timo"),
        ("970423", "TPBank"),
        ("546035", "Ubank"),
        ("970441", "VIB"),
        ("970427", "VietABank"),
        ("970433", "VietBank"),
        ("970454", "VietCapitalBank"),
        ("970436", "Vietcombank"),
        ("970415", "VietinBank"),
        ("970432", "VPBank"),
        ("970457", "Woori"),
        ("971101", "ZaloPay")
    ]
    @Environment(\.openURL) private var openURL
    @ScaledMetric(relativeTo: .body) private var settingsSpacing = 16.0
    @State private var profile: LedgerRecord?
    @State private var displayName = ""
    @State private var bankBin = ""
    @State private var account = ""
    @State private var accountName = ""
    @State private var error: String?
    @State private var notice: String?
    @State private var disconnectAll = false
    @State private var deleting = false
    @State private var confirmation = ""
    @State private var export: LedgerExportDocument?
    @State private var exportPresented = false
    @State private var exporting = false

    var body: some View {
        let p = store.palette
        WorkspaceScroll(eager: true) {
            VStack(alignment: .leading, spacing: settingsSpacing) {
                VStack(alignment: .leading, spacing: 7) {
                    Text(store.t("YOUR WORKSPACE")).font(p.font(12)).foregroundStyle(p.secondaryInk)
                    Text(store.t("Account settings")).font(p.font(25, .heavy)).accessibilityAddTraits(.isHeader)
                }
                NavigationLink(value: WorkspaceRoute.onboarding) {
                    Text(store.t("View getting started guide"))
                        .font(p.font(15)).underline()
                        .padding(.vertical, 3)
                }
                .buttonStyle(.plain)
                WorkspaceActionRows(spacing: 16) {
                    infoLink("Help & support", url: MobileSignIn.origin.appending(path: "help"))
                    infoLink("Data & privacy", url: MobileSignIn.origin.appending(path: "privacy"))
                    infoLink("Add to your home screen", url: URL(string: "/help#install", relativeTo: MobileSignIn.origin) ?? MobileSignIn.origin)
                }
                .foregroundStyle(p.secondaryInk)
            }
            .padding(.top, 2).padding(.bottom, 6)
            WorkspaceSection(padding: 14) {
                if let profile {
                    if let email = profile.string("email") {
                        Text(email).font(p.font(13)).foregroundStyle(p.secondaryInk)
                    }
                    WorkspaceField(store.t("Teacher / class name"), text: $displayName)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(store.t("Currency: VND · Time zone: Vietnam."))
                        Text(store.t("The ledger only records lessons you enter; it excludes earlier debts."))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .font(p.font(13)).foregroundStyle(p.secondaryInk).lineSpacing(4)
                    .padding(.vertical, 2)
                    Button(store.t("Save profile")) {
                        Task {
                            await perform {
                                _ = try await store.write("/api/profile", method: "PATCH", body: ["displayName": .string(displayName)])
                                await store.refreshDashboard()
                            }
                        }
                    }
                    .buttonStyle(WorkspaceActionButton(palette: p))
                    .disabled(store.saving || displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } else if error == nil {
                    ProgressView().tint(p.controlTint)
                }
                if let error { WorkspaceNotice(message: error, tone: .error) }
                if let notice { WorkspaceNotice(message: notice) }
            }
            WorkspaceSection(padding: 14) {
                Text(store.t("Bank transfer details")).font(p.font(21, .heavy)).accessibilityAddTraits(.isHeader)
                Text(store.t("Saved details are used to create a VietQR when you issue a statement. Anyone with the statement link can see these details."))
                    .font(p.font(15)).foregroundStyle(p.secondaryInk).lineSpacing(5)
                    .fixedSize(horizontal: false, vertical: true)
                WorkspaceChoice(label: store.t("Bank name"), selection: $bankBin,
                    options: [("", store.t("Choose a bank"))] + Self.banks +
                        (!bankBin.isEmpty && !Self.banks.contains(where: { $0.0 == bankBin }) ? [(bankBin, bankBin)] : []))
                WorkspaceField(store.t("Account number"), text: $account).keyboardType(.numberPad)
                WorkspaceField(store.t("Account holder name"), text: $accountName)
                WorkspaceActionRows {
                    Button(store.t("Save bank transfer details")) {
                        Task {
                            await perform {
                                _ = try await store.write("/api/profile/bank-transfer", method: "PATCH", body: [
                                    "bankTransfer": .object(["bankBin": .string(bankBin), "accountNumber": .string(account),
                                                             "accountName": .string(accountName)])
                                ])
                            }
                        }
                    }
                    .buttonStyle(WorkspaceActionButton(palette: p))
                    .disabled(store.saving || bankBin.count != 6 || account.count < 6 || accountName.isEmpty)
                    if profile?.object("bankTransfer") != nil {
                        Button(store.t("Clear bank transfer details")) {
                            Task {
                                await perform {
                                    _ = try await store.write("/api/profile/bank-transfer", method: "PATCH", body: ["bankTransfer": .null])
                                    bankBin = ""
                                    account = ""
                                    accountName = ""
                                }
                            }
                        }
                        .disabled(store.saving)
                    }
                }
                Divider().overlay(p.border).padding(.vertical, 3)
                Text(store.t("Automatic reconciliation with Shortcuts")).font(p.font(16, .bold))
                Text(store.t("Send the original incoming payment notification. LessonBrook records the transfer when the account, transfer reference and outstanding balance match. Record cash in the statement."))
                    .font(p.font(14)).foregroundStyle(p.secondaryInk).fixedSize(horizontal: false, vertical: true)
                Text(store.t("Confirm with Google once to let the Shortcut renew its session automatically."))
                    .font(p.font(14)).foregroundStyle(p.secondaryInk).fixedSize(horizontal: false, vertical: true)
                if store.demo {
                    Button(store.t("Sign in to use this feature.")) { Task { await store.beginSignIn(open: openURL) } }
                } else {
                    BankShortcutForm(accountNumber: account)
                }
            }
            WorkspaceSection(store.t("Your data")) {
                WorkspaceActionRows {
                    Button(store.t(exporting ? "Preparing export…" : "Export all data")) { Task { await exportData() } }
                        .disabled(exporting || store.saving)
                }
            }
            WorkspaceSection {
                WorkspaceActionRows {
                    if store.demo {
                        Button(store.t("Sign in")) { Task { await store.beginSignIn(open: openURL) } }
                        Button(store.t("Exit demo")) { Task { await store.signOut() } }
                    } else {
                        Button(store.t("Sign out")) { Task { await store.signOut() } }
                        Button(store.t("Sign out on all devices")) { disconnectAll = true }
                        Button(store.t("Delete account"), role: .destructive) { confirmation = ""; deleting = true }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(store.palette.background)
        .task { await load() }
        .confirmationDialog(store.t("Sign out on all devices"), isPresented: $disconnectAll) {
            Button(store.t("Sign out"), role: .destructive) { Task { await store.signOut(allDevices: true) } }
        }
        .sheet(isPresented: $deleting) {
            NavigationStack {
                WorkspaceScroll {
                    WorkspaceSection {
                        Text(store.t("This permanently deletes your account, lessons, statements and payment history."))
                        WorkspaceField("DELETE ACCOUNT", text: $confirmation).textInputAutocapitalization(.characters)
                        Button(store.t("Confirm with Google and delete"), role: .destructive) {
                            Task {
                                do { try await store.startDeletion(confirmation); deleting = false }
                                catch { self.error = store.t(error.localizedDescription); deleting = false }
                            }
                        }.disabled(confirmation != "DELETE ACCOUNT" || !store.hasNativeGoogle || store.saving)
                    }
                    if !store.hasNativeGoogle {
                        Text(store.t("Connect native Google sign-in to confirm this action."))
                    }
                }
                .navigationTitle(store.t("Delete account"))
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button(store.t("Cancel")) { deleting = false } } }
            }
        }
        .fileExporter(isPresented: $exportPresented, document: export, contentType: .json,
                      defaultFilename: "LessonBrook-\(LedgerDate.today)") { result in
            export = nil
            if case .failure(let failure) = result { error = store.t(failure.localizedDescription) }
        }
    }

    private func infoLink(_ title: String, url: URL) -> some View {
        Link(destination: url) {
            Text(store.t(title)).font(store.palette.font(13)).underline()
                .padding(.vertical, 3)
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        do {
            let result: LedgerRecord = try await store.read("/api/profile")
            profile = result
            displayName = result.name
            let bank = result.object("bankTransfer")
            bankBin = bank?.text("bankBin") ?? ""
            account = bank?.text("accountNumber") ?? ""
            accountName = bank?.text("accountName") ?? ""
        } catch { self.error = store.t(error.localizedDescription) }
    }

    private func perform(_ run: () async throws -> Void) async {
        error = nil; notice = nil
        do { try await run(); notice = store.t("Saved"); await load() }
        catch { self.error = store.t(error.localizedDescription) }
    }

    private func exportData() async {
        exporting = true
        error = nil
        defer { exporting = false }
        do {
            let job = try await store.write("/api/exports", body: ["dataset": .string("all")])
            let datasets = ["profile", "students", "classes", "lessons", "appearance", "sessions", "statements",
                            "statementItems", "payments", "auditEvents"]
            var data: [String: LedgerValue] = [:]
            var bytes = 0
            for dataset in datasets {
                var records: [LedgerValue] = []
                var parameters = ["dataset": dataset, "limit": "100"]
                var cursors = Set<String>()
                repeat {
                    let page: LedgerRecord = try await store.read(ledgerPath("/api/exports/" + job.id, parameters))
                    let items = page.objects("records").map { LedgerValue.object($0.fields) }
                    bytes += try JSONEncoder().encode(items).count
                    guard bytes <= 32 * 1024 * 1024 else { throw MobileSignIn.Failure.invalidResponse }
                    records += items
                    parameters["cursor"] = page.string("nextCursor")
                    if let cursor = parameters["cursor"], !cursors.insert(cursor).inserted {
                        throw MobileSignIn.Failure.invalidResponse
                    }
                } while parameters["cursor"] != nil
                data[dataset] = .array(records)
            }
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            export = LedgerExportDocument(data: try encoder.encode(data))
            exportPresented = true
        } catch { self.error = store.t(error.localizedDescription) }
    }
}

struct LedgerExportDocument: FileDocument {
    static let readableContentTypes = [UTType.json]
    let data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct BankShortcutForm: View {
    private struct Connection: Decodable {
        let accountLast4: String
        let renewable: Bool
        let expiresAt: String?
    }

    @EnvironmentObject private var store: WorkspaceStore
    let accountNumber: String
    @State private var connection: Connection?
    @State private var key: String?
    @State private var error: String?
    @State private var loaded = false
    @State private var working = false
    @State private var manage = false
    @State private var disconnect = false

    var body: some View {
        let p = store.palette
        VStack(alignment: .leading, spacing: 10) {
            if let connection {
                VStack(alignment: .leading, spacing: 5) {
                    Label(store.t("Connected"), systemImage: "checkmark.circle.fill")
                        .font(p.font(15, .bold))
                    WorkspaceKeyValue(store.t("Receiving account"), value: "•••• " + connection.accountLast4)
                    if connection.renewable {
                        Text(store.t("Automatically renews")).font(p.font(13)).foregroundStyle(p.secondaryInk)
                    } else if let expiresAt = connection.expiresAt {
                        Text(store.t("Expires") + " · " + expiryLabel(expiresAt))
                            .font(p.font(13)).foregroundStyle(p.secondaryInk)
                    }
                }
                .padding(10)
                .background(p.background, in: RoundedRectangle(cornerRadius: p.fieldRadius))

                Button { manage.toggle() } label: {
                    HStack(spacing: 10) {
                        Text(store.t("Manage Shortcut"))
                        Spacer(minLength: 0)
                        Image(systemName: manage ? "chevron.up" : "chevron.down").accessibilityHidden(true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(WorkspaceOutlineButton(palette: p, compact: true))
                .accessibilityValue(store.t(manage ? "Expanded" : "Collapsed"))
                if manage {
                    WorkspaceActionRows {
                        Button(store.t("Replace Shortcut key")) { Task { await connect() } }
                            .buttonStyle(WorkspaceOutlineButton(palette: p, compact: true))
                            .disabled(accountNumber.count < 6 || working || store.saving)
                        setupLink
                    }
                    Button(store.t("Disconnect Shortcut"), role: .destructive) { disconnect = true }
                        .font(p.font(14, .semibold)).foregroundStyle(.red)
                        .frame(minHeight: 44, alignment: .leading)
                        .disabled(working || store.saving)
                }
            } else if loaded {
                WorkspaceActionRows {
                    Button(store.t("Connect Shortcut")) { Task { await connect() } }
                        .buttonStyle(WorkspaceActionButton(palette: p))
                        .disabled(accountNumber.count < 6 || working || store.saving)
                    setupLink
                }
            } else if error == nil || working {
                ProgressView().tint(p.controlTint)
            } else {
                Button(store.t("Try again")) { Task { await load() } }
                    .buttonStyle(WorkspaceOutlineButton(palette: p, compact: true))
            }
            if let error { Text(error).font(p.font(13)).foregroundStyle(.red) }
        }
        .task { await load() }
        .sheet(isPresented: Binding(get: { key != nil }, set: { if !$0 { key = nil } })) {
            if let key { keySheet(key) }
        }
        .confirmationDialog(store.t("Disconnect Shortcut"), isPresented: $disconnect) {
            Button(store.t("Disconnect"), role: .destructive) { Task { await disconnectShortcut() } }
        }
    }

    private var setupLink: some View {
        Link(store.t("Shortcut setup"), destination: MobileSignIn.origin.appending(path: "help"))
            .buttonStyle(WorkspaceOutlineButton(palette: store.palette, compact: true))
    }

    private func keySheet(_ key: String) -> some View {
        let p = store.palette
        return WorkspaceScroll(eager: true) {
            WorkspaceSection(store.t("Shortcut authorization key")) {
                Text(store.t("Save this Shortcut authorization key now. It is shown once."))
                    .foregroundStyle(p.secondaryInk)
                Text(key)
                    .font(.system(.footnote, design: .monospaced))
                    .textSelection(.enabled)
                    .privacySensitive()
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(p.background, in: RoundedRectangle(cornerRadius: p.fieldRadius))
                WorkspaceActionRows {
                    ShareLink(item: key) { Label(store.t("Save Shortcut key"), systemImage: "square.and.arrow.up") }
                        .buttonStyle(WorkspaceActionButton(palette: p))
                    Button(store.t("Done")) { self.key = nil }
                        .buttonStyle(WorkspaceOutlineButton(palette: p))
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func expiryLabel(_ timestamp: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = parser.date(from: timestamp) ?? ISO8601DateFormatter().date(from: timestamp)
        var format = Date.FormatStyle.dateTime.day().month(.abbreviated).year().hour().minute().locale(store.language)
        format.timeZone = LedgerDate.zone
        return date?.formatted(format) ?? timestamp
    }

    private func load() async {
        error = nil
        do {
            connection = try await store.read("/api/bank-shortcut")
            loaded = true
        } catch { if !Task.isCancelled { self.error = store.t(error.localizedDescription) } }
    }

    private func connect() async {
        guard !working else { return }
        working = true
        error = nil
        defer { working = false }
        do {
            var random = SystemRandomNumberGenerator()
            let secret = (0..<32).map { _ in String(format: "%02x", UInt8.random(in: .min ... .max, using: &random)) }.joined()
            var body: [String: LedgerValue] = ["accountNumber": .string(accountNumber), "secret": .string(secret)]
            if store.hasNativeGoogle {
                guard let credentials = try await NativeGoogleSignIn.credentials() else { return }
                guard let refresh = credentials.refreshToken else { throw MobileSignIn.Failure.invalidResponse }
                body["refreshToken"] = .string(refresh)
            }
            let result = try await store.write("/api/bank-shortcut", body: body)
            connection = Connection(accountLast4: String(accountNumber.suffix(4)), renewable: body["refreshToken"] != nil, expiresAt: nil)
            manage = false
            key = "Bearer " + result.id + "." + secret
            await load()
        } catch { self.error = store.t(error.localizedDescription) }
    }

    private func disconnectShortcut() async {
        guard !working else { return }
        working = true
        error = nil
        defer { working = false }
        do {
            _ = try await store.write("/api/bank-shortcut/disconnect")
            key = nil
            connection = nil
            manage = false
        } catch { self.error = store.t(error.localizedDescription) }
    }
}

struct NativeAppearance: View {
    private struct Choice: Identifiable {
        let id: String
        let name: String
        let description: String
        let swatches: [UInt32]
    }

    private static let choices = [
        Choice(id: "playful-retro", name: "Playful Retro Neo-Brutalism",
               description: "Warm cream, vivid pastels, bold outlines and retro shadows",
               swatches: [0xfff6e6, 0xffd02c, 0xff86b0, 0x79c8ff, 0x83e5b0]),
        Choice(id: "mono-os", name: "Mono OS",
               description: "Grayscale desktop, monospace type, and thin outlines",
               swatches: [0xd9d9d9, 0xffffff, 0x111111]),
        Choice(id: "chapter-desk", name: "Chapter Desk",
               description: "A warm cream reading desk with burnt-orange accents",
               swatches: [0xf4e9d5, 0xfff5e2, 0xa34018]),
        Choice(id: "afterhours-fm", name: "Afterhours FM",
               description: "Charcoal surfaces, warm white text, and bright yellow accents",
               swatches: [0x101010, 0x1d1d1d, 0xf7d449, 0x71d6c8]),
        Choice(id: "margin-notes", name: "Margin Notes",
               description: "Warm paper, serif headings, and plum ink",
               swatches: [0xf0e9df, 0xfffcf5, 0x713346, 0xded8eb]),
        Choice(id: "sticker-sprint", name: "Sticker Sprint",
               description: "Dotted paper, sunflower yellow, and bold cut-paper shadows",
               swatches: [0xfff8ec, 0xffd34e, 0xbdebd9, 0xded2f9])
    ]

    @EnvironmentObject private var store: WorkspaceStore
    @State private var error: String?
    @State private var saving = false
    @State private var saved = false

    var body: some View {
        let p = store.palette
        let selected = store.previewTheme ?? store.theme
        let changed = selected != store.theme
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text(store.t("Your appearance")).font(p.font(21, .heavy)).accessibilityAddTraits(.isHeader)
                    .padding(.bottom, 2)
                ForEach(Self.choices) { choice in
                    row(choice, selected: selected == choice.id)
                }
                Text(store.t("Select a theme to preview it instantly. Your choice is only saved when you select Save appearance."))
                    .font(p.font(13)).foregroundStyle(p.secondaryInk).fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 4)
                if let error { WorkspaceNotice(message: error, tone: .error) }
                WorkspaceActionRows {
                    Button(store.t(saving ? "Saving…" : "Save appearance")) {
                        Task {
                            saving = true
                            error = nil
                            defer { saving = false }
                            do {
                                try await store.chooseTheme(selected)
                                store.previewTheme = nil
                                saved = true
                            } catch { self.error = store.t(error.localizedDescription) }
                        }
                    }
                    .buttonStyle(WorkspaceActionButton(palette: p))
                    .disabled(!changed || saving)
                    if changed {
                        Button(store.t("Cancel preview")) {
                            store.previewTheme = nil
                            error = nil
                            saved = false
                        }
                        .buttonStyle(.plain)
                        .disabled(saving)
                    }
                }
                if changed || saved {
                    Text(store.t(changed ? "Previewing — not saved yet." : "Appearance saved. It applies to your account across devices."))
                        .font(p.font(13)).foregroundStyle(p.secondaryInk)
                        .accessibilityIdentifier("theme-preview-status")
                }
            }
            .padding(16).padding(.trailing, max(0, p.shadowOffset - 1))
        }
        .accessibilityIdentifier("workspace-appearance")
        .foregroundStyle(p.foreground)
        .clipShape(RoundedRectangle(cornerRadius: p.radius))
        .modifier(WorkspacePanel(palette: p, fill: p.surface))
    }

    private func row(_ choice: Choice, selected: Bool) -> some View {
        let p = store.palette
        let ink = selected ? p.onAccent : p.foreground
        return Button {
            store.previewTheme = choice.id == store.theme ? nil : choice.id
            error = nil
            saved = false
        } label: {
            HStack(alignment: .top, spacing: 11) {
                ZStack {
                    Circle().strokeBorder(ink.opacity(selected ? 1 : 0.58), lineWidth: 1.5)
                    if selected {
                        Circle().fill(ink)
                        Circle().fill(p.accent).frame(width: 4, height: 4)
                    }
                }
                .frame(width: 15, height: 15).padding(.top, 3)
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(choice.name).font(p.font(15, .bold))
                    HStack(spacing: 4) {
                        ForEach(choice.swatches, id: \.self) { color in
                            Circle()
                                .fill(WorkspacePalette.color(color))
                                .overlay(Circle().strokeBorder(ink.opacity(0.15), lineWidth: 1))
                                .frame(width: 15, height: 15)
                        }
                    }
                    .accessibilityHidden(true)
                    Text(store.t(choice.description)).font(p.font(13))
                        .foregroundStyle(ink.opacity(p.dark ? 0.89 : 0.82))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 13).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(ink)
            .modifier(WorkspacePanel(palette: p, fill: selected ? p.accent : p.surface))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(saving)
        .accessibilityLabel(choice.name)
        .accessibilityHint(store.t(choice.description))
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier("theme-option-\(choice.id)")
    }
}

struct NativeOnboarding: View {
    let openDashboard: () -> Void
    @EnvironmentObject private var store: WorkspaceStore
    @State private var progress: LedgerRecord?
    @State private var name = ""
    @State private var error: String?
    @State private var addingStudent = false
    @State private var recordingLesson = false

    private var step: Int {
        guard let progress, progress.flag("profileConfirmed") else { return 0 }
        if progress.object("student") == nil && !progress.flag("completed") { return 1 }
        return progress.object("session") == nil ? 2 : 3
    }

    var body: some View {
        let p = store.palette
        WorkspaceScroll(eager: true) {
            VStack(alignment: .leading, spacing: 7) {
                Text(store.t("Lesson & tuition ledger").uppercased()).font(p.font(12)).foregroundStyle(p.secondaryInk)
                Text(store.t("Open your lesson ledger")).font(p.font(25, .heavy)).accessibilityAddTraits(.isHeader)
                Text(store.t("For individual and class teaching, charged per lesson and paid afterwards. You can pause and continue at any time."))
                    .font(p.font(15)).foregroundStyle(p.secondaryInk).lineSpacing(4)
            }
            if progress != nil {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 6) { steps }
                    VStack(spacing: 6) { steps }
                }
                WorkspaceSection(padding: 14) { currentStep }
            } else if error == nil {
                ProgressView().tint(p.controlTint)
            }
            if let error { LedgerError(message: error) { Task { await load() } } }
            Text(store.t("LessonBrook only counts lessons you enter; it excludes earlier debts. An internet connection is needed to save data."))
                .font(p.font(13)).foregroundStyle(p.secondaryInk)
            Button(store.t("Continue to app"), action: openDashboard).buttonStyle(.plain)
        }
        .task(id: store.revision) { await load() }
        .sheet(isPresented: $addingStudent) { StudentEditor() }
        .sheet(isPresented: $recordingLesson) { LessonEditor(studentID: progress?.object("student")?.id) }
    }

    private var steps: some View {
        let p = store.palette
        return ForEach(Array(["Teacher profile", "Add student", "First lesson"].enumerated()), id: \.offset) { index, title in
            let active = step >= index
            let shape = RoundedRectangle(cornerRadius: p.fieldRadius)
            VStack(alignment: .leading, spacing: 5) {
                if step > index {
                    Label(store.t("Done"), systemImage: "checkmark").font(p.font(13, .bold))
                } else {
                    Text(String(format: store.t("Step %d"), index + 1)).font(p.font(13, .bold))
                }
                Text(store.t(title)).font(p.font(13)).lineLimit(1)
            }
            .padding(10).frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(active ? p.onAccent : p.foreground)
            .background(active ? p.accent : p.surface, in: shape)
            .overlay(shape.strokeBorder(p.border, lineWidth: 1))
            .accessibilityAddTraits(step == index ? .isSelected : [])
        }
    }

    @ViewBuilder private var currentStep: some View {
        let p = store.palette
        switch step {
        case 0:
            Text(store.t("What name should we show?")).font(p.font(21, .heavy))
            WorkspaceField(store.t("Teacher / class name"), text: $name)
            Text(store.t("This name appears on statements you issue. You can set up VietQR in Account settings."))
                .font(p.font(13)).foregroundStyle(p.secondaryInk)
            Button(store.t("Save and continue")) {
                Task {
                    do {
                        _ = try await store.write("/api/onboarding", body: ["displayName": .string(name)])
                        await store.refreshDashboard()
                    } catch { self.error = store.t(error.localizedDescription) }
                }
            }
            .buttonStyle(WorkspaceActionButton(palette: p))
            .disabled(store.saving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        case 1:
            Text(store.t("Add your first student")).font(p.font(21, .heavy))
            Text(store.t("You only need the student's name. You can add contact details later."))
                .font(p.font(15)).foregroundStyle(p.secondaryInk)
            Button(store.t("Add your first student")) { addingStudent = true }
                .buttonStyle(WorkspaceActionButton(palette: p))
        case 2:
            Text(store.t("Record your first completed lesson")).font(p.font(21, .heavy))
            if let student = progress?.object("student") { Text(student.name).font(p.font(15, .bold)) }
            Text(store.t("Choose the lesson date and price, then mark the lesson as completed."))
                .font(p.font(15)).foregroundStyle(p.secondaryInk)
            Button(store.t("Record first lesson")) { recordingLesson = true }
                .buttonStyle(WorkspaceActionButton(palette: p)).disabled(progress?.object("student") == nil)
        default:
            Text(store.t("Your ledger is ready")).font(p.font(25, .heavy))
            if let session = progress?.object("session") {
                let date = LedgerDate.localized(session.text("sessionDate"), locale: store.language)
                Text(String(format: store.t("Lesson recorded %@ on %@: %@."),
                            session.text("studentName"), date, store.money(session.int("amountVnd"))))
                    .font(p.font(15)).lineSpacing(4)
            }
            Text(store.t("Completed, chargeable lessons appear under “Lessons ready for a statement” until you issue a statement. You can then share its link and record received payments."))
                .font(p.font(15)).foregroundStyle(p.secondaryInk).lineSpacing(4)
            WorkspaceActionRows {
                Button(action: openDashboard) { Label(store.t("View dashboard"), systemImage: "arrow.right") }
                    .buttonStyle(WorkspaceActionButton(palette: p))
                if let studentID = progress?.object("session")?.string("studentId") {
                    NavigationLink(value: WorkspaceRoute.student(studentID)) { Text(store.t("Open student ledger")) }
                }
            }
        }
    }

    private func load() async {
        do {
            let result: LedgerRecord = try await store.read("/api/onboarding")
            try Task.checkCancellation()
            progress = result
            name = result.object("profile")?.name ?? ""
            error = nil
        } catch { if !Task.isCancelled { self.error = store.t(error.localizedDescription) } }
    }
}

struct AccountDeletionView: View {
    @EnvironmentObject private var store: WorkspaceStore
    @State private var status: LedgerRecord?
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        VStack(spacing: 16) {
            Text(store.t("Account deletion")).font(.title2.bold())
            if let status { Text(store.t(status.text("phase") == "done" ? "Account deleted" : "Deleting account…")) }
            if busy { ProgressView() }
            if let error { Text(error).foregroundStyle(.red) }
            Button(store.t(status?.text("phase") == "done" ? "Continue" : "Continue deletion")) {
                Task { await advance() }
            }.buttonStyle(WorkspaceActionButton(palette: store.palette)).disabled(busy)
        }
        .padding(24).frame(maxWidth: .infinity, maxHeight: .infinity)
        .task { await advance() }
    }

    private func advance() async {
        busy = true
        defer { busy = false }
        do {
            for _ in 0..<40 {
                status = try await store.advanceDeletion()
                if status?.text("phase") == "done" { await store.signOut(); return }
                try await Task.sleep(nanoseconds: 1_000_000_000)
            }
        } catch { self.error = store.t(error.localizedDescription) }
    }
}
