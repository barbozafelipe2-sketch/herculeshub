import Foundation
import UserNotifications

enum ReminderService {
    static func clear() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }
    static func schedule(week: Int, session: String, at date: Date) async throws {
        let center = UNUserNotificationCenter.current()
        guard try await center.requestAuthorization(options: [.alert, .sound, .badge]) else {
            throw ReminderError.permissionDenied
        }
        guard date > Date() else { throw ReminderError.futureDateRequired }
        let content = UNMutableNotificationContent()
        content.title = "Hércules Hub"
        content.body = "Seu treino de hoje está no plano. Confira como está se sentindo antes de começar."
        content.sound = .default
        let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        let request = UNNotificationRequest(identifier: "hercules-week-\(week)-\(session)", content: content,
            trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false))
        try await center.add(request)
    }
}
enum ReminderError: LocalizedError {
    case permissionDenied, futureDateRequired
    var errorDescription: String? {
        switch self {
        case .permissionDenied: return "Permita notificações nos Ajustes para receber o lembrete."
        case .futureDateRequired: return "Escolha um horário futuro."
        }
    }
}

