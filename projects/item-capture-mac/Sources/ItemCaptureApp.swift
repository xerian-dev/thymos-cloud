import SwiftUI
import SwiftData
import AppKit

@main
struct ItemCaptureApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    let modelContainer: ModelContainer

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
            ContentView()
                .frame(minWidth: 800, minHeight: 600)
        }
        .modelContainer(modelContainer)
        .windowStyle(.titleBar)
        .defaultSize(width: 960, height: 700)
        .commands {
            CommandGroup(after: .appInfo) {
                Button("Sync Pricing Data") {
                    NotificationCenter.default.post(name: .syncPricingData, object: nil)
                }
                .keyboardShortcut("r", modifiers: [.command, .shift])
            }
        }

        #if os(macOS)
        Settings {
            SettingsView()
        }
        #endif
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
