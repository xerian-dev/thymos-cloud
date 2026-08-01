import Foundation
import SwiftData

/// Stores canonical (normalized) values for autocomplete fields.
/// Each record belongs to a specific kind (brand, color, description).
@Model
final class CanonicalValue {
    @Attribute(.unique) var compositeKey: String
    var kind: String
    var value: String
    var syncedAt: Date

    init(kind: CanonicalKind, value: String, syncedAt: Date = .now) {
        self.compositeKey = "\(kind.rawValue):\(value)"
        self.kind = kind.rawValue
        self.value = value
        self.syncedAt = syncedAt
    }
}

enum CanonicalKind: String, CaseIterable, Sendable {
    case brand
    case color
    case description
}
