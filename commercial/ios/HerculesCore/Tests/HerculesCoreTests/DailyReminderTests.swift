import XCTest
@testable import HerculesCore

final class DailyReminderTests: XCTestCase {
    private func date(_ text: String) -> Date { ISO8601DateFormatter().date(from: text)! }
    private var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: "America/New_York")!
        return value
    }
    private func preferences(details: Bool = true) -> DailyReminderPreferences {
        var p = DailyReminderPreferences()
        p.morningEnabled = true; p.eveningEnabled = true; p.includePlanDetails = details
        return p
    }
    private func week(until: Date = .distantFuture, completed: Set<String> = []) -> ReminderWeek {
        ReminderWeek(number: 1, sessions: ["A"], weekdays: ["Mon"], completed: completed, trainingAllowedUntil: until)
    }
    func testOptInPrivacyAndIndependentPeriods() {
        let start = date("2026-03-02T05:00:00Z")
        XCTAssertTrue(DailyReminderPlanner.make(preferences: DailyReminderPreferences(), startedAt: start,
                                               weeks: [week()], trainingHold: false, now: start, calendar: calendar).isEmpty)
        var p = preferences(details: false)
        p.eveningEnabled = false
        let reminders = DailyReminderPlanner.make(preferences: p, startedAt: start, weeks: [week()],
                                                   trainingHold: false, now: start, calendar: calendar)
        XCTAssertEqual(reminders.count, 14)
        XCTAssertTrue(reminders.allSatisfy { $0.period == "morning" && !$0.body.contains("treino A") })
        p.morningEnabled = false; p.eveningEnabled = true
        XCTAssertTrue(DailyReminderPlanner.make(preferences: p, startedAt: start, weeks: [week()], trainingHold: false,
                                                now: start, calendar: calendar).allSatisfy { $0.period == "evening" })
    }
    func testTrainingRestCompletionAndUnverifiedWeek() {
        let start = date("2026-03-02T05:00:00Z") // Monday at midnight, New York
        let reminders = DailyReminderPlanner.make(preferences: preferences(), startedAt: start, weeks: [week()],
                                                   trainingHold: false, now: start, calendar: calendar)
        XCTAssertEqual(reminders.count, 28)
        XCTAssertTrue(reminders[0].body.contains("treino A"))
        XCTAssertTrue(reminders[2].body.contains("dia de descanso"))
        // A missing/locked week must not be described as a rest day.
        XCTAssertTrue(reminders[14].body.contains("Confira seu plano"))
        let done = DailyReminderPlanner.make(preferences: preferences(), startedAt: start,
                                             weeks: [week(completed: ["A"])], trainingHold: false, now: start, calendar: calendar)
        XCTAssertTrue(done[0].body.contains("já foi registrado"))
        // Evening messages do not claim future completion or shame an unfinished workout.
        XCTAssertTrue(reminders.filter { $0.period == "evening" }.allSatisfy { !$0.body.contains("concluiu") })
    }
    func testSafetyHoldAndExpiredEntitlementNeverInviteTraining() {
        let start = date("2026-03-02T05:00:00Z")
        let held = DailyReminderPlanner.make(preferences: preferences(), startedAt: start, weeks: [week()],
                                              trainingHold: true, now: start, calendar: calendar)
        XCTAssertTrue(held.filter { $0.period == "morning" }.allSatisfy { $0.body.contains("Respeite seus limites") })
        let expired = DailyReminderPlanner.make(preferences: preferences(), startedAt: start,
                                                 weeks: [week(until: start)], trainingHold: false, now: start, calendar: calendar)
        XCTAssertTrue(expired[0].body.contains("Confira seu plano"))
    }
    func testLocalTimeSurvivesDaylightSavingAndStopsAtCycleEnd() {
        let start = date("2026-03-02T05:00:00Z")
        let reminders = DailyReminderPlanner.make(preferences: preferences(), startedAt: start, weeks: [week()],
                                                   trainingHold: false, now: start, calendar: calendar)
        XCTAssertTrue(reminders.allSatisfy {
            calendar.component(.hour, from: $0.date) == ($0.period == "morning" ? 8 : 21)
        })
        XCTAssertEqual(Set(reminders.map(\.date)).count, 28)
        let end = start.addingTimeInterval(28 * 86400)
        let final = DailyReminderPlanner.make(preferences: preferences(), startedAt: start, weeks: [],
                                              trainingHold: false, now: end.addingTimeInterval(-86400), calendar: calendar)
        XCTAssertTrue(final.allSatisfy { $0.date < end && $0.week == 4 })
        XCTAssertTrue(DailyReminderPlanner.make(preferences: preferences(), startedAt: start, weeks: [],
                                               trainingHold: false, now: end, calendar: calendar).isEmpty)
    }
    func testPastTimesInvalidPreferencesAndMalformedPlanAreSafe() {
        let start = date("2026-03-02T05:00:00Z")
        let now = date("2026-03-02T18:00:00Z")
        let malformed = ReminderWeek(number: 1, sessions: ["A"], weekdays: [], completed: [], trainingAllowedUntil: .distantFuture)
        let reminders = DailyReminderPlanner.make(preferences: preferences(), startedAt: start, weeks: [malformed],
                                                   trainingHold: false, now: now, calendar: calendar)
        XCTAssertTrue(reminders.allSatisfy { $0.date > now })
        XCTAssertTrue(reminders[0].period == "evening")
        XCTAssertTrue(reminders[1].body.contains("Confira seu plano"))
        var p = preferences(); p.morningMinute = -1
        XCTAssertTrue(DailyReminderPlanner.make(preferences: p, startedAt: start, weeks: [week()],
                                               trainingHold: false, now: now, calendar: calendar).isEmpty)
    }
}
