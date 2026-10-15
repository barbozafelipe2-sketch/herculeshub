import XCTest
@testable import HerculesCore

final class ServerDateTests: XCTestCase {
    func testNodeEntitlementTimestampsDecodeWithOrWithoutMilliseconds() throws {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom(ServerDate.decode)
        for timestamp in ["2026-10-15T12:00:00.123Z", "2026-10-15T12:00:00Z"] {
            let body = "{\"accountID\":\"11111111-1111-4111-8111-111111111111\",\"productID\":\"monthly\",\"expiresAt\":\"\(timestamp)\",\"revoked\":false}"
            let entitlement = try decoder.decode(Entitlement.self, from: Data(body.utf8))
            XCTAssertEqual(entitlement.expiresAt, ServerDate.parse(timestamp))
        }
    }
    func testMalformedServerTimestampDoesNotBecomeAnEntitlement() {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom(ServerDate.decode)
        XCTAssertThrowsError(try decoder.decode(Date.self, from: Data("\"not-a-date\"".utf8)))
        XCTAssertNil(ServerDate.parse("not-a-date"))
    }
}
