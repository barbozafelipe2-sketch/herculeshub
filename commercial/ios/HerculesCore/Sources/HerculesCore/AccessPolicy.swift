import Foundation

/// Server response after verification with Apple; never read from a progress backup.
public struct Entitlement: Codable, Equatable {
    public let accountID: UUID
    public let productID: String
    public let expiresAt: Date
    public let revoked: Bool

    public init(accountID: UUID, productID: String, expiresAt: Date, revoked: Bool = false) {
        self.accountID = accountID
        self.productID = productID
        self.expiresAt = expiresAt
        self.revoked = revoked
    }
}

public enum WeekAction: String, CaseIterable {
    case preview, export, training, meal, checkin, replacement, photo, reminder, postWorkout
}

public enum AccessPolicy {
    /// freeWeek comes from the account's authoritative current cycle, not wall-clock trial days.
    public static func allows(
        _ action: WeekAction, week: Int, freeWeek: Int, accountID: UUID,
        entitlement: Entitlement?, productIDs: Set<String>, trainingHold: Bool,
        now: Date = Date()
    ) -> Bool {
        guard (1...4).contains(week), (1...4).contains(freeWeek) else { return false }
        if action == .preview || action == .export { return true }
        if action == .training && trainingHold { return false }
        let paid = entitlement.map {
            $0.accountID == accountID && productIDs.contains($0.productID) &&
            !$0.revoked && $0.expiresAt > now
        } ?? false
        return week == freeWeek || paid
    }
}

public struct MonthPlan: Codable, Equatable, Identifiable {
    public let id: UUID
    public let cycleNumber: Int
    public let freeWeek: Int
    public let trainingHold: Bool
    public let weeks: [PlanWeek]

    public init(id: UUID, cycleNumber: Int, freeWeek: Int, trainingHold: Bool, weeks: [PlanWeek]) throws {
        guard cycleNumber > 0, (1...4).contains(freeWeek),
              weeks.count == 4, Set(weeks.map(\.number)) == Set(1...4) else {
            throw PlanError.invalidMonth
        }
        self.id = id
        self.cycleNumber = cycleNumber
        self.freeWeek = freeWeek
        self.trainingHold = trainingHold
        self.weeks = weeks.sorted { $0.number < $1.number }
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(id: c.decode(UUID.self, forKey: .id),
                      cycleNumber: c.decode(Int.self, forKey: .cycleNumber),
                      freeWeek: c.decode(Int.self, forKey: .freeWeek),
                      trainingHold: c.decode(Bool.self, forKey: .trainingHold),
                      weeks: c.decode([PlanWeek].self, forKey: .weeks))
    }
}

public enum PlanError: Error { case invalidMonth }

public struct PlanWeek: Codable, Equatable, Identifiable {
    public let number: Int
    public let title: String
    public let summary: String
    public var id: Int { number }

    public init(number: Int, title: String, summary: String) {
        self.number = number
        self.title = title
        self.summary = summary
    }
}
