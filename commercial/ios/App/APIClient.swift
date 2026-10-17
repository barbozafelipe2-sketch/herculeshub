import Foundation
import HerculesCore

enum APIError: LocalizedError {
    case notConfigured, invalidResponse, rejected(Int), signInRequired, recentSignInRequired
    var errorDescription: String? {
        switch self {
        case .notConfigured: return "O serviço comercial ainda não foi configurado."
        case .invalidResponse: return "O serviço retornou uma resposta inválida."
        case .rejected(let code): return "Não foi possível concluir a operação (\(code))."
        case .recentSignInRequired: return "Para excluir a conta, saia e confirme novamente com Entrar com Apple."
        case .signInRequired: return "Entre na sua conta para continuar."
        }
    }
}

struct CommercialConfiguration {
    let baseURL: URL?
    let productID: String
    let privacyURL: URL?
    let termsURL: URL?
    var purchaseConfigured: Bool { baseURL != nil && !productID.isEmpty && privacyURL != nil && termsURL != nil }

    init(bundle: Bundle = .main) {
        func url(_ key: String) -> URL? {
            guard let raw = bundle.object(forInfoDictionaryKey: key) as? String,
                  let value = URL(string: raw), value.scheme == "https", value.host != nil,
                  value.user == nil, value.password == nil, value.query == nil, value.fragment == nil else { return nil }
            return value
        }
        baseURL = url("HerculesAPIBaseURL")
        productID = (bundle.object(forInfoDictionaryKey: "HerculesMonthlyProductID") as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        privacyURL = url("HerculesPrivacyURL")
        termsURL = url("HerculesTermsURL")
    }
}

struct AppleChallenge: Decodable {
    let challengeID: String
    let nonceSHA256: String
}
struct AppleSignInBody: Encodable {
    let challengeID: String
    let identityToken: String
    let authorizationCode: String
}
struct PurchaseBody: Encodable { let signedTransaction: String }
struct EntitlementResponse: Decodable { let entitlement: Entitlement? }
struct WeekContent: Decodable {
    let training: [String]
    let meals: [String]
    let sessions: [SessionContent]
    let sessionDays: [String]
    let days: [MealDay]
    let completedSessions: [String: Bool]
    let startedAt: String
}
struct CheckinBody: Encodable { let week: Int; let energy: Int; let sleep: Int }
struct Acknowledgement: Decodable { let ok: Bool }

@MainActor
final class APIClient {
    let configuration: CommercialConfiguration
    private let session: URLSession
    private let keychain: SessionKeychain
    var onSessionInvalidated: (() -> Void)?
    private lazy var credentials: SessionController = {
        let controller = SessionController(persist: { [weak self] value in
            guard let self else { throw SessionError.stale }; try self.keychain.save(value)
        },
            refresh: { [weak self] token in
                guard let self else { throw SessionError.stale }
                do {
                    return try await self.request("auth/session/refresh", method: "POST",
                        body: JSONEncoder().encode(["refreshToken": token]))
                } catch APIError.rejected(401) { throw SessionError.invalid }
            })
        controller.onInvalidated = { [weak self] in self?.onSessionInvalidated?() }
        return controller
    }()
    func savedSession() throws -> StoredAppleSession? { try keychain.load() }
    func activate(_ value: StoredAppleSession, persist: Bool = true) throws { try credentials.activate(value, persist: persist) }
    func discard(_ value: AccountSession) {
        Task { let _: Acknowledgement? = try? await request("auth/session/revoke", method: "POST",
            body: JSONEncoder().encode(["refreshToken": value.refreshToken])) }
    }
    func endSession() {
        let refresh = credentials.stored?.credentials.refreshToken
        do { try credentials.clear() } catch { onSessionInvalidated?() }
        if let refresh {
            Task { let _: Acknowledgement? = try? await request("auth/session/revoke", method: "POST",
                body: JSONEncoder().encode(["refreshToken": refresh])) }
        }
    }


    init(configuration: CommercialConfiguration, session: URLSession? = nil) {
        self.configuration = configuration
        keychain = SessionKeychain(baseURL: configuration.baseURL)
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.urlCache = nil
        self.session = session ?? URLSession(configuration: config, delegate: RejectRedirects(), delegateQueue: nil)
    }

    func request<Response: Decodable>(_ path: String, method: String = "GET",
                                     token: String? = nil, body: Data? = nil) async throws -> Response {
        let (data, _) = try await send(path, method: method, token: token, body: body)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom(ServerDate.decode)
        return try decoder.decode(Response.self, from: data)
    }

    func report(token: String) async throws -> Data {
        let (data, response) = try await send("account/report", token: token)
        guard response.mimeType == "application/pdf", data.starts(with: Data("%PDF-".utf8)) else {
            throw APIError.invalidResponse
        }
        return data
    }

    private struct ErrorBody: Decodable { let error: String }
    private func send(_ path: String, method: String = "GET", token: String? = nil,
                      body: Data? = nil) async throws -> (Data, HTTPURLResponse) {
        var bearer: String?
        if let token { bearer = try await credentials.bearer(for: token) }
        var result = try await perform(path, method: method, token: bearer, body: body)
        if let token, credentials.marker != token { throw APIError.signInRequired }
        let reason = try? JSONDecoder().decode(ErrorBody.self, from: result.0).error
        if result.1.statusCode == 401, let token, let rejected = bearer,
           reason == "session_expired" || reason == "session_required" {
            bearer = try await credentials.recover(for: token, rejectedBearer: rejected)
            result = try await perform(path, method: method, token: bearer, body: body)
            guard credentials.marker == token else { throw APIError.signInRequired }
            if result.1.statusCode == 401,
               (try? JSONDecoder().decode(ErrorBody.self, from: result.0).error) != "recent_signin_required" {
                endSession(); onSessionInvalidated?()
                throw APIError.signInRequired
            }
        }
        if result.1.statusCode == 401,
           (try? JSONDecoder().decode(ErrorBody.self, from: result.0).error) == "recent_signin_required" {
            throw APIError.recentSignInRequired
        }
        guard (200...299).contains(result.1.statusCode) else { throw APIError.rejected(result.1.statusCode) }
        return result
    }
    private func perform(_ path: String, method: String, token: String?, body: Data?) async throws -> (Data, HTTPURLResponse) {
        guard let base = configuration.baseURL else { throw APIError.notConfigured }
        var request = URLRequest(url: base.appendingPathComponent(path))
        request.httpMethod = method; request.timeoutInterval = 20
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse,
              http.url?.scheme == "https", http.url?.host == base.host,
              http.url?.port == base.port, data.count <= 2_000_000 else { throw APIError.invalidResponse }
        return (data, http)
    }

}

private final class RejectRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

