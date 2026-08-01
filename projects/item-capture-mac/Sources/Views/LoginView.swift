import SwiftUI

/// Simple login screen with username/password fields.
/// No signup or password reset — just authentication.
struct LoginView: View {
    let authService: AuthService

    @State private var username = ""
    @State private var password = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            // Logo / App title
            VStack(spacing: 8) {
                Image(systemName: "tag.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(AppTheme.primary)
                Text("Thymos Ticket")
                    .font(.title.bold())
                    .foregroundStyle(AppTheme.darkAccent)
                Text("Sign in to continue")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            // Form
            VStack(spacing: 12) {
                TextField("", text: $username, prompt: Text("Username").foregroundStyle(.tertiary))
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.username)
                    .accessibilityLabel("Username")

                SecureField("", text: $password, prompt: Text("Password").foregroundStyle(.tertiary))
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.password)
                    .accessibilityLabel("Password")
                    .onSubmit { signIn() }
            }
            .frame(maxWidth: 280)

            // Error message
            if let error = errorMessage {
                Text(error)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 280)
            }

            // Sign in button
            Button(action: signIn) {
                if authService.isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .frame(width: 80)
                } else {
                    Text("Sign In")
                        .frame(width: 80)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(AppTheme.buttonPrimary)
            .controlSize(.large)
            .disabled(username.isEmpty || password.isEmpty || authService.isLoading)
            .keyboardShortcut(.return, modifiers: [])

            // Settings link
            Button(action: { openSettings() }) {
                Text("Settings")
                    .font(.callout)
            }
            .buttonStyle(.link)
        }
        .padding(40)
        .frame(width: 400, height: 380)
    }

    private func signIn() {
        guard !username.isEmpty, !password.isEmpty else { return }
        errorMessage = nil

        Task {
            do {
                try await authService.signIn(username: username, password: password)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func openSettings() {
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
    }
}
