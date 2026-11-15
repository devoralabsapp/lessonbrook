import CryptoKit
import Foundation

final class MobileSignIn: NSObject, URLSessionTaskDelegate {
    static let origin = URL(string: "https://chotcong.devoralabs.tech")!
    static let scheme = "tech.devoralabs.lessonbrook"
    static let sessionName = "chotcong_session"
    static let guestThemeName = "chotcong_guest_theme"

    struct Session {
        let cookie: HTTPCookie
        var needsAccountDeletion: Bool { cookie.name == "chotcong_deletion" }
    }

    enum Failure: LocalizedError {
        case invalidResponse, expired, deleting, rejected(Int, String)

        var errorDescription: String? {
            switch self {
            case .invalidResponse: return "LessonBrook couldn’t load. Check your connection and try again."
            case .expired: return "Your session expired. Sign in again."
            case .deleting: return "Account deletion"
            case .rejected(_, let message): return message
            }
        }
    }
    private struct Rejection: Decodable { let error: String }
    private struct CSRF: Decodable { let token: String }
    private struct CSRFPair {
        let token: String
        let cookie: HTTPCookie
        let refreshAt: TimeInterval
    }
    private var csrfPair: CSRFPair?
    private struct Proof: Encodable { let code: String; let verifier: String }
    private struct GoogleProof: Encodable { let idToken: String }
    private struct ScheduleSync: Encodable { let initialize: Bool }
    private struct SessionResponse: Decodable { let redirect: String? }
    private lazy var connection = makeSession()
    private let configuration: URLSessionConfiguration?

    init(configuration: URLSessionConfiguration? = nil) {
        self.configuration = configuration
        super.init()
    }

    static func isFirstParty(_ url: URL) -> Bool {
        url.scheme == origin.scheme && url.host == origin.host
            && (url.port ?? 443) == 443 && url.user == nil && url.password == nil
    }

    static func callbackCode(_ url: URL) -> String? {
        guard url.scheme == scheme, url.host == "finish", url.path.isEmpty,
              url.port == nil, url.user == nil, url.password == nil, url.fragment == nil,
              let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              query.count == 1, query[0].name == "code",
              let code = query[0].value, code.range(of: #"^[A-Za-z0-9_-]{43}$"#, options: .regularExpression) != nil
        else { return nil }
        return code
    }

    static func begin() -> (verifier: String, url: URL) {
        var generator = SystemRandomNumberGenerator()
        let verifier = base64URL(Data((0..<32).map { _ in UInt8.random(in: .min ... .max, using: &generator) }))
        let challenge = base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        var url = URLComponents(url: origin.appending(path: "login"), resolvingAgainstBaseURL: false)!
        url.queryItems = [URLQueryItem(name: "mobileChallenge", value: challenge)]
        return (verifier, url.url!)
    }

    func exchange(code: String, verifier: String, theme: HTTPCookie?) async throws -> Session {
        let (_, response) = try await post(
            path: "api/auth/mobile", body: Proof(code: code, verifier: verifier), cookies: [theme].compactMap { $0 }
        )
        return Session(cookie: try cookie(Self.sessionName, from: response))
    }

    func exchange(idToken: String, theme: HTTPCookie?) async throws -> Session {
        let (data, response) = try await post(
            path: "api/auth/session", body: GoogleProof(idToken: idToken), cookies: [theme].compactMap { $0 }
        )
        let result = try JSONDecoder().decode(SessionResponse.self, from: data)
        let name = result.redirect == "/account/deletion" ? "chotcong_deletion" : Self.sessionName
        return Session(cookie: try cookie(name, from: response))
    }

    @MainActor
    func get<T: Decodable>(_ path: String, cookies: [HTTPCookie] = []) async throws -> T {
        var request = URLRequest(url: try endpoint(path))
        for (name, value) in HTTPCookie.requestHeaderFields(with: cookies) {
            request.setValue(value, forHTTPHeaderField: name)
        }
        let (data, response) = try await connection.data(for: request)
        return try decode(data, response)
    }

    @MainActor
    func mutate<T: Decodable>(_ path: String, method: String, body: some Encodable,
                              requestID: UUID, cookies: [HTTPCookie]) async throws -> T {
        let (data, response) = try await post(path: path, body: body, cookies: cookies,
                                              method: method, requestID: requestID)
        return try decode(data, response)
    }

    @MainActor
    func demo<T: Decodable>(_ body: some Encodable) async throws -> T {
        var request = URLRequest(url: try endpoint("/api/demo"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await connection.data(for: request)
        return try decode(data, response)
    }

    @MainActor
    func startDeletion(body: some Encodable, requestID: UUID, cookies: [HTTPCookie]) async throws -> Session {
        let (data, response) = try await post(path: "api/account/deletion/start", body: body,
                                              cookies: cookies, requestID: requestID)
        let _: EmptyResponse = try decode(data, response)
        return Session(cookie: try cookie("chotcong_deletion", from: response))
    }

    private struct EmptyResponse: Decodable {}

    private func endpoint(_ path: String) throws -> URL {
        let path = path.hasPrefix("/") ? path : "/" + path
        guard path.hasPrefix("/api/"), let url = URL(string: path, relativeTo: Self.origin)?.absoluteURL,
              Self.isFirstParty(url), url.path.hasPrefix("/api/"), url.fragment == nil else {
            throw Failure.invalidResponse
        }
        return url
    }

    @MainActor
    func workspace(cookies: [HTTPCookie], initialize: Bool) async throws -> WorkspaceSnapshot {
        let (data, response) = try await post(
            path: "api/mobile/workspace", body: ScheduleSync(initialize: initialize), cookies: cookies
        )
        return try decode(data, response)
    }

    private func decode<T: Decodable>(_ data: Data, _ response: URLResponse) throws -> T {
        guard let status = (response as? HTTPURLResponse)?.statusCode else { throw Failure.invalidResponse }
        switch status {
        case 200 ... 299: return try JSONDecoder().decode(T.self, from: data)
        case 401: throw Failure.expired
        case 423: throw Failure.deleting
        default:
            let message = (try? JSONDecoder().decode(Rejection.self, from: data))?.error ?? ""
            if !message.isEmpty { throw Failure.rejected(status, message) }
            throw Failure.invalidResponse
        }
    }

    private func makeSession() -> URLSession {
        let config = configuration ?? URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.urlCache = nil
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 30
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }

    @MainActor
    private func post(path: String, body: some Encodable, cookies: [HTTPCookie],
                      method: String = "POST", requestID: UUID? = nil) async throws -> (Data, URLResponse) {
        let now = ProcessInfo.processInfo.systemUptime
        let pair: CSRFPair
        if let cached = csrfPair, now < cached.refreshAt {
            pair = cached
        } else {
            var request = URLRequest(url: try endpoint("api/auth/csrf"))
            (cookies.first { $0.name == "chotcong_locale" }).map {
                request.setValue("\($0.name)=\($0.value)", forHTTPHeaderField: "Cookie")
            }
            let (data, response) = try await connection.data(for: request)
            pair = CSRFPair(
                token: try JSONDecoder().decode(CSRF.self, from: data).token,
                cookie: try cookie("chotcong_csrf", from: response),
                refreshAt: now + 55 * 60
            )
            csrfPair = pair
        }
        var request = URLRequest(url: try endpoint(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Self.origin.absoluteString, forHTTPHeaderField: "Origin")
        request.setValue(pair.token, forHTTPHeaderField: "x-csrf-token")
        if let requestID { request.setValue(requestID.uuidString.lowercased(), forHTTPHeaderField: "Idempotency-Key") }
        for (name, value) in HTTPCookie.requestHeaderFields(with: [pair.cookie] + cookies) {
            request.setValue(value, forHTTPHeaderField: name)
        }
        request.httpBody = try JSONEncoder().encode(body)
        let result = try await connection.data(for: request)
        if (result.1 as? HTTPURLResponse)?.statusCode == 403 { csrfPair = nil }
        return result
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }

    private func cookie(_ name: String, from response: URLResponse) throws -> HTTPCookie {
        guard let http = response as? HTTPURLResponse, (200 ... 299).contains(http.statusCode),
              let header = http.value(forHTTPHeaderField: "Set-Cookie"),
              let cookie = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": header], for: Self.origin)
                .first(where: { $0.name == name }),
              !cookie.value.isEmpty, cookie.domain == Self.origin.host,
              cookie.path == "/", cookie.isHTTPOnly, cookie.isSecure
        else { throw Failure.invalidResponse }
        return cookie
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
