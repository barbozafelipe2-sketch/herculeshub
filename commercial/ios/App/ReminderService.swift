import Foundation
import UserNotifications

enum ReminderService {
    static func scheduleWeek(week: Int, startedAt: String, sessions: [String], days: [String], time: Date) async throws -> Int {
        guard let start = ISO8601DateFormatter().date(from: startedAt), sessions.count == days.count else { throw ReminderError.futureDateRequired }
        let calendar = Calendar.current
        guard let weekStart = calendar.date(byAdding: .day, value: (week - 1) * 7, to: start),
              let weekEnd = calendar.date(byAdding: .day, value: week * 7, to: start) else { throw ReminderError.futureDateRequired }
        let names = ["Sun": 1, "Mon": 2, "Tue": 3, "Wed": 4, "Thu": 5, "Fri": 6, "Sat": 7]
        let clock = calendar.dateComponents([.hour, .minute], from: time)
        var count = 0
        for (session, day) in zip(sessions, days) {
            guard let weekday = names[day] else { continue }
            let components = DateComponents(hour: clock.hour, minute: clock.minute, weekday: weekday)
            let earliest = max(weekStart, Date()).addingTimeInterval(1)
            guard let date = calendar.nextDate(after: earliest, matching: components, matchingPolicy: .nextTime), date < weekEnd else { continue }
            try await schedule(week: week, session: session, at: date)
            count += 1
        }
        guard count > 0 else { throw ReminderError.futureDateRequired }
        return count
    }
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

