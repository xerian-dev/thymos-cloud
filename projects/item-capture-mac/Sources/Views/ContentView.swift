import SwiftUI
import SwiftData

/// Main window content view that arranges the item capture form on the left
/// and price suggestion panel on the right.
struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    let authService: AuthService
    @AppStorage("imageAIEnabled") private var imageAIEnabled = false

    @State private var pricingEngine: PricingEngine?
    @State private var syncService: SyncService?
    @State private var currentSuggestion: PriceSuggestion?
    @State private var isCalculating = false
    @State private var suggestionTask: Task<Void, Never>?

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            // Left: Item capture form
            ItemCaptureFormView { brand, categoryId, description, color, size in
                computeSuggestion(
                    brand: brand,
                    categoryId: categoryId,
                    description: description,
                    color: color,
                    size: size
                )
            }
            .frame(minWidth: 500)

            Divider()

            // Right: Camera viewfinder + Price suggestion + sync status
            VStack(alignment: .leading, spacing: 16) {
                CameraView(enabled: imageAIEnabled)

                Spacer()
                    .frame(height: 100)

                PriceSuggestionPanelView(
                    suggestion: currentSuggestion,
                    isLoading: isCalculating,
                    onUseSuggestion: { _ in
                        // TODO: Wire to form's useSuggestion
                    }
                )

                Spacer(minLength: 0)

                syncStatusView
            }
            .padding()
            .frame(width: 280)
        }
        .background(AppTheme.warmBackground)
        .toolbarBackground(AppTheme.lightSage, for: .windowToolbar)
        .navigationTitle("Thymos Ticket")
        .toolbar {
            ToolbarItem(placement: .automatic) {
                if case .authenticated(let username) = authService.state {
                    Text(username)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .padding(.leading, 8)
                }
            }
            ToolbarItem(placement: .automatic) {
                Button(action: { authService.signOut() }) {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                }
                .help("Sign out")
            }
        }
        .onAppear {
            setupServices()
        }
    }

    // MARK: - Sync Status

    private var syncStatusView: some View {
        Group {
            if let service = syncService {
                switch service.state {
                case .idle:
                    EmptyView()
                case .syncing(let progress):
                    HStack(spacing: 6) {
                        ProgressView()
                            .controlSize(.small)
                        Text(progress)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                case .completed(let date):
                    Text("Last synced: \(date.formatted(.relative(presentation: .named)))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                case .failed(let message):
                    Label(message, systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
        }
    }

    // MARK: - Logic

    private func setupServices() {
        let container = modelContext.container
        let config = loadAPIConfiguration()
        let client = APIClient(configuration: config, authService: authService)

        pricingEngine = PricingEngine(modelContainer: container)
        syncService = SyncService(apiClient: client, modelContainer: container)

        // Auto-sync on launch
        triggerSync()
    }

    private func triggerSync() {
        guard let service = syncService else { return }
        Task {
            await service.sync()
        }
    }

    private func computeSuggestion(
        brand: String,
        categoryId: String,
        description: String,
        color: String,
        size: String
    ) {
        suggestionTask?.cancel()

        guard !categoryId.isEmpty || !description.isEmpty else {
            currentSuggestion = nil
            isCalculating = false
            return
        }

        isCalculating = true

        suggestionTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }

            let result = await pricingEngine?.suggest(
                brand: brand,
                categoryId: categoryId,
                description: description,
                color: color,
                size: size
            )

            guard !Task.isCancelled else { return }

            await MainActor.run {
                currentSuggestion = result
                isCalculating = false
            }
        }
    }

    private func loadAPIConfiguration() -> APIConfiguration {
        let defaults = UserDefaults.standard
        let baseURL = defaults.string(forKey: "apiBaseURL") ?? APIConfiguration.default.baseURL

        return APIConfiguration(baseURL: baseURL, authToken: "")
    }
}
