import AuthenticationServices
import Combine
import Foundation
import HerculesCore

@MainActor
final class AccountStore: ObservableObject {
    @Published private(set) var account: AccountSession?
    @Published private(set) var month: MonthPlan?
    @Published private(set) var entitlement: Entitlement?
    @Published private(set) var busy = false
    @Published private(set) var needsOnboarding = false
    @Published var error: String?
    let api: APIClient
    private var challenge: AppleChallenge?
    // Tokens are in memory only; progress exports never contain credentials or entitlements.
    init(api: APIClient) { self.api = api }

    func prepareSignIn() async {
        busy = true
        defer { busy = false }
        do {
            challenge = try await api.request("auth/apple/challenge", method: "POST")
            guard let challenge, challenge.nonceSHA256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
                  !challenge.challengeID.isEmpty else { throw APIError.invalidResponse }
        } catch { challenge = nil; self.error = error.localizedDescription }
    }

    var signInReady: Bool { challenge != nil && !busy }

    func configure(_ request: ASAuthorizationAppleIDRequest) {
        request.requestedScopes = []
        request.nonce = challenge?.nonceSHA256
        request.state = challenge?.challengeID
    }

    func signIn(_ result: Result<ASAuthorization, Error>) async {
        busy = true
        defer { busy = false; challenge = nil }
        do {
            let authorization = try result.get()
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let challenge, credential.state == challenge.challengeID,
                  let token = credential.identityToken.flatMap({ String(data: $0, encoding: .utf8) }),
                  let code = credential.authorizationCode.flatMap({ String(data: $0, encoding: .utf8) }) else {
                throw APIError.invalidResponse
            }
            let body = AppleSignInBody(challengeID: challenge.challengeID, identityToken: token, authorizationCode: code)
            let account: AccountSession = try await api.request("auth/apple/session", method: "POST",
                                                               body: JSONEncoder().encode(body))
            guard !account.accessToken.isEmpty else { throw APIError.invalidResponse }
            self.account = account
            await refresh()
        } catch { self.error = error.localizedDescription }
    }

    func refresh() async {
        guard let account else { return }
        do {
            let response: EntitlementResponse = try await api.request("account/entitlement", token: account.accessToken)
            guard self.account?.accessToken == account.accessToken else { return }
            entitlement = response.entitlement
            do {
                let month: MonthPlan = try await api.request("account/month", token: account.accessToken)
                guard self.account?.accessToken == account.accessToken else { return }
                self.month = month
                needsOnboarding = false
            } catch APIError.rejected(409) {
                guard self.account?.accessToken == account.accessToken else { return }
                month = nil
                needsOnboarding = true
            }
        } catch {
            guard self.account?.accessToken == account.accessToken else { return }
            // Failed verification cannot preserve a stale paid unlock.
            entitlement = nil
            self.error = error.localizedDescription
        }
    }

    func acceptPurchase(_ signedTransaction: String) async throws {
        guard let account else { throw APIError.signInRequired }
        entitlement = nil
        let response: EntitlementResponse = try await api.request("account/storekit", method: "POST",
            token: account.accessToken, body: JSONEncoder().encode(PurchaseBody(signedTransaction: signedTransaction)))
        guard self.account?.accessToken == account.accessToken else { throw APIError.signInRequired }
        if let grant = response.entitlement {
            guard grant.accountID == account.accountID, grant.productID == api.configuration.productID,
                  !grant.revoked, grant.expiresAt > Date() else { throw APIError.invalidResponse }
        }
        entitlement = response.entitlement
    }

    func allows(_ action: WeekAction, week: Int) -> Bool {
        guard let account, let month else { return false }
        return AccessPolicy.allows(action, week: week, freeWeek: month.freeWeek, accountID: account.accountID,
                                  entitlement: entitlement, productIDs: [api.configuration.productID],
                                  trainingHold: month.trainingHold)
    }

    func deleteAccount() async throws {
        guard let account else { throw APIError.signInRequired }
        let response: Acknowledgement = try await api.request("account", method: "DELETE", token: account.accessToken)
        guard response.ok else { throw APIError.invalidResponse }
        signOut()
    }

    func completeOnboarding(_ profile: ProfileDraft) async throws {
        guard let account else { throw APIError.signInRequired }
        let response: OnboardingResponse = try await api.request("account/onboarding", method: "POST", token: account.accessToken,
            body: JSONEncoder().encode(OnboardingBody(profile: profile)))
        guard response.ok, self.account?.accessToken == account.accessToken else { throw APIError.invalidResponse }
        month = response.month
        needsOnboarding = false
    }

    func signOut() {
        if let identity = account {
            Task { let _: Acknowledgement? = try? await api.request("account/logout", method: "POST", token: identity.accessToken) }
        }
        account = nil; month = nil; entitlement = nil; challenge = nil; needsOnboarding = false
        ReminderService.clear()
    }
}

