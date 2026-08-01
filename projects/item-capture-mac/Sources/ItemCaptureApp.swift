import SwiftUI
import SwiftData
import AppKit

@main
struct ItemCaptureApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    let modelContainer: ModelContainer
    @State private var authService = AuthService()

    init() {
        let schema = Schema([
            PricingRecord.self,
            Category.self,
            CanonicalValue.self,
        ])
        let configuration = ModelConfiguration(
            "ItemCapturePricing",
            schema: schema,
            isStoredInMemoryOnly: false
        )
        do {
            modelContainer = try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            fatalError("Failed to initialize SwiftData model container: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            AuthGateView(authService: authService)
                .frame(minWidth: 800, minHeight: 600)
                .task {
                    await authService.restoreSession()
                }
        }
        .modelContainer(modelContainer)
        .windowStyle(.titleBar)
        .defaultSize(width: 960, height: 700)

        #if os(macOS)
        Settings {
            SettingsView()
        }
        #endif
    }
}

/// Shows LoginView when unauthenticated, ContentView when authenticated.
struct AuthGateView: View {
    let authService: AuthService

    var body: some View {
        switch authService.state {
        case .unknown:
            ProgressView("Restoring session...")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .unauthenticated:
            LoginView(authService: authService)
        case .authenticated:
            ContentView(authService: authService)
        }
    }
}

extension Notification.Name {
    static let syncPricingData = Notification.Name("syncPricingData")
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApplication.shared.setActivationPolicy(.regular)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }
}
