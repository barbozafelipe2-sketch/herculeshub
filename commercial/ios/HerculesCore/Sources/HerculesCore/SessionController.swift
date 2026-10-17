import Foundation

public struct AccountSession: Codable, Equatable {
    public let accountID: UUID
    public let accessToken: String
    public let refreshToken: String
    public let accessExpiresAt: Date
    public let refreshExpiresAt: Date
    public init(accountID: UUID, accessToken: String, refreshToken: String, accessExpiresAt: Date, refreshExpiresAt: Date) {
        self.accountID = accountID; self.accessToken = accessToken; self.refreshToken = refreshToken
        self.accessExpiresAt = accessExpiresAt; self.refreshExpiresAt = refreshExpiresAt
    }
}
public struct StoredAppleSession: Codable, Equatable {
    public let credentials: AccountSession
    public let appleUserID: String
    public init(credentials: AccountSession, appleUserID: String) {
        self.credentials = credentials; self.appleUserID = appleUserID
    }
}
public enum SessionError: Error { case invalid, stale }

/// The marker stays stable for UI identity checks while bearer credentials rotate underneath.
@MainActor
public final class SessionController {
    public private(set) var stored: StoredAppleSession?
    public private(set) var marker: String?
    public var onInvalidated: (() -> Void)?
    private let persist: (StoredAppleSession?) throws -> Void
    private let refresh: (String) async throws -> AccountSession
    private let now: () -> Date
    private var generation = UUID()
    private var renewal: Task<AccountSession, Error>?
    public init(persist: @escaping (StoredAppleSession?) throws -> Void,
                refresh: @escaping (String) async throws -> AccountSession, now: @escaping () -> Date = Date.init) {
        self.persist = persist; self.refresh = refresh; self.now = now
    }
    public func activate(_ value: StoredAppleSession, persist shouldPersist: Bool = true) throws {
        guard !value.appleUserID.isEmpty, valid(value.credentials), value.credentials.refreshExpiresAt > now() else { throw SessionError.invalid }
        if shouldPersist { try persist(value) }
        generation = UUID(); renewal?.cancel(); renewal = nil
        stored = value; marker = value.credentials.accessToken
    }
    public func clear() throws {
        generation = UUID(); renewal?.cancel(); renewal = nil; stored = nil; marker = nil
        try persist(nil)
    }
    public func bearer(for marker: String) async throws -> String {
        guard self.marker == marker, let stored else { throw SessionError.stale }
        if stored.credentials.accessExpiresAt <= now().addingTimeInterval(30) { return try await renew(for: marker).accessToken }
        return stored.credentials.accessToken
    }
    public func recover(for marker: String, rejectedBearer: String) async throws -> String {
        guard self.marker == marker, let stored else { throw SessionError.stale }
        if stored.credentials.accessToken != rejectedBearer { return stored.credentials.accessToken }
        return try await renew(for: marker).accessToken
    }
    private func valid(_ session: AccountSession) -> Bool {
        let pattern = "^[A-Za-z0-9_-]{43}$"
        return session.accessToken.range(of: pattern, options: .regularExpression) != nil &&
            session.refreshToken.range(of: pattern, options: .regularExpression) != nil &&
            session.accessExpiresAt <= session.refreshExpiresAt
    }
    private func renew(for marker: String) async throws -> AccountSession {
        guard self.marker == marker, let old = stored else { throw SessionError.stale }
        if let renewal { return try await renewal.value }
        let revision = generation
        let task = Task { @MainActor () async throws -> AccountSession in
            do {
                guard old.credentials.refreshExpiresAt > now() else { throw SessionError.invalid }
                let credentials = try await refresh(old.credentials.refreshToken)
                guard generation == revision, self.marker == marker else { throw SessionError.stale }
                guard valid(credentials), credentials.accountID == old.credentials.accountID,
                      credentials.accessExpiresAt > now(), credentials.refreshExpiresAt > now() else { throw SessionError.invalid }
                let updated = StoredAppleSession(credentials: credentials, appleUserID: old.appleUserID)
                try persist(updated)
                stored = updated
                return credentials
            } catch {
                if generation == revision, case SessionError.invalid = error {
                    try? clear()
                    onInvalidated?()
                }
                throw error
            }
        }
        renewal = task
        defer { if generation == revision { renewal = nil } }
        return try await task.value
    }
}
