import Foundation
import Security
import SwiftUI

enum LedgerValue: Codable, Equatable {
    case string(String), number(Int), flag(Bool), object([String: LedgerValue]), array([LedgerValue]), null

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if value.decodeNil() { self = .null }
        else if let flag = try? value.decode(Bool.self) { self = .flag(flag) }
        else if let number = try? value.decode(Int.self) { self = .number(number) }
        else if let text = try? value.decode(String.self) { self = .string(text) }
        else if let list = try? value.decode([Self].self) { self = .array(list) }
        else { self = .object(try value.decode([String: Self].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        switch self {
        case let .string(text): try value.encode(text)
        case let .number(number): try value.encode(number)
        case let .flag(flag): try value.encode(flag)
        case let .object(object): try value.encode(object)
        case let .array(array): try value.encode(array)
        case .null: try value.encodeNil()
        }
    }

    static func text(_ text: String?) -> Self { text.map(Self.string) ?? .null }
    static func strings<C: Collection>(_ values: C) -> Self where C.Element == String {
        .array(values.map(Self.string))
    }
}

struct LedgerRecord: Codable, Equatable, Identifiable {
    let fields: [String: LedgerValue]

    init(fields: [String: LedgerValue]) { self.fields = fields }
    init(from decoder: Decoder) throws {
        fields = try decoder.singleValueContainer().decode([String: LedgerValue].self)
    }
    func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        try value.encode(fields)
    }

    var id: String { text("id") }
    var name: String { text("displayName") }
    subscript(key: String) -> LedgerValue { fields[key] ?? .null }
    func string(_ key: String) -> String? {
        if case let .string(value) = self[key] { return value }
        return nil
    }
    func text(_ key: String) -> String { string(key) ?? "" }
    func int(_ key: String) -> Int {
        if case let .number(value) = self[key] { return value }
        return 0
    }
    func flag(_ key: String) -> Bool { self[key] == .flag(true) }
    func object(_ key: String) -> Self? {
        if case let .object(value) = self[key] { return Self(fields: value) }
        return nil
    }
    func objects(_ key: String) -> [Self] {
        if case let .array(values) = self[key] {
            return values.compactMap {
                if case let .object(value) = $0 { return Self(fields: value) }
                return nil
            }
        }
        return []
    }
    func strings(_ key: String) -> [String] {
        if case let .array(values) = self[key] {
            return values.compactMap {
                if case let .string(value) = $0 { return value }
                return nil
            }
        }
        return []
    }
}

struct LedgerPage: Decodable { let items: [LedgerRecord]; let nextCursor: String? }

enum LedgerDate {
    static let zone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        calendar.firstWeekday = 2
        return calendar
    }
    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = zone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
    static var today: String { text(Date()) }
    static func text(_ date: Date) -> String { formatter.string(from: date) }
    static func date(_ text: String) -> Date? { formatter.date(from: text) }
    static func range(_ component: Calendar.Component, at date: Date = .now) -> (String, String) {
        guard let interval = calendar.dateInterval(of: component, for: date)
        else { return (today, today) }
        let last = calendar.date(byAdding: .day, value: -1, to: interval.end) ?? interval.start
        return (text(interval.start), text(last))
    }
}

func ledgerPath(_ path: String, _ parameters: [String: String]) -> String {
    var url = URLComponents(string: path)!
    url.queryItems = parameters.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
    return url.string ?? path
}

private struct StoredSession: Codable {
    let name: String
    let value: String
    let expiry: Date

    init?(_ cookie: HTTPCookie) {
        guard let expiry = cookie.expiresDate, expiry > .now else { return nil }
        name = cookie.name
        value = cookie.value
        self.expiry = expiry
    }

    var cookie: HTTPCookie? {
        guard expiry > .now, [MobileSignIn.sessionName, "chotcong_deletion"].contains(name) else { return nil }
        return HTTPCookie(properties: [
            .name: name, .value: value, .domain: MobileSignIn.origin.host!, .path: "/",
            .secure: "TRUE", .expires: expiry
        ])
    }

    private static var key: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: Bundle.main.bundleIdentifier ?? MobileSignIn.scheme,
         kSecAttrAccount as String: "workspace-session"]
    }

    static func read() -> HTTPCookie? {
        var query = key
        query[kSecReturnData as String] = true
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return (try? JSONDecoder().decode(Self.self, from: data))?.cookie
    }

    static func replace(_ cookie: HTTPCookie?) {
        SecItemDelete(key as CFDictionary)
        guard let cookie, let value = Self(cookie), let data = try? JSONEncoder().encode(value) else { return }
        var query = key
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(query as CFDictionary, nil)
    }
}

@MainActor
final class WorkspaceStore: ObservableObject {
    enum Phase: Equatable { case starting, welcome, workspace, deletion }
    struct Availability: Decodable { let available: Bool }
    private struct DemoCommand: Encodable {
        let path: String
        let method: String
        let body: [String: LedgerValue]?
        let id: String
        let at: String
    }
    private struct DemoRequest: Encodable {
        let date: String
        let locale: String
        let command: DemoCommand
        let changes: [DemoCommand]
    }
    private struct CachedPage { let records: LedgerPage; let expiresAt: TimeInterval }
    private struct Mutation: Hashable { let path: String; let method: String; let body: Data }
    private let api: MobileSignIn
    private var session: HTTPCookie?
    private var verifier: String?
    private var workspaceGeneration = UUID()
    private var scheduled = false
    private var refreshing = false
    private var demoHistory: [DemoCommand] = []
    private var demoDate = LedgerDate.today
    private var pages: [String: CachedPage] = [:]
    private var reads: [String: Task<LedgerPage, Error>] = [:]
    private var requestIDs: [Mutation: UUID] = [:]
    private let time = ISO8601DateFormatter()

    @Published private(set) var phase: Phase = .starting
    @Published private(set) var demo = false
    @Published private(set) var available: Bool?
    @Published private(set) var availabilityFailed = false
    @Published private(set) var expired = false
    @Published private(set) var signingIn = false
    @Published private(set) var saving = false
    @Published private(set) var snapshot: WorkspaceSnapshot?
    @Published private(set) var revision = 0
    @Published private(set) var locale = UserDefaults.standard.string(forKey: "workspace.locale") == "vi" ? "vi" : "en"
    @Published var hasUnsavedEdits = false
    @Published var error: String?
    @Published var theme = "playful-retro"
    @Published var previewTheme: String?

    init(api: MobileSignIn = MobileSignIn()) {
        self.api = api
        time.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    }

    var palette: WorkspacePalette { WorkspacePalette(previewTheme ?? theme) }
    var language: Locale { Locale(identifier: locale == "vi" ? "vi_VN" : "en_GB") }
    var hasNativeGoogle: Bool { NativeGoogleSignIn.isConfigured }
    func t(_ key: String) -> String { workspaceText(key, locale: locale) }
    func money(_ amount: Int) -> String {
        amount.formatted(.currency(code: "VND").precision(.fractionLength(0)).locale(language))
    }
    func setLanguage(_ next: String) {
        guard next != locale else { return }
        locale = next
        UserDefaults.standard.set(next, forKey: "workspace.locale")
        clearPages()
        Task { await refreshDashboard() }
    }

    private var cookies: [HTTPCookie] {
        let localeCookie = HTTPCookie(properties: [
            .name: "chotcong_locale", .value: locale, .domain: MobileSignIn.origin.host!,
            .path: "/", .secure: "TRUE"
        ])
        return [session, localeCookie].compactMap { $0 }
    }

    func load() async {
        guard phase == .starting else { return }
        session = StoredSession.read()
        if let session {
            phase = session.name == MobileSignIn.sessionName ? .workspace : .deletion
            if phase == .workspace { await refreshDashboard() }
        } else {
            await welcome()
        }
    }

    func welcome() async {
        phase = .welcome
        available = nil
        availabilityFailed = false
        do {
            let result: Availability = try await api.get("/api/auth/availability")
            available = result.available
        } catch {
            if !Task.isCancelled { availabilityFailed = true }
        }
    }

    func beginSignIn(open: OpenURLAction) async {
        guard !signingIn, available == true || demo else { return }
        if hasNativeGoogle {
            await signIn {
                guard let token = try await NativeGoogleSignIn.firebaseIDToken() else { return nil }
                return try await self.api.exchange(idToken: token, theme: nil)
            }
        } else {
            let attempt = MobileSignIn.begin()
            verifier = attempt.verifier
            open(attempt.url) { accepted in
                if !accepted { self.error = self.t("Couldn’t sign in") }
            }
        }
    }

    func openURL(_ url: URL) async {
        if NativeGoogleSignIn.handle(url) { return }
        guard let code = MobileSignIn.callbackCode(url), let verifier else { return }
        self.verifier = nil
        await signIn { try await self.api.exchange(code: code, verifier: verifier, theme: nil) }
    }

    private func signIn(_ authenticate: () async throws -> MobileSignIn.Session?) async {
        guard !signingIn else { return }
        signingIn = true
        defer { signingIn = false }
        do {
            if let result = try await authenticate() {
                reset()
                session = result.cookie
                StoredSession.replace(session)
                phase = result.needsAccountDeletion ? .deletion : .workspace
                if phase == .workspace { await refreshDashboard() }
            }
        } catch {
            self.error = t("Couldn’t sign in")
        }
    }

    func startDemo() async {
        reset()
        demo = true
        demoDate = LedgerDate.today
        phase = .workspace
        await refreshDashboard()
    }

    func signOut(allDevices: Bool = false) async {
        do {
            if !demo, session?.name == MobileSignIn.sessionName {
                let _: LedgerRecord = try await api.mutate("/api/auth/logout", method: "POST",
                    body: ["allDevices": LedgerValue.flag(allDevices)], requestID: UUID(), cookies: cookies)
            }
            session = nil
            StoredSession.replace(nil)
            reset()
            expired = false
            await welcome()
        } catch { self.error = t(error.localizedDescription) }
    }

    private func reset() {
        workspaceGeneration = UUID()
        scheduled = false
        refreshing = false
        demo = false
        expired = false
        snapshot = nil
        theme = "playful-retro"
        previewTheme = nil
        demoHistory.removeAll()
        requestIDs.removeAll()
        clearPages()
    }

    func refreshDashboard() async {
        guard phase == .workspace, !refreshing else { return }
        refreshing = true
        let generation = workspaceGeneration
        defer { if generation == workspaceGeneration { refreshing = false } }
        do {
            let value: WorkspaceSnapshot
            if demo {
                async let summary: WorkspaceSnapshot.Summary = read("/api/summary")
                async let schedule: WorkspaceSnapshot.Schedule = read("/api/mobile/schedule")
                async let profile: LedgerRecord = read("/api/profile")
                value = try await WorkspaceSnapshot(summary: summary, theme: theme,
                    displayName: profile.name, needsOnboarding: false, locale: locale, schedule: schedule)
            } else {
                value = try await api.workspace(cookies: cookies, initialize: !scheduled)
            }
            guard generation == workspaceGeneration, phase == .workspace else { return }
            scheduled = true
            if value != snapshot { snapshot = value; clearPages() }
            if value.theme != theme { theme = value.theme }
        } catch {
            if generation == workspaceGeneration, phase == .workspace, !Task.isCancelled {
                handle(error)
                if phase == .workspace && snapshot == nil { self.error = t(error.localizedDescription) }
            }
        }
    }

    func read<T: Decodable>(_ path: String) async throws -> T {
        do {
            if demo { return try await demoRequest(path, "GET", nil, UUID()) }
            return try await api.get(path, cookies: cookies)
        } catch {
            if phase == .workspace { handle(error) }
            throw error
        }
    }

    func page(_ path: String, refresh: Bool = false) async throws -> LedgerPage {
        if !refresh, let cached = pages[path], cached.expiresAt > ProcessInfo.processInfo.systemUptime {
            return cached.records
        }
        if let request = reads[path] { return try await request.value }
        let generation = workspaceGeneration
        let version = revision
        let request = Task<LedgerPage, Error> { try await read(path) }
        reads[path] = request
        defer {
            if generation == workspaceGeneration && version == revision { reads[path] = nil }
        }
        let result = try await request.value
        try Task.checkCancellation()
        if generation == workspaceGeneration && version == revision {
            if pages.count >= 32 { pages.removeAll() }
            pages[path] = .init(records: result, expiresAt: ProcessInfo.processInfo.systemUptime + 20)
        }
        return result
    }

    func all(_ path: String, query: [String: String] = [:], refresh: Bool = false) async throws -> [LedgerRecord] {
        var records: [LedgerRecord] = []
        var parameters = query
        var cursors = Set<String>()
        parameters["limit"] = "50"
        repeat {
            try Task.checkCancellation()
            let result = try await page(ledgerPath(path, parameters), refresh: refresh)
            records.append(contentsOf: result.items)
            parameters["cursor"] = result.nextCursor
            if let cursor = result.nextCursor, !cursors.insert(cursor).inserted {
                throw MobileSignIn.Failure.invalidResponse
            }
        } while parameters["cursor"] != nil
        return records
    }

    func learners(includeArchived: Bool = false) async throws -> [LedgerRecord] {
        let active = try await all("/api/students", query: ["order": "name", "archived": "false"])
        guard includeArchived else { return active }
        let archived = try await all("/api/students", query: ["order": "name", "archived": "true"])
        return (active + archived).sorted {
            $0.name.compare($1.name, options: [.caseInsensitive, .diacriticInsensitive], locale: language) == .orderedAscending
        }
    }

    func write(_ path: String, method: String = "POST", body: [String: LedgerValue] = [:]) async throws -> LedgerRecord {
        guard !saving else { throw CancellationError() }
        saving = true
        defer { saving = false }
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let mutation = Mutation(path: path, method: method, body: try encoder.encode(body))
        if requestIDs.count >= 32 { requestIDs.removeAll() }
        let id = requestIDs[mutation] ?? UUID()
        requestIDs[mutation] = id
        let generation = workspaceGeneration
        do {
            let result: LedgerRecord
            if demo { result = try await demoRequest(path, method, body, id) }
            else { result = try await api.mutate(path, method: method, body: body, requestID: id, cookies: cookies) }
            guard generation == workspaceGeneration else { throw CancellationError() }
            requestIDs[mutation] = nil
            clearPages()
            return result
        } catch {
            if generation == workspaceGeneration { handle(error) }
            throw error
        }
    }

    private func demoRequest<T: Decodable>(_ path: String, _ method: String,
                                           _ body: [String: LedgerValue]?, _ id: UUID) async throws -> T {
        let generation = workspaceGeneration
        let command = DemoCommand(path: path, method: method, body: body,
                                  id: id.uuidString.lowercased(), at: time.string(from: .now))
        let result: T = try await api.demo(DemoRequest(date: demoDate, locale: locale, command: command, changes: demoHistory))
        guard generation == workspaceGeneration else { throw CancellationError() }
        if method != "GET", path != "/api/share/resolve", !demoHistory.contains(where: { $0.id == command.id }) {
            demoHistory.append(command)
        }
        return result
    }

    private func clearPages() {
        pages.removeAll()
        for request in reads.values { request.cancel() }
        reads.removeAll()
        revision += 1
    }

    private func handle(_ error: Error) {
        guard !demo, let failure = error as? MobileSignIn.Failure else { return }
        switch failure {
        case .expired:
            StoredSession.replace(nil)
            session = nil
            reset()
            expired = true
            phase = .welcome
            Task { await welcome() }
        case .deleting:
            phase = .deletion
        default: break
        }
    }

    func chooseTheme(_ next: String) async throws {
        _ = try await write("/api/appearance", method: "PATCH", body: ["theme": .string(next)])
        theme = next
        await refreshDashboard()
    }

    func startDeletion(_ confirmation: String) async throws {
        guard !demo, let token = try await NativeGoogleSignIn.firebaseIDToken() else { return }
        let result = try await api.startDeletion(body: [
            "confirmation": LedgerValue.string(confirmation), "acknowledged": .flag(true), "idToken": .string(token)
        ], requestID: UUID(), cookies: cookies)
        session = result.cookie
        StoredSession.replace(session)
        reset()
        phase = .deletion
    }

    func advanceDeletion() async throws -> LedgerRecord {
        try await api.mutate("/api/account/deletion", method: "POST", body: [String: LedgerValue](),
                             requestID: UUID(), cookies: cookies)
    }
}
