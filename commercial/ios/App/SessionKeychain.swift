import Foundation
import HerculesCore
import Security

struct SessionKeychain {
    private let service: String
    init(baseURL: URL?, bundleID: String = Bundle.main.bundleIdentifier ?? "HerculesHub") {
        service = bundleID + ".apple-session.v1." + (baseURL?.absoluteString ?? "unconfigured")
    }
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service, kSecAttrAccount as String: "current",
         kSecAttrSynchronizable as String: false]
    }
    func load() throws -> StoredAppleSession? {
        if UserDefaults.standard.bool(forKey: service + ".signed-out") { try save(nil); return nil }
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes = result as? Data else { throw KeychainError.unavailable }
        do { return try JSONDecoder().decode(StoredAppleSession.self, from: bytes) }
        catch { try save(nil); return nil }
    }
    func save(_ session: StoredAppleSession?) throws {
        guard let session else {
            UserDefaults.standard.set(true, forKey: service + ".signed-out")
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError.unavailable }
            return
        }
        let attributes: [String: Any] = [kSecValueData as String: try JSONEncoder().encode(session),
                                       kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let update = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if update == errSecItemNotFound {
            let status = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)
            guard status == errSecSuccess else { throw KeychainError.unavailable }
        } else if update != errSecSuccess { throw KeychainError.unavailable }
        UserDefaults.standard.set(false, forKey: service + ".signed-out")
    }
}
enum KeychainError: LocalizedError {
    case unavailable
    var errorDescription: String? { "Não foi possível acessar a sessão protegida. Desbloqueie o iPhone e tente novamente." }
}
