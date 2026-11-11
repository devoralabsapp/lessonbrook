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

    private enum Failure: Error { case invalidResponse }
    private struct CSRF: Decodable { let token: String }
    private struct Proof: Encodable { let code: String; let verifier: String }
    private struct GoogleProof: Encodable { let idToken: String }
    private struct SessionResponse: Decodable { let redirect: String? }

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
            path: "api/auth/mobile", body: Proof(code: code, verifier: verifier), theme: theme
        )
        return Session(cookie: try cookie(Self.sessionName, from: response))
    }

    func exchange(idToken: String, theme: HTTPCookie?) async throws -> Session {
        let (data, response) = try await post(
            path: "api/auth/session", body: GoogleProof(idToken: idToken), theme: theme
        )
        let result = try JSONDecoder().decode(SessionResponse.self, from: data)
        let name = result.redirect == "/account/deletion" ? "chotcong_deletion" : Self.sessionName
        return Session(cookie: try cookie(name, from: response))
    }

    private func post(path: String, body: some Encodable, theme: HTTPCookie?) async throws -> (Data, URLResponse) {
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.urlCache = nil
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 30
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }

        let (data, csrfResponse) = try await session.data(from: Self.origin.appending(path: "api/auth/csrf"))
        let token = try JSONDecoder().decode(CSRF.self, from: data).token
        let csrf = try cookie("chotcong_csrf", from: csrfResponse)
        var request = URLRequest(url: Self.origin.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Self.origin.absoluteString, forHTTPHeaderField: "Origin")
        request.setValue(token, forHTTPHeaderField: "x-csrf-token")
        let cookies = [csrf, theme].compactMap { $0 }
        for (name, value) in HTTPCookie.requestHeaderFields(with: cookies) {
            request.setValue(value, forHTTPHeaderField: name)
        }
        request.httpBody = try JSONEncoder().encode(body)
        return try await session.data(for: request)
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
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
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
