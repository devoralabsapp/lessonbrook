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
        WorkspaceScroll {
            WorkspaceSection(store.t("Teacher profile")) {
                WorkspaceField(store.t("Display name"), text: $displayName)
                if let email = profile?.string("email") { Text(email).foregroundStyle(.secondary) }
                Button(store.t("Save profile")) {
                    Task {
                        await perform {
                            _ = try await store.write("/api/profile", method: "PATCH", body: ["displayName": .string(displayName)])
                            await store.refreshDashboard()
                        }
                    }
                }.disabled(store.saving || displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            WorkspaceSection(store.t("Bank transfer details")) {
                WorkspaceChoice(label: store.t("Bank"), selection: $bankBin,
                    options: [("", store.t("Choose a bank"))] + Self.banks +
                        (!bankBin.isEmpty && !Self.banks.contains(where: { $0.0 == bankBin }) ? [(bankBin, bankBin)] : []))
                WorkspaceField(store.t("Account number"), text: $account).keyboardType(.numberPad)
                WorkspaceField(store.t("Account holder"), text: $accountName)
                Button(store.t("Save bank details")) {
                    Task {
                        await perform {
                            _ = try await store.write("/api/profile/bank-transfer", method: "PATCH", body: [
                                "bankTransfer": .object(["bankBin": .string(bankBin), "accountNumber": .string(account),
                                                         "accountName": .string(accountName)])
                            ])
                        }
                    }
                }.disabled(store.saving || bankBin.count != 6 || account.count < 6 || accountName.isEmpty)
                Button(store.t("Remove bank details"), role: .destructive) {
                    Task {
                        await perform {
                            _ = try await store.write("/api/profile/bank-transfer", method: "PATCH", body: ["bankTransfer": .null])
                            bankBin = ""; account = ""; accountName = ""
                        }
                    }
                }.disabled(store.saving || profile?.object("bankTransfer") == nil)
            }
            if !store.demo {
                WorkspaceSection(store.t("Payment notifications")) { BankShortcutForm(accountNumber: account) }
            }
            WorkspaceSection(store.t("Preferences")) {
                WorkspaceChoice(label: store.t("Language"), selection: Binding(get: { store.locale }, set: store.setLanguage),
                                options: [("en", "English"), ("vi", "Tiếng Việt")])
            }
            WorkspaceSection(store.t("Your data")) {
                Button(store.t(exporting ? "Preparing export…" : "Export all data")) { Task { await exportData() } }
                    .disabled(exporting || store.saving)
                Link(store.t("Help & support"), destination: MobileSignIn.origin.appending(path: "help"))
                Link(store.t("Data & privacy"), destination: MobileSignIn.origin.appending(path: "privacy"))
            }
            WorkspaceSection {
                if store.demo {
                    Button(store.t("Sign in")) { Task { await store.beginSignIn(open: openURL) } }
                    Button(store.t("Exit demo")) { Task { await store.signOut() } }
                } else {
                    Button(store.t("Sign out")) { Task { await store.signOut() } }
                    Button(store.t("Sign out on all devices")) { disconnectAll = true }
                    Button(store.t("Delete account"), role: .destructive) { confirmation = ""; deleting = true }
                }
            }
            if let error { Text(error).foregroundStyle(.red) }
            if let notice { Text(notice).foregroundStyle(.secondary) }
        }
        .scrollContentBackground(.hidden)
        .background(store.palette.background)
        .navigationTitle(store.t("Account settings"))
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
    @EnvironmentObject private var store: WorkspaceStore
    let accountNumber: String
    @State private var connection: LedgerRecord?
    @State private var key: String?
    @State private var error: String?
    @State private var disconnect = false

    var body: some View {
        if let connection {
            WorkspaceKeyValue(store.t("Receiving account"), value: "••••" + connection.text("accountLast4"))
            Text(connection.flag("renewable") ? store.t("Automatically renews") : store.t("Expires") + " " + connection.text("expiresAt"))
                .font(.caption).foregroundStyle(.secondary)
        }
        if let key {
            Text(store.t("Save this Shortcut authorization key now. It is shown once.")).font(.caption)
            Text(key).font(.caption.monospaced()).textSelection(.enabled).privacySensitive()
            ShareLink(item: key) { Text(store.t("Save Shortcut key")) }
            Button(store.t("Hide key")) { self.key = nil }
        }
        Button(store.t(connection == nil ? "Connect Shortcut" : "Replace Shortcut key")) { Task { await connect() } }
            .disabled(accountNumber.count < 6 || store.saving)
        if connection != nil {
            Button(store.t("Disconnect Shortcut"), role: .destructive) { disconnect = true }
        }
        if let error { Text(error).font(.footnote).foregroundStyle(.red) }
        Link(store.t("Shortcut setup"), destination: MobileSignIn.origin.appending(path: "help"))
        EmptyView().task { await load() }
            .confirmationDialog(store.t("Disconnect Shortcut"), isPresented: $disconnect) {
                Button(store.t("Disconnect"), role: .destructive) {
                    Task {
                        do {
                            _ = try await store.write("/api/bank-shortcut/disconnect")
                            key = nil
                            await load()
                        } catch { self.error = store.t(error.localizedDescription) }
                    }
                }
            }
    }

    private func load() async {
        do { connection = try await store.read("/api/bank-shortcut") as LedgerRecord? }
        catch { self.error = store.t(error.localizedDescription) }
    }

    private func connect() async {
        error = nil
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
            key = "Bearer " + result.id + "." + secret
            await load()
        } catch { self.error = store.t(error.localizedDescription) }
    }
}

struct NativeAppearance: View {
    private let themes = [
        ("playful-retro", "Playful Retro Neo-Brutalism"), ("mono-os", "Mono OS"), ("chapter-desk", "Chapter Desk"),
        ("afterhours-fm", "Afterhours FM"), ("margin-notes", "Margin Notes"), ("sticker-sprint", "Sticker Sprint")
    ]
    @EnvironmentObject private var store: WorkspaceStore
    @Environment(\.dismiss) private var dismiss
    @State private var preview: String?
    @State private var error: String?

    var body: some View {
        let palette = WorkspacePalette(preview ?? store.theme)
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text(store.t("Appearance")).font(palette.font(24, .heavy))
                    Spacer()
                    Button(store.t("Close")) { dismiss() }.buttonStyle(WorkspaceOutlineButton(palette: palette, compact: true))
                }
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(themes, id: \.0) { theme in
                    let colors = WorkspacePalette(theme.0)
                    Button { preview = theme.0; store.previewTheme = theme.0 } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(theme.1).font(palette.font(14, .bold)).fixedSize(horizontal: false, vertical: true)
                                Spacer()
                                if (preview ?? store.theme) == theme.0 { Image(systemName: "checkmark") }
                            }
                            HStack(spacing: 6) {
                                ForEach(Array([colors.yellow, colors.blue, colors.mint].enumerated()), id: \.offset) { _, color in
                                    RoundedRectangle(cornerRadius: 4).fill(color).frame(height: 22)
                                }
                            }
                        }
                        .padding(12)
                        .foregroundStyle(palette.foreground)
                        .modifier(WorkspacePanel(palette: palette, fill: palette.surface))
                    }.buttonStyle(.plain)
                }
                }
                if let error { Text(error).foregroundStyle(.red) }
                Button(store.t("Save appearance")) {
                    Task {
                        do { try await store.chooseTheme(preview ?? store.theme); dismiss() }
                        catch { self.error = store.t(error.localizedDescription) }
                    }
                }.buttonStyle(WorkspaceActionButton(palette: store.palette)).disabled(store.saving)
            }.padding(16)
        }
        .background(palette.background)
        .preferredColorScheme(palette.dark ? .dark : .light)
        .navigationTitle(store.t("Appearance"))
        .onDisappear { store.previewTheme = nil }
    }
}

struct NativeOnboarding: View {
    @EnvironmentObject private var store: WorkspaceStore
    @State private var name = ""
    @State private var error: String?
    var body: some View {
        WorkspaceScroll {
            WorkspaceSection(store.t("Teacher profile")) {
                WorkspaceField(store.t("Display name"), text: $name)
                Button(store.t("Save profile")) {
                    Task {
                        do {
                            _ = try await store.write("/api/onboarding", body: ["displayName": .string(name)])
                            await store.refreshDashboard()
                        } catch { self.error = store.t(error.localizedDescription) }
                    }
                }.disabled(store.saving || name.isEmpty)
            }
            WorkspaceSection {
                NavigationLink(value: WorkspaceRoute.studentHistory(.students, "")) { Text(store.t("Students")) }
                NavigationLink(value: WorkspaceRoute.recordLesson()) { Text(store.t("Record lesson")) }
            }
            if let error { Text(error).foregroundStyle(.red) }
        }
        .scrollContentBackground(.hidden)
        .background(store.palette.background)
        .navigationTitle(store.t("Get started"))
        .task { name = store.snapshot?.displayName ?? "" }
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
