import SwiftUI
import UserNotifications

@main
struct HerculesHubApp: App {
    @StateObject private var account: AccountStore
    @StateObject private var commerce: StoreKitStore

    init() {
        UNUserNotificationCenter.current().delegate = ReminderNotificationRouter.shared
        let account = AccountStore(api: APIClient(configuration: CommercialConfiguration()))
        _account = StateObject(wrappedValue: account)
        _commerce = StateObject(wrappedValue: StoreKitStore(account: account))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(account)
                .environmentObject(commerce)
                .task { await account.restoreSession() }
        }
    }
}

