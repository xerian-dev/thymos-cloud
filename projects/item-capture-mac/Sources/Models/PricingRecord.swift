import Foundation
import SwiftData

/// Represents a historical pricing data point used for local price suggestions.
/// Mirrors the aggregated pricing data from the shop API.
@Model
final class PricingRecord {
    @Attribute(.unique) var id: String
    var brand: String
    var categoryId: String
    var categoryName: String
    var itemDescription: String
    var color: String
    var size: String
    var tagPrice: Double
    var soldPrice: Double?
    var daysOnShelf: Int?
    var soldAt: Date?
    var createdAt: Date
    var syncedAt: Date

    init(
        id: String,
        brand: String,
        categoryId: String,
        categoryName: String,
        itemDescription: String,
        color: String,
        size: String,
        tagPrice: Double,
        soldPrice: Double? = nil,
        daysOnShelf: Int? = nil,
        soldAt: Date? = nil,
        createdAt: Date = .now,
        syncedAt: Date = .now
    ) {
        self.id = id
        self.brand = brand
        self.categoryId = categoryId
        self.categoryName = categoryName
        self.itemDescription = itemDescription
        self.color = color
        self.size = size
        self.tagPrice = tagPrice
        self.soldPrice = soldPrice
        self.daysOnShelf = daysOnShelf
        self.soldAt = soldAt
        self.createdAt = createdAt
        self.syncedAt = syncedAt
    }
}
