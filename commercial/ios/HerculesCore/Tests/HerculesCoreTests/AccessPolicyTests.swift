import XCTest
@testable import HerculesCore

final class AccessPolicyTests: XCTestCase {
    private let account = UUID()
    private let product = "com.herculeshub.monthly"
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func allowed(_ action: WeekAction, _ week: Int, freeWeek: Int = 1,
                         entitlement: Entitlement? = nil, hold: Bool = false) -> Bool {
        AccessPolicy.allows(action, week: week, freeWeek: freeWeek, accountID: account,
                            entitlement: entitlement, productIDs: [product], trainingHold: hold, now: now)
    }

    func testUnpaidMonthIsVisibleAndExportableButOnlyFreeWeekIsWritable() {
        for week in 1...4 {
            XCTAssertTrue(allowed(.preview, week))
            XCTAssertTrue(allowed(.export, week))
            for action in WeekAction.allCases where action != .preview && action != .export {
                XCTAssertEqual(allowed(action, week), week == 1)
            }
        }
    }

    func testVerifiedSubscriptionOpensMonthButDoesNotReleaseSafetyHold() {
        let paid = Entitlement(accountID: account, productID: product, expiresAt: now.addingTimeInterval(60))
        for week in 1...4 { XCTAssertTrue(allowed(.meal, week, entitlement: paid)) }
        XCTAssertFalse(allowed(.training, 2, entitlement: paid, hold: true))
        XCTAssertTrue(allowed(.meal, 2, entitlement: paid, hold: true))
    }

    func testExpiredRevokedUnknownOrOtherAccountPurchaseDoesNotUnlock() {
        let cases = [
            Entitlement(accountID: account, productID: product, expiresAt: now),
            Entitlement(accountID: account, productID: product, expiresAt: now.addingTimeInterval(60), revoked: true),
            Entitlement(accountID: account, productID: "other", expiresAt: now.addingTimeInterval(60)),
            Entitlement(accountID: UUID(), productID: product, expiresAt: now.addingTimeInterval(60))
        ]
        for entitlement in cases { XCTAssertFalse(allowed(.checkin, 2, entitlement: entitlement)) }
    }

    func testLaterCycleFreeWeekAndInvalidWeeks() {
        XCTAssertTrue(allowed(.meal, 3, freeWeek: 3))
        XCTAssertFalse(allowed(.meal, 1, freeWeek: 3))
        XCTAssertFalse(allowed(.preview, 5))
        XCTAssertFalse(allowed(.meal, 1, freeWeek: 0))
    }

    func testIncompleteOrDuplicatedMonthsAreRejected() {
        let week = PlanWeek(number: 1, title: "Week", summary: "Summary")
        XCTAssertThrowsError(try MonthPlan(id: UUID(), cycleNumber: 1, freeWeek: 1,
                                         trainingHold: false, weeks: [week]))
        XCTAssertThrowsError(try MonthPlan(id: UUID(), cycleNumber: 1, freeWeek: 1,
                                         trainingHold: false, weeks: [week, week, week, week]))
    }
}
