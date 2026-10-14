import Foundation
import Combine
import StoreKit

@MainActor
final class StoreKitStore: ObservableObject {
    @Published private(set) var product: Product?
    @Published private(set) var busy = false
    @Published var message: String?
    private var updates: Task<Void, Never>?
    private let account: AccountStore

    init(account: AccountStore) {
        self.account = account
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                guard !Task.isCancelled, let self else { return }
                do { try await self.accept(result) }
                catch { self.message = error.localizedDescription }
            }
        }
    }

    deinit { updates?.cancel() }

    func load() async {
        guard account.api.configuration.purchaseConfigured else { return }
        do {
            product = try await Product.products(for: [account.api.configuration.productID]).first {
                $0.type == .autoRenewable && $0.subscription?.subscriptionPeriod.unit == .month &&
                $0.subscription?.subscriptionPeriod.value == 1
            }
        } catch { message = error.localizedDescription }
    }

    func purchase() async {
        guard !busy, account.api.configuration.purchaseConfigured,
              let product, let identity = account.account else { return }
        busy = true
        defer { busy = false }
        do {
            switch try await product.purchase(options: [.appAccountToken(identity.accountID)]) {
            case .success(let verification): try await accept(verification)
            case .pending: message = "Compra pendente de aprovação. O acesso ainda não foi liberado."
            case .userCancelled: break
            @unknown default: message = "A compra não foi concluída."
            }
        } catch { message = error.localizedDescription }
    }

    func restore() async {
        guard !busy, account.account != nil else { return }
        busy = true
        defer { busy = false }
        do {
            // AppStore.sync is only invoked in response to the user's Restore Purchases action.
            try await AppStore.sync()
            try await reconcile()
            await account.refresh()
            message = "Compras verificadas. O acesso segue a assinatura da sua conta."
        } catch { message = error.localizedDescription }
    }

    func reconcile() async throws {
        for await verification in Transaction.currentEntitlements {
            try await accept(verification)
        }
    }

    private func accept(_ result: VerificationResult<Transaction>) async throws {
        guard case .verified(let transaction) = result else {
            throw APIError.invalidResponse
        }
        guard transaction.productID == account.api.configuration.productID else { return }
        guard let identity = account.account, transaction.appAccountToken == identity.accountID else {
            throw APIError.signInRequired
        }
        // Apple verification on device AND account-bound server validation are required.
        // Revocations/expiration are forwarded too; the server must return null entitlement.
        try await account.acceptPurchase(result.jwsRepresentation)
        await transaction.finish()
    }
}

