import SwiftUI

/// Settings view for configuring API connection.
/// Accessible via Cmd+, (standard macOS settings shortcut).
struct SettingsView: View {
    @AppStorage("apiBaseURL") private var baseURL = APIConfiguration.default.baseURL
    @AppStorage("apiAuthToken") private var authToken = ""

    var body: some View {
        Form {
            Section("API Connection") {
                LabeledContent("Base URL") {
                    TextField("https://...", text: $baseURL)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 400)
                        .accessibilityLabel("API base URL")
                }

                LabeledContent("Auth Token") {
                    SecureField("Bearer token", text: $authToken)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 400)
                        .accessibilityLabel("API authentication token")
                }
            }

            Section {
                Text("After updating settings, use Cmd+Shift+R to re-sync pricing data.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 500, height: 200)
        .navigationTitle("Settings")
    }
}
