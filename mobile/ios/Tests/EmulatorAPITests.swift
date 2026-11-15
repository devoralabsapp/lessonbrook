import XCTest
@testable import LessonBrook

/// Exercises the native HTTP client against an explicitly loopback-only backend.
/// Run the guarded Auth/Firestore Emulators and demo server before this suite.
final class EmulatorAPITests: XCTestCase {
    @MainActor
    func testAuthenticatedTuitionLifecycleAndAccountIsolation() async throws {
        let availability = URL(string: "http://127.0.0.1:9099/")!
        var probe = URLRequest(url: availability)
        probe.timeoutInterval = 1
        do { _ = try await URLSession.shared.data(for: probe) }
        catch { throw XCTSkip("Start the guarded local Auth/Firestore Emulators for native account integration.") }

        let token = try await googleToken()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [LoopbackProtocol.self]
        let api = MobileSignIn(configuration: configuration)
        let session = try await api.exchange(idToken: token, theme: nil)
        let cookies = [session.cookie]
        func write(_ path: String, _ body: [String: LedgerValue], method: String = "POST") async throws -> LedgerRecord {
            try await api.mutate(path, method: method, body: body, requestID: UUID(), cookies: cookies)
        }
        let _: LedgerRecord = try await write("/api/profile", ["displayName": .string("Native Demo Teacher")], method: "PATCH")
        let _: LedgerRecord = try await write("/api/profile/bank-transfer", ["bankTransfer": .object([
            "bankBin": .string("970407"), "accountNumber": .string("12345678901234"), "accountName": .string("DEMO TEACHER")
        ])], method: "PATCH")
        let student = try await write("/api/students", ["displayName": .string("Native Test Learner"),
            "contactName": .string("Demo Parent"), "phone": .string(""), "email": .string("parent@example.test"), "privateNote": .string("")])
        let teachingClass = try await write("/api/classes", ["displayName": .string("Native Test Class"),
            "rateVnd": .number(30000), "privateNote": .string(""), "studentIds": .strings([student.id]),
            "weeklySchedule": .array([.object(["weekday": .number(2), "time": .string("20:00")])])])
        let group = try await write("/api/lessons", ["classId": .string(teachingClass.id), "studentIds": .strings([student.id]),
            "rateVnd": .number(30000), "sessionDate": .string(LedgerDate.today), "startTime": .string("18:00"),
            "durationMinutes": .number(45), "status": .string("planned"), "billable": .flag(true), "privateNote": .string("")])
        let groupDetail: LedgerRecord = try await api.get("/api/lessons/" + group.id, cookies: cookies)
        let sessionID = try XCTUnwrap(groupDetail.strings("sessionIds").first)
        let _: LedgerRecord = try await write("/api/sessions/complete", ["ids": .strings([sessionID])])
        let query = ["studentId": student.id, "periodStart": LedgerDate.today, "periodEnd": LedgerDate.today]
        let eligible: LedgerPage = try await api.get(ledgerPath("/api/statements/eligible", query), cookies: cookies)
        XCTAssertEqual(eligible.items.map(\.id), [sessionID])
        var issue = query.mapValues(LedgerValue.string)
        issue["dueDate"] = .string(LedgerDate.today)
        issue["sessionIds"] = .strings([sessionID])
        issue["includeBankDetails"] = .flag(true)
        let created = try await write("/api/statements/issue", issue)
        let path = "/api/statements/" + created.id
        let statement: LedgerRecord = try await api.get(path, cookies: cookies)
        XCTAssertEqual(statement.int("totalVnd"), 30000)
        let share = try await write(path + "/share", ["version": .number(statement.int("version"))])
        XCTAssertFalse(share.text("token").isEmpty)
        let payment = try await write(path + "/payments", ["amountVnd": .number(10000),
            "receivedDate": .string(LedgerDate.today), "method": .string("cash"), "privateNote": .string("Partial cash")])
        var updated: LedgerRecord = try await api.get(path, cookies: cookies)
        XCTAssertEqual(updated.int("paidVnd"), 10000)
        XCTAssertFalse(updated.flag("canCancel"))
        let paymentPage: LedgerPage = try await api.get(path + "/payments", cookies: cookies)
        let paymentDetail = try XCTUnwrap(paymentPage.items.first { $0.id == payment.id })
        let _ = try await write("/api/payments/" + payment.id, ["amountVnd": .number(15000),
            "receivedDate": .string(LedgerDate.today), "privateNote": .string("Corrected cash"),
            "expectedUpdatedAt": paymentDetail["updatedAt"]], method: "PATCH")
        let revised: LedgerRecord = try await api.get(path, cookies: cookies)
        XCTAssertEqual(revised.int("paidVnd"), 15000)
        let _: LedgerRecord = try await write("/api/payments/" + payment.id + "/void", ["reason": .string("Native test correction")])
        updated = try await api.get(path, cookies: cookies)
        XCTAssertEqual(updated.int("paidVnd"), 0)
        let _: LedgerRecord = try await write(path + "/payments", ["amountVnd": .number(30000),
            "receivedDate": .string(LedgerDate.today), "method": .string("cash"), "privateNote": .string("")])
        updated = try await api.get(path, cookies: cookies)
        XCTAssertEqual(updated.int("paidVnd"), 30000)
        XCTAssertNil(updated.string("activeShareTokenHash"))
        let history: LedgerPage = try await api.get(path + "/payments", cookies: cookies)
        XCTAssertEqual(history.items.count, 2)
        XCTAssertEqual(history.items.filter { $0.string("voidedAt") == nil }.count, 1)
        let otherAPI = MobileSignIn(configuration: configuration)
        let other = try await otherAPI.exchange(idToken: googleToken(), theme: nil)
        do {
            let _: LedgerRecord = try await otherAPI.get(path, cookies: [other.cookie])
            XCTFail("An unrelated teacher must not read this statement")
        } catch { /* Server authorization is enforced even with a warm cache. */ }
    }

    private func googleToken() async throws -> String {
        let uid = "native-" + UUID().uuidString.lowercased()
        var request = URLRequest(url: URL(string: "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-api-key")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let identity: [String: Any] = ["sub": uid, "email": uid + "@example.test", "name": "Native QA Teacher", "email_verified": true]
        let data = try JSONSerialization.data(withJSONObject: identity)
        var post = URLComponents()
        post.queryItems = [URLQueryItem(name: "providerId", value: "google.com"),
                           URLQueryItem(name: "id_token", value: String(decoding: data, as: UTF8.self))]
        request.httpBody = try JSONSerialization.data(withJSONObject: ["postBody": post.percentEncodedQuery!,
            "requestUri": "http://localhost:3000", "returnSecureToken": true])
        let (body, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(LedgerRecord.self, from: body)
        let token = try XCTUnwrap(response.string("idToken"))
        let pieces = token.split(separator: ".", omittingEmptySubsequences: false)
        guard pieces.count == 3 else { throw MobileSignIn.Failure.invalidResponse }
        var payload = String(pieces[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        payload += String(repeating: "=", count: (4 - payload.count % 4) % 4)
        let claims = try JSONDecoder().decode(LedgerRecord.self, from: XCTUnwrap(Data(base64Encoded: payload)))
        guard claims.text("aud") == "demo-chotcong",
              claims.text("iss") == "https://securetoken.google.com/demo-chotcong" else {
            throw XCTSkip("Refusing an Auth Emulator that is not the guarded demo-chotcong project.")
        }
        return token
    }
}

/// Only test requests are forwarded; the shipping app retains its strict HTTPS origin.
private final class LoopbackProtocol: URLProtocol {
    private var forwardingTask: URLSessionDataTask?
    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == MobileSignIn.origin.host
    }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let original = request.url, original.path.hasPrefix("/api/"),
              var target = URLComponents(url: original, resolvingAgainstBaseURL: false) else { return }
        target.scheme = "http"; target.host = "127.0.0.1"; target.port = 3000
        var forwarded = request
        forwarded.url = target.url
        forwarded.setValue("http://localhost:3000", forHTTPHeaderField: "Origin")
        if let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let size = stream.read(&buffer, maxLength: buffer.count)
                if size <= 0 { break }
                data.append(buffer, count: size)
            }
            forwarded.httpBody = data
        }
        forwardingTask = URLSession.shared.dataTask(with: forwarded) { [weak self] data, response, error in
            guard let self else { return }
            if let error { self.client?.urlProtocol(self, didFailWithError: error); return }
            guard let response = response as? HTTPURLResponse, let data else { return }
            var headers = response.allHeaderFields as? [String: String] ?? [:]
            for key in headers.keys where key.lowercased() == "set-cookie" {
                headers[key] = headers[key]! + "; Secure"
            }
            let mapped = HTTPURLResponse(url: original, statusCode: response.statusCode, httpVersion: nil, headerFields: headers)!
            self.client?.urlProtocol(self, didReceive: mapped, cacheStoragePolicy: .notAllowed)
            self.client?.urlProtocol(self, didLoad: data)
            self.client?.urlProtocolDidFinishLoading(self)
        }
        forwardingTask?.resume()
    }
    override func stopLoading() { forwardingTask?.cancel() }
}
