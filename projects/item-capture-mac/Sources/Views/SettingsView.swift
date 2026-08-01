import SwiftUI

/// Settings view accessible via Cmd+,
/// Configures Cognito connection, printer, and Image AI.
struct SettingsView: View {
    // Cognito
    @AppStorage("cognitoUserPoolId") private var userPoolId = ""
    @AppStorage("cognitoClientId") private var clientId = ""
    @AppStorage("cognitoRegion") private var region = "eu-central-1"

    // API
    @AppStorage("apiBaseURL") private var baseURL = APIConfiguration.default.baseURL

    // Printer
    @AppStorage("selectedPrinter") private var selectedPrinter = ""

    // Image AI
    @AppStorage("imageAIEnabled") private var imageAIEnabled = false

    @State private var availablePrinters: [String] = []

    var body: some View {
        TabView {
            connectionTab
                .tabItem { Label("Connection", systemImage: "network") }

            printerTab
                .tabItem { Label("Printer", systemImage: "printer") }

            aiTab
                .tabItem { Label("AI", systemImage: "sparkles") }
        }
        .frame(width: 450, height: 280)
        .onAppear {
            loadPrinters()
        }
    }

    // MARK: - Connection Tab

    private var connectionTab: some View {
        Form {
            Section("AWS Cognito") {
                LabeledContent("User Pool ID") {
                    TextField("", text: $userPoolId, prompt: Text("eu-central-1_xxxxxx").foregroundStyle(.tertiary))
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 260)
                }

                LabeledContent("Client ID") {
                    TextField("", text: $clientId, prompt: Text("App client ID").foregroundStyle(.tertiary))
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 260)
                }

                LabeledContent("Region") {
                    TextField("", text: $region, prompt: Text("eu-central-1").foregroundStyle(.tertiary))
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 260)
                }
            }

            Section("API") {
                LabeledContent("Base URL") {
                    TextField("", text: $baseURL, prompt: Text("https://...").foregroundStyle(.tertiary))
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 260)
                }
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Printer Tab

    private var printerTab: some View {
        Form {
            Section("Label Printer") {
                Picker("Printer", selection: $selectedPrinter) {
                    Text("None").tag("")
                    ForEach(availablePrinters, id: \.self) { printer in
                        Text(printer).tag(printer)
                    }
                }

                Button("Refresh Printers") {
                    loadPrinters()
                }
            }

            Section {
                Text("The selected printer will be used when \"Print On Save\" is enabled.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - AI Tab

    private var aiTab: some View {
        Form {
            Section("Image AI") {
                Toggle("Enable Image AI", isOn: $imageAIEnabled)

                Text("When enabled, captured photos will be analyzed to auto-fill form fields like brand, color, and description.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            if imageAIEnabled {
                Section {
                    Label("Image AI is not yet available in this version.", systemImage: "info.circle")
                        .font(.callout)
                        .foregroundStyle(.orange)
                }
            }
        }
        .formStyle(.grouped)
    }

    // MARK: - Helpers

    private func loadPrinters() {
        // Query available printers from the system
        let printerNames = NSPrinter.printerNames
        availablePrinters = printerNames
    }
}
