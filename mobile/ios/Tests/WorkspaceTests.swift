import XCTest
@testable import LessonBrook

final class WorkspaceTests: XCTestCase {
    func testVietQRMatchesServerGoldenAndUpdatesBalance() throws {
        let bank = LedgerRecord(fields: ["bankBin": .string("970436"), "accountNumber": .string("12345678901234")])
        let reference = "CC-2026-000001-4EA8C340B1"
        let payload = try XCTUnwrap(VietQRImage.payload(bank: bank, amount: 30000, reference: reference))
        XCTAssertEqual(payload, "00020101021238580010A000000727012800069704360114123456789012340208QRIBFTTA53037045405300005802VN62290825CC-2026-000001-4EA8C340B16304702E")
        XCTAssertNotEqual(payload, VietQRImage.payload(bank: bank, amount: 20000, reference: reference))
        XCTAssertNil(VietQRImage.payload(bank: bank, amount: 0, reference: reference))
    }

    func testVietnamBusinessDatesAcrossUTCMidnightAndMonthEnd() throws {
        let instant = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-11-30T18:00:00Z"))
        XCTAssertEqual(LedgerDate.text(instant), "2026-12-01")
        let range = LedgerDate.range(.month, at: instant)
        XCTAssertEqual(range.0, "2026-12-01")
        XCTAssertEqual(range.1, "2026-12-31")
        let monday = try XCTUnwrap(LedgerDate.date("2026-11-16"))
        XCTAssertEqual(LedgerDate.range(.weekOfYear, at: monday).0, "2026-11-16")
        XCTAssertEqual(LedgerDate.range(.weekOfYear, at: monday).1, "2026-11-22")
    }

    func testRecordDecodingPreservesNullsIntegersAndMissingLegacyFields() throws {
        let data = Data(#"{"items":[{"id":"legacy","displayName":"Demo learner","activePaymentCount":0,"paidVnd":99999999999,"archivedAt":null,"billable":false}],"nextCursor":null}"#.utf8)
        let page = try JSONDecoder().decode(LedgerPage.self, from: data)
        let item = try XCTUnwrap(page.items.first)
        XCTAssertEqual(item.int("paidVnd"), 99_999_999_999)
        XCTAssertNil(item.string("email"))
        XCTAssertFalse(item.flag("billable"))
        XCTAssertNil(page.nextCursor)
    }

    @MainActor
    func testNativeHTTPKeepsQueryAuthenticationAndIdempotency() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        let api = MobileSignIn(configuration: config)
        let cookie = try XCTUnwrap(HTTPCookie(properties: [
            .name: MobileSignIn.sessionName, .value: "fake-session", .domain: MobileSignIn.origin.host!, .path: "/", .secure: "TRUE"
        ]))
        StubProtocol.requests = []
        StubProtocol.handler = { request in
            if request.url?.path == "/api/auth/csrf" {
                let token = String(repeating: "a", count: 64)
                return (200, ["Set-Cookie": "chotcong_csrf=\(token); Path=/; Secure; HttpOnly; Max-Age=3600"], #"{"token":""# + token + #""}"#)
            }
            if request.httpMethod == "PATCH" { return (200, [:], #"{"id":"student-1"}"#) }
            return (200, [:], #"{"items":[],"nextCursor":null}"#)
        }
        defer { StubProtocol.handler = nil }
        let _: LedgerPage = try await api.get("/api/students?q=Alex%20Rivera&limit=50", cookies: [cookie])
        let id = UUID()
        let _: LedgerRecord = try await api.mutate("/api/students/student-1", method: "PATCH",
            body: ["displayName": LedgerValue.string("Alex")], requestID: id, cookies: [cookie])
        let _: LedgerRecord = try await api.mutate("/api/students/student-1", method: "PATCH",
            body: ["displayName": LedgerValue.string("Alex")], requestID: id, cookies: [cookie])
        XCTAssertEqual(StubProtocol.requests.first?.url?.query, "q=Alex%20Rivera&limit=50")
        let writes = StubProtocol.requests.filter { $0.httpMethod == "PATCH" }
        XCTAssertEqual(writes.count, 2)
        XCTAssertEqual(writes.first?.value(forHTTPHeaderField: "Idempotency-Key"), id.uuidString.lowercased())
        XCTAssertEqual(writes.first?.value(forHTTPHeaderField: "Idempotency-Key"), writes.last?.value(forHTTPHeaderField: "Idempotency-Key"))
        XCTAssertTrue(writes.first?.value(forHTTPHeaderField: "Cookie")?.contains("fake-session") == true)
        XCTAssertTrue(writes.first?.value(forHTTPHeaderField: "Cookie")?.contains("chotcong_csrf=") == true)
        XCTAssertEqual(StubProtocol.requests.filter { $0.url?.path == "/api/auth/csrf" }.count, 1)
    }

    @MainActor
    func testPageCacheReusesReadsAndInvalidatesAfterSuccessfulWrite() async throws {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        let store = WorkspaceStore(api: MobileSignIn(configuration: config))
        StubProtocol.requests = []
        StubProtocol.handler = { request in
            if request.url?.path == "/api/auth/csrf" {
                let token = String(repeating: "b", count: 64)
                return (200, ["Set-Cookie": "chotcong_csrf=\(token); Path=/; Secure; HttpOnly; Max-Age=3600"], "{\"token\":\"\(token)\"}")
            }
            if request.httpMethod == "PATCH" { return (200, [:], #"{"id":"student-1"}"#) }
            return (200, [:], #"{"items":[{"id":"student-1","displayName":"Cached student"}],"nextCursor":null}"#)
        }
        defer { StubProtocol.handler = nil }
        let path = "/api/students?order=name"
        let first = try await store.page(path)
        let second = try await store.page(path)
        XCTAssertEqual(first.items, second.items)
        XCTAssertEqual(StubProtocol.requests.filter { $0.httpMethod == "GET" }.count, 1)
        _ = try await store.write("/api/students/student-1", method: "PATCH", body: ["displayName": .string("Updated")])
        _ = try await store.page(path)
        XCTAssertEqual(StubProtocol.requests.filter { $0.url?.path == "/api/students" }.count, 2)
    }

    func testRoutesPreserveTheClassDateAndClockWhenRecording() {
        XCTAssertEqual(WorkspaceRoute.from("/app/lessons/new?classId=class-1&date=2026-11-16&time=20%3A00"),
                       .recordLesson(classID: "class-1", date: "2026-11-16", time: "20:00"))
        XCTAssertNil(WorkspaceRoute.from("/login"))
    }
}

private final class StubProtocol: URLProtocol {
    static var handler: ((URLRequest) -> (Int, [String: String], String))?
    static var requests: [URLRequest] = []
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.requests.append(request)
        guard let handler = Self.handler else { return }
        let (status, headers, text) = handler(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(text.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
