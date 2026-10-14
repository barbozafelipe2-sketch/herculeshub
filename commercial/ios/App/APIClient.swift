import Foundation
import HerculesCore

enum APIError: LocalizedError {
    case notConfigured, invalidResponse, rejected(Int), signInRequired
    var errorDescription: String? {
        switch self {
        case .notConfigured: return "O serviço comercial ainda não foi configurado."
        case .invalidResponse: return "O serviço retornou uma resposta inválida."
        case .rejected(let code): return "Não foi possível concluir a operação (\(code))."
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

struct AccountSession: Decodable {
    let accountID: UUID
    let accessToken: String
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
}
struct CheckinBody: Encodable { let week: Int; let energy: Int; let sleep: Int }
struct Acknowledgement: Decodable { let ok: Bool }

final class APIClient {
    let configuration: CommercialConfiguration
    private let session: URLSession

    init(configuration: CommercialConfiguration, session: URLSession? = nil) {
        self.configuration = configuration
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieStorage = nil
        config.urlCache = nil
        self.session = session ?? URLSession(configuration: config, delegate: RejectRedirects(), delegateQueue: nil)
    }

    func request<Response: Decodable>(_ path: String, method: String = "GET",
                                     token: String? = nil, body: Data? = nil) async throws -> Response {
        let (data, _) = try await send(path, method: method, token: token, body: body)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(Response.self, from: data)
    }

    func report(token: String) async throws -> Data {
        let (data, response) = try await send("account/report", token: token)
        guard response.mimeType == "application/pdf", data.starts(with: Data("%PDF-".utf8)) else {
            throw APIError.invalidResponse
        }
        return data
    }

    private func send(_ path: String, method: String = "GET", token: String? = nil,
                      body: Data? = nil) async throws -> (Data, HTTPURLResponse) {
        guard let base = configuration.baseURL else { throw APIError.notConfigured }
        var request = URLRequest(url: base.appendingPathComponent(path))
        request.httpMethod = method
        request.timeoutInterval = 20
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse,
              http.url?.scheme == "https", http.url?.host == base.host else { throw APIError.invalidResponse }
        guard (200...299).contains(http.statusCode) else { throw APIError.rejected(http.statusCode) }
        guard data.count <= 2_000_000 else { throw APIError.invalidResponse }
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

