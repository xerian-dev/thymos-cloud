import Foundation
import SwiftData
import os

/// Manages syncing remote pricing data into the local SwiftData store.
/// Runs on app launch and can be triggered manually via menu bar command.
@Observable
final class SyncService {
    enum SyncState: Equatable {
        case idle
        case syncing(progress: String)
        case completed(Date)
        case failed(String)
    }

    private(set) var state: SyncState = .idle
    private(set) var lastSyncDate: Date?

    private let apiClient: APIClient
    private let modelContainer: ModelContainer
    private let logger = Logger(subsystem: "com.thymos.item-capture", category: "SyncService")

    init(apiClient: APIClient, modelContainer: ModelContainer) {
        self.apiClient = apiClient
        self.modelContainer = modelContainer
    }

    /// Perform a full sync of all pricing-related data.
    @MainActor
    func sync() async {
        guard state != .syncing(progress: "") else { return }

        state = .syncing(progress: "Starting sync...")
        logger.info("Starting pricing data sync")

        do {
            try await syncCategories()
            try await syncCanonicalValues()
            try await syncPricingRecords()

            let now = Date.now
            lastSyncDate = now
            state = .completed(now)
            logger.info("Sync completed successfully")
        } catch {
            let message = (error as? APIError)?.errorDescription ?? error.localizedDescription
            state = .failed(message)
            logger.error("Sync failed: \(message)")
        }
    }

    // MARK: - Sync Stages

    private func syncCategories() async throws {
        await updateProgress("Syncing categories...")

        let categories = try await apiClient.fetchCategories()
        let context = ModelContext(modelContainer)

        for dto in categories {
            let dtoId = dto.id
            let descriptor = FetchDescriptor<Category>(
                predicate: #Predicate { $0.id == dtoId }
            )
            let existing = try context.fetch(descriptor)

            if let record = existing.first {
                record.name = dto.name
                record.syncedAt = .now
            } else {
                let record = Category(id: dto.id, name: dto.name)
                context.insert(record)
            }
        }

        try context.save()
        logger.info("Synced \(categories.count) categories")
    }

    private func syncCanonicalValues() async throws {
        await updateProgress("Syncing brands...")
        let brands = try await apiClient.fetchCanonicalBrands()
        try upsertCanonicalValues(brands, kind: .brand)

        await updateProgress("Syncing colors...")
        let colors = try await apiClient.fetchCanonicalColors()
        try upsertCanonicalValues(colors, kind: .color)

        await updateProgress("Syncing descriptions...")
        let descriptions = try await apiClient.fetchCanonicalDescriptions()
        try upsertCanonicalValues(descriptions, kind: .description)
    }

    private func upsertCanonicalValues(_ values: [String], kind: CanonicalKind) throws {
        let context = ModelContext(modelContainer)

        // Remove stale values for this kind
        let kindRaw = kind.rawValue
        let staleDescriptor = FetchDescriptor<CanonicalValue>(
            predicate: #Predicate { $0.kind == kindRaw }
        )
        let existing = try context.fetch(staleDescriptor)
        let existingValues = Set(existing.map(\.value))
        let newValues = Set(values)

        // Delete values that are no longer canonical
        for record in existing where !newValues.contains(record.value) {
            context.delete(record)
        }

        // Insert new values
        for value in values where !existingValues.contains(value) {
            let record = CanonicalValue(kind: kind, value: value)
            context.insert(record)
        }

        try context.save()
        logger.info("Synced \(values.count) canonical \(kindRaw) values")
    }

    private func syncPricingRecords() async throws {
        await updateProgress("Syncing pricing records...")

        var cursor: String? = nil
        var totalSynced = 0

        repeat {
            let page = try await apiClient.fetchPricingData(cursor: cursor)

            let context = ModelContext(modelContainer)
            for dto in page.records {
                let recordId = dto.id
                let descriptor = FetchDescriptor<PricingRecord>(
                    predicate: #Predicate { $0.id == recordId }
                )
                let existing = try context.fetch(descriptor)

                if let record = existing.first {
                    record.brand = dto.brand
                    record.categoryId = dto.categoryId
                    record.categoryName = dto.categoryName
                    record.itemDescription = dto.description
                    record.color = dto.color
                    record.size = dto.size
                    record.tagPrice = dto.tagPrice
                    record.soldPrice = dto.soldPrice
                    record.daysOnShelf = dto.daysOnShelf
                    record.soldAt = dto.soldAt
                    record.createdAt = dto.createdAt
                    record.syncedAt = .now
                } else {
                    let record = PricingRecord(
                        id: dto.id,
                        brand: dto.brand,
                        categoryId: dto.categoryId,
                        categoryName: dto.categoryName,
                        itemDescription: dto.description,
                        color: dto.color,
                        size: dto.size,
                        tagPrice: dto.tagPrice,
                        soldPrice: dto.soldPrice,
                        daysOnShelf: dto.daysOnShelf,
                        soldAt: dto.soldAt,
                        createdAt: dto.createdAt
                    )
                    context.insert(record)
                }
            }
            try context.save()

            totalSynced += page.records.count
            await updateProgress("Synced \(totalSynced) pricing records...")

            cursor = page.hasMore ? page.nextCursor : nil
        } while cursor != nil

        logger.info("Synced \(totalSynced) pricing records total")
    }

    // MARK: - Helpers

    @MainActor
    private func updateProgress(_ message: String) {
        state = .syncing(progress: message)
    }
}
