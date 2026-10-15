import Foundation

/// Node JSON timestamps contain fractional seconds; Apple's default ISO decoder may reject them.
public enum ServerDate {
    public static func parse(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
    public static func decode(_ decoder: Decoder) throws -> Date {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self)
        guard let date = parse(value) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid server timestamp")
        }
        return date
    }
}
