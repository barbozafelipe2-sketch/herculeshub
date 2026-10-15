import Foundation

public struct DailyReminderPreferences: Codable, Equatable {
    public var morningEnabled = false
    public var eveningEnabled = false
    public var morningMinute = 8 * 60
    public var eveningMinute = 21 * 60
    public var includePlanDetails = false
    public init() {}
    public var enabled: Bool { morningEnabled || eveningEnabled }
}

public struct ReminderWeek {
    public let number: Int
    public let sessions: [String]
    public let weekdays: [String]
    public let completed: Set<String>
    public let trainingAllowedUntil: Date
    public init(number: Int, sessions: [String], weekdays: [String], completed: Set<String>, trainingAllowedUntil: Date) {
        self.number = number; self.sessions = sessions; self.weekdays = weekdays
        self.completed = completed; self.trainingAllowedUntil = trainingAllowedUntil
    }
}

public struct DailyReminder: Equatable {
    public let date: Date
    public let week: Int
    public let period: String
    public let body: String
}

/// Pure planning: finite notifications, local clock, no unverified exercise advice or sensitive profile data.
public enum DailyReminderPlanner {
    public static func make(preferences: DailyReminderPreferences, startedAt: Date, weeks: [ReminderWeek],
                            trainingHold: Bool, now: Date = Date(), calendar: Calendar = .current) -> [DailyReminder] {
        guard preferences.enabled, (0..<1440).contains(preferences.morningMinute),
              (0..<1440).contains(preferences.eveningMinute) else { return [] }
        let names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        let encouragement = ["Um passo de cada vez também é progresso.", "Avance no seu ritmo.", "Reserve um momento para cuidar de você."]
        let recovery = ["Descansar também é parte do treino. Reserve um tempo para desacelerar.",
                        "Cuide do seu sono. A recuperação faz parte da sua evolução.",
                        "O dia termina, o cuidado continua. Prepare seu momento de descanso."]
        var result: [DailyReminder] = []
        for offset in 0..<14 {
            guard let day = calendar.date(byAdding: .day, value: offset, to: calendar.startOfDay(for: now)) else { continue }
            let variation = (calendar.ordinality(of: .day, in: .era, for: day) ?? offset) % 3
            for (period, enabled, minute) in [("morning", preferences.morningEnabled, preferences.morningMinute),
                                               ("evening", preferences.eveningEnabled, preferences.eveningMinute)] where enabled {
                // Calendar arithmetic keeps the chosen local hour across daylight-saving changes.
                guard let date = calendar.date(bySettingHour: minute / 60, minute: minute % 60, second: 0, of: day),
                      calendar.isDate(date, inSameDayAs: day), date > now, date >= startedAt,
                      date < startedAt.addingTimeInterval(28 * 86400) else { continue }
                let number = Int(date.timeIntervalSince(startedAt) / (7 * 86400)) + 1
                var body: String
                if period == "evening" { body = recovery[variation] }
                else if trainingHold {
                    body = "Bom dia! Respeite seus limites e cuide da sua recuperação."
                } else if preferences.includePlanDetails,
                          let week = weeks.first(where: { $0.number == number && date < $0.trainingAllowedUntil }),
                          !week.sessions.isEmpty, week.sessions.count == week.weekdays.count,
                          week.weekdays.allSatisfy({ names.contains($0) }) {
                    let weekday = names[calendar.component(.weekday, from: date) - 1]
                    let today = zip(week.sessions, week.weekdays).filter { $0.1 == weekday }.map { $0.0 }
                    if today.isEmpty {
                        body = "Bom dia! Hoje é dia de descanso no seu plano. Recuperar também é evoluir."
                    } else if today.allSatisfy({ week.completed.contains($0) }) {
                        body = "Seu treino de hoje já foi registrado. Respeite seu ritmo e cuide da recuperação."
                    } else {
                        let titles = today.prefix(2).map { String($0.prefix(48)) }.joined(separator: " e ")
                        body = "Bom dia! Hoje seu plano tem treino \(titles). \(encouragement[variation])"
                    }
                } else {
                    body = "Bom dia! Confira seu plano de hoje. \(encouragement[variation])"
                }
                result.append(DailyReminder(date: date, week: number, period: period, body: body))
            }
        }
        return result.sorted { $0.date < $1.date }
    }
}
