import XCTest
@testable import HerculesCore

@MainActor
final class SessionControllerTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private let id = UUID()
    private func pair(_ letter: String, expires: TimeInterval = -1, account: UUID? = nil) -> AccountSession {
        AccountSession(accountID: account ?? id, accessToken: String(repeating: letter, count: 43),
                       refreshToken: String(repeating: letter.uppercased(), count: 43),
                       accessExpiresAt: now.addingTimeInterval(expires), refreshExpiresAt: now.addingTimeInterval(86400))
    }
    private func saved(_ pair: AccountSession) -> StoredAppleSession { StoredAppleSession(credentials: pair, appleUserID: "apple-user") }

    func testRestoreAndRotationPersistNewCredentialsButKeepTheUIIdentity() async throws {
        let old = pair("a"), next = pair("b", expires: 3600)
        var persisted: StoredAppleSession?
        let controller = SessionController(persist: { persisted = $0 }, refresh: { token in
            XCTAssertEqual(token, old.refreshToken); return next
        }, now: { self.now })
        let data = try JSONEncoder().encode(saved(old))
        try controller.activate(JSONDecoder().decode(StoredAppleSession.self, from: data), persist: false)
        XCTAssertNil(persisted)
        let bearer = try await controller.bearer(for: old.accessToken)
        XCTAssertEqual(bearer, next.accessToken)
        XCTAssertEqual(persisted?.credentials, next)
        XCTAssertEqual(controller.marker, old.accessToken)
        XCTAssertEqual(controller.stored?.appleUserID, "apple-user")
    }
    func testConcurrentExpiryAndLate401ShareOneRenewal() async throws {
        let old = pair("a"), next = pair("b", expires: 3600)
        var calls = 0
        let controller = SessionController(persist: { _ in }, refresh: { _ in
            calls += 1
            await Task.yield()
            return next
        }, now: { self.now })
        try controller.activate(saved(old))
        async let a = controller.bearer(for: old.accessToken)
        async let b = controller.bearer(for: old.accessToken)
        let values = try await [a, b]
        XCTAssertEqual(values, [next.accessToken, next.accessToken]); XCTAssertEqual(calls, 1)
        let recovered = try await controller.recover(for: old.accessToken, rejectedBearer: old.accessToken)
        XCTAssertEqual(recovered, next.accessToken); XCTAssertEqual(calls, 1)
    }
    func testTransientFailureKeepsTheSavedSessionForRetry() async throws {
        let old = pair("a")
        var persisted: StoredAppleSession?
        let controller = SessionController(persist: { persisted = $0 }, refresh: { _ in throw URLError(.notConnectedToInternet) }, now: { self.now })
        try controller.activate(saved(old))
        do { _ = try await controller.bearer(for: old.accessToken); XCTFail("Expected offline error") } catch {}
        XCTAssertEqual(persisted?.credentials, old); XCTAssertEqual(controller.stored?.credentials, old)
    }
    func testRejectedRefreshClearsStorageAndInvalidatesOnce() async throws {
        let old = pair("a")
        var persisted: StoredAppleSession?, invalidations = 0
        let controller = SessionController(persist: { persisted = $0 }, refresh: { _ in throw SessionError.invalid }, now: { self.now })
        controller.onInvalidated = { invalidations += 1 }
        try controller.activate(saved(old))
        do { _ = try await controller.bearer(for: old.accessToken); XCTFail("Expected invalid session") } catch {}
        XCTAssertNil(persisted); XCTAssertNil(controller.stored); XCTAssertNil(controller.marker)
        XCTAssertEqual(invalidations, 1)
    }
    func testLogoutOrAccountChangeCannotBeUndoneByAnInflightRefresh() async throws {
        for changeAccount in [false, true] {
            let old = pair("a"), next = pair("b", expires: 3600), other = pair("c", expires: 3600, account: UUID())
            var continuation: CheckedContinuation<AccountSession, Error>?
            var persisted: StoredAppleSession?
            let controller = SessionController(persist: { persisted = $0 }, refresh: { _ in
                try await withCheckedThrowingContinuation { continuation = $0 }
            }, now: { self.now })
            try controller.activate(saved(old))
            let request = Task { try await controller.bearer(for: old.accessToken) }
            for _ in 0..<1000 where continuation == nil { await Task.yield() }
            guard let continuation else { XCTFail("Refresh did not start"); request.cancel(); return }
            if changeAccount { try controller.activate(saved(other)) } else { try controller.clear() }
            continuation.resume(returning: next)
            do { _ = try await request.value; XCTFail("Old refresh must be ignored") } catch {}
            XCTAssertEqual(persisted?.credentials, changeAccount ? other : nil)
            XCTAssertEqual(controller.stored?.credentials, changeAccount ? other : nil)
        }
    }
    func testStorageFailureOrWrongAccountNeverAcceptsRotatedCredentials() async throws {
        let old = pair("a"), other = pair("b", expires: 3600, account: UUID())
        let wrong = SessionController(persist: { _ in }, refresh: { _ in other }, now: { self.now })
        try wrong.activate(saved(old))
        do { _ = try await wrong.bearer(for: old.accessToken); XCTFail("Account changed") } catch {}
        XCTAssertNil(wrong.stored)
        var failSave = false
        let controller = SessionController(persist: { _ in if failSave { throw URLError(.cannotWriteToFile) } },
            refresh: { _ in self.pair("b", expires: 3600) }, now: { self.now })
        try controller.activate(saved(old)); failSave = true
        do { _ = try await controller.bearer(for: old.accessToken); XCTFail("Storage failed") } catch {}
        XCTAssertEqual(controller.stored?.credentials, old)
    }
}
