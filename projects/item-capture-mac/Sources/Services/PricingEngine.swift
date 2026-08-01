import Foundation
import SwiftData
import os

/// Local pricing engine that computes price suggestions from the local SwiftData store.
/// Mirrors the logic of the server-side pricing/suggest endpoint.
struct PriceSuggestion: Equatable {
    let suggestedPrice: Double
    let confidence: Confidence
    let explanation: String
    let sampleSize: Int

    enum Confidence: String, Equatable {
        case high
        case medium
        case low
    }
}

@Observable
final class PricingEngine {
    private let modelContainer: ModelContainer
    private let logger = Logger(subsystem: "com.thymos.item-capture", category: "PricingEngine")

    init(modelContainer: ModelContainer) {
        self.modelContainer = modelContainer
    }

    /// Compute a price suggestion based on the provided item attributes.
    /// Searches progressively broader groups until enough data is found.
    func suggest(
        brand: String,
        categoryId: String,
        description: String,
        color: String,
        size: String
    ) async -> PriceSuggestion? {
        let context = ModelContext(modelContainer)

        // Strategy: try increasingly broad queries
        // 1. Exact match: brand + category + description
        // 2. Brand + category
        // 3. Category only

        if let result = try? exactMatch(
            context: context,
            brand: brand,
            categoryId: categoryId,
            description: description,
            color: color,
            size: size
        ) {
            return result
        }

        if let result = try? brandCategoryMatch(
            context: context,
            brand: brand,
            categoryId: categoryId
        ) {
            return result
        }

        if let result = try? categoryMatch(context: context, categoryId: categoryId) {
            return result
        }

        return nil
    }

    // MARK: - Query Strategies

    private func exactMatch(
        context: ModelContext,
        brand: String,
        categoryId: String,
        description: String,
        color: String,
        size: String
    ) throws -> PriceSuggestion? {
        let descriptor = FetchDescriptor<PricingRecord>(
            predicate: #Predicate {
                $0.brand == brand &&
                $0.categoryId == categoryId &&
                $0.itemDescription == description
            }
        )
        let records = try context.fetch(descriptor)

        guard records.count >= 3 else { return nil }

        let prices = records.map(\.tagPrice).sorted()
        let median = medianValue(prices)

        // Apply color/size adjustments from the matching subset
        var adjustment: Double = 0
        let colorMatches = records.filter { $0.color == color }
        if !colorMatches.isEmpty && colorMatches.count != records.count {
            let colorMedian = medianValue(colorMatches.map(\.tagPrice))
            adjustment += (colorMedian - median) * 0.3
        }

        let sizeMatches = records.filter { $0.size == size }
        if !sizeMatches.isEmpty && sizeMatches.count != records.count {
            let sizeMedian = medianValue(sizeMatches.map(\.tagPrice))
            adjustment += (sizeMedian - median) * 0.2
        }

        let suggested = roundToFive(median + adjustment)

        return PriceSuggestion(
            suggestedPrice: suggested,
            confidence: records.count >= 10 ? .high : .medium,
            explanation: "Based on \(records.count) similar items (\(brand) / \(description))",
            sampleSize: records.count
        )
    }

    private func brandCategoryMatch(
        context: ModelContext,
        brand: String,
        categoryId: String
    ) throws -> PriceSuggestion? {
        let descriptor = FetchDescriptor<PricingRecord>(
            predicate: #Predicate {
                $0.brand == brand && $0.categoryId == categoryId
            }
        )
        let records = try context.fetch(descriptor)

        guard records.count >= 5 else { return nil }

        let prices = records.map(\.tagPrice).sorted()
        let median = medianValue(prices)
        let suggested = roundToFive(median)

        return PriceSuggestion(
            suggestedPrice: suggested,
            confidence: records.count >= 15 ? .medium : .low,
            explanation: "Based on \(records.count) items in this brand + category",
            sampleSize: records.count
        )
    }

    private func categoryMatch(
        context: ModelContext,
        categoryId: String
    ) throws -> PriceSuggestion? {
        let descriptor = FetchDescriptor<PricingRecord>(
            predicate: #Predicate { $0.categoryId == categoryId }
        )
        let records = try context.fetch(descriptor)

        guard records.count >= 10 else { return nil }

        let prices = records.map(\.tagPrice).sorted()
        let median = medianValue(prices)
        let suggested = roundToFive(median)

        return PriceSuggestion(
            suggestedPrice: suggested,
            confidence: .low,
            explanation: "Based on \(records.count) items in this category",
            sampleSize: records.count
        )
    }

    // MARK: - Math Helpers

    private func medianValue(_ sorted: [Double]) -> Double {
        guard !sorted.isEmpty else { return 0 }
        let mid = sorted.count / 2
        if sorted.count.isMultiple(of: 2) {
            return (sorted[mid - 1] + sorted[mid]) / 2.0
        }
        return sorted[mid]
    }

    /// Round to nearest 5 (e.g., 12.30 → 10, 13.80 → 15)
    private func roundToFive(_ value: Double) -> Double {
        (value / 5.0).rounded() * 5.0
    }
}
