import Foundation
import SwiftData

/// A product category used for item classification and pricing grouping.
@Model
final class Category {
    @Attribute(.unique) var id: String
    var name: String
    var syncedAt: Date

    init(id: String, name: String, syncedAt: Date = .now) {
        self.id = id
        self.name = name
        self.syncedAt = syncedAt
    }
}
