import Combine
import Foundation
import HerculesCore
import UserNotifications

@MainActor
enum DailyReminderService {
    private static let prefix = "hercules-daily-"
    private static var generation = UUID()
    private static var activeIDs: [String] = []
    static func preferences(for accountID: UUID) -> DailyReminderPreferences {
        guard let data = UserDefaults.standard.data(forKey: "daily-reminders-\(accountID)"),
              let value = try? JSONDecoder().decode(DailyReminderPreferences.self, from: data) else {
            return DailyReminderPreferences()
        }
        return value
    }
    static func save(_ preferences: DailyReminderPreferences, for accountID: UUID) throws {
        UserDefaults.standard.set(try JSONEncoder().encode(preferences), forKey: "daily-reminders-\(accountID)")
    }
    static func forget(_ accountID: UUID) {
        UserDefaults.standard.removeObject(forKey: "daily-reminders-\(accountID)")
        cancel()
    }
    static func authorize() async throws {
        guard try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) else {
            throw ReminderError.permissionDenied
        }
    }
    static func cancel() {
        generation = UUID()
        let revision = generation
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: activeIDs)
        activeIDs = []
        Task { @MainActor in
            let pending = await center.pendingNotificationRequests()
            let delivered = await center.deliveredNotifications()
            guard revision == generation else { return }
            center.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier).filter { $0.hasPrefix(prefix) })
            center.removeDeliveredNotifications(withIdentifiers: delivered.map { $0.request.identifier }.filter { $0.hasPrefix(prefix) })
        }
    }
    static func replace(_ reminders: [DailyReminder], monthID: UUID, accountID: UUID) async throws {
        cancel()
        generation = UUID()
        let revision = generation
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        guard revision == generation else { return }
        center.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier).filter { $0.hasPrefix(prefix) })
        let settings = await center.notificationSettings()
        guard revision == generation else { return }
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
        for (index, reminder) in reminders.prefix(28).enumerated() {
            guard revision == generation else { return }
            let content = UNMutableNotificationContent()
            content.title = reminder.period == "morning" ? "Hércules • Seu dia" : "Hércules • Hora de descansar"
            content.body = reminder.body
            content.sound = .default
            content.userInfo = ["herculesDaily": true, "accountID": accountID.uuidString,
                                "monthID": monthID.uuidString, "week": reminder.week]
            var components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: reminder.date)
            components.timeZone = Calendar.current.timeZone
            let id = prefix + revision.uuidString + "-" + String(index)
            activeIDs.append(id)
            try await center.add(UNNotificationRequest(identifier: id, content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)))
            if revision != generation {
                center.removePendingNotificationRequests(withIdentifiers: [id])
                return
            }
        }
    }
}

struct ReminderDestination {
    let accountID: UUID
    let monthID: UUID
    let week: Int
}

final class ReminderNotificationRouter: NSObject, UNUserNotificationCenterDelegate, ObservableObject, @unchecked Sendable {
    static let shared = ReminderNotificationRouter()
    @Published private(set) var destination: ReminderDestination?
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        if info["herculesDaily"] as? Bool == true,
           let account = (info["accountID"] as? String).flatMap(UUID.init(uuidString:)),
           let month = (info["monthID"] as? String).flatMap(UUID.init(uuidString:)),
           let week = info["week"] as? Int, (1...4).contains(week) {
            Task { @MainActor in self.destination = ReminderDestination(accountID: account, monthID: month, week: week) }
        }
        completionHandler()
    }
    @MainActor func consume() { destination = nil }
}
