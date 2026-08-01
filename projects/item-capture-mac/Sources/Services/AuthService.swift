import Foundation
import AWSCognitoIdentityProvider
import os

/// Manages authentication against AWS Cognito using USER_PASSWORD_AUTH flow.
/// Stores tokens securely in the macOS Keychain.
@Observable
final class AuthService {
    enum AuthState: Equatable {
        case unknown
        case authenticated(username: String)
        case unauthenticated
    }

    enum AuthError: Error, LocalizedError {
        case invalidCredentials
        case networkError(String)
        case notConfigured
        case unknownError(String)

        var errorDescription: String? {
            switch self {
            case .invalidCredentials:
                return "Incorrect username or password."
            case .networkError(let msg):
                return "Network error: \(msg)"
            case .notConfigured:
                return "Cognito is not configured. Check Settings."
            case .unknownError(let msg):
                return msg
            }
        }
    }

    private(set) var state: AuthState = .unknown
    private(set) var isLoading = false

    private let logger = Logger(subsystem: "com.thymos.item-capture", category: "AuthService")

    private var accessToken: String?
    private var refreshToken: String?
    private var idToken: String?
    private var tokenExpiration: Date?

    // MARK: - Public API

    /// Attempt to restore a previous session from Keychain on launch.
    func restoreSession() async {
        let storedRefresh = TokenStorage.read(key: "refreshToken")
        let storedUsername = TokenStorage.read(key: "username")

        guard let refresh = storedRefresh, let username = storedUsername else {
            state = .unauthenticated
            return
        }

        refreshToken = refresh

        do {
            try await refreshTokens()
            state = .authenticated(username: username)
            logger.info("Session restored for \(username)")
        } catch {
            logger.warning("Session restore failed: \(error.localizedDescription)")
            state = .unauthenticated
        }
    }

    /// Sign in with username and password.
    func signIn(username: String, password: String) async throws {
        let cognitoConfig = loadCognitoConfig()
        guard !cognitoConfig.userPoolId.isEmpty, !cognitoConfig.clientId.isEmpty else {
            throw AuthError.notConfigured
        }

        isLoading = true
        defer { isLoading = false }

        do {
            let clientConfig = try await CognitoIdentityProviderClient.CognitoIdentityProviderClientConfiguration(
                region: cognitoConfig.region
            )
            let client = CognitoIdentityProviderClient(config: clientConfig)

            let input = InitiateAuthInput(
                authFlow: .userPasswordAuth,
                authParameters: [
                    "USERNAME": username,
                    "PASSWORD": password,
                ],
                clientId: cognitoConfig.clientId
            )

            let response = try await client.initiateAuth(input: input)

            guard let result = response.authenticationResult else {
                throw AuthError.invalidCredentials
            }

            accessToken = result.accessToken
            refreshToken = result.refreshToken
            idToken = result.idToken
            tokenExpiration = Date.now.addingTimeInterval(TimeInterval(result.expiresIn))

            // Store in Keychain
            if let refresh = refreshToken {
                TokenStorage.save(key: "refreshToken", value: refresh)
            }
            TokenStorage.save(key: "username", value: username)

            state = .authenticated(username: username)
            logger.info("Signed in as \(username)")
        } catch let error as AuthError {
            throw error
        } catch {
            let message = error.localizedDescription
            if message.contains("NotAuthorizedException") || message.contains("Incorrect") {
                throw AuthError.invalidCredentials
            }
            throw AuthError.unknownError(message)
        }
    }

    /// Sign out and clear stored credentials.
    func signOut() {
        accessToken = nil
        refreshToken = nil
        idToken = nil
        tokenExpiration = nil

        TokenStorage.delete(key: "refreshToken")
        TokenStorage.delete(key: "username")

        state = .unauthenticated
        logger.info("Signed out")
    }

    /// Get a valid access token, refreshing if needed.
    func getAccessToken() async throws -> String {
        if let token = accessToken, let expiry = tokenExpiration, expiry > Date.now {
            return token
        }

        try await refreshTokens()

        guard let token = accessToken else {
            throw AuthError.invalidCredentials
        }
        return token
    }

    // MARK: - Token Refresh

    private func refreshTokens() async throws {
        let cognitoConfig = loadCognitoConfig()
        guard let refresh = refreshToken, !cognitoConfig.clientId.isEmpty else {
            throw AuthError.invalidCredentials
        }

        let clientConfig = try await CognitoIdentityProviderClient.CognitoIdentityProviderClientConfiguration(
            region: cognitoConfig.region
        )
        let client = CognitoIdentityProviderClient(config: clientConfig)

        let input = InitiateAuthInput(
            authFlow: .refreshTokenAuth,
            authParameters: [
                "REFRESH_TOKEN": refresh,
            ],
            clientId: cognitoConfig.clientId
        )

        let response = try await client.initiateAuth(input: input)

        guard let result = response.authenticationResult else {
            signOut()
            throw AuthError.invalidCredentials
        }

        accessToken = result.accessToken
        idToken = result.idToken
        tokenExpiration = Date.now.addingTimeInterval(TimeInterval(result.expiresIn))
        // Refresh token doesn't rotate by default in Cognito
    }

    // MARK: - Configuration

    private struct CognitoConfig {
        let userPoolId: String
        let clientId: String
        let region: String
    }

    private func loadCognitoConfig() -> CognitoConfig {
        let defaults = UserDefaults.standard
        return CognitoConfig(
            userPoolId: defaults.string(forKey: "cognitoUserPoolId") ?? "",
            clientId: defaults.string(forKey: "cognitoClientId") ?? "",
            region: defaults.string(forKey: "cognitoRegion") ?? "eu-central-1"
        )
    }
}

// MARK: - Token Storage (UserDefaults for POC, switch to Keychain when code-signed)

enum TokenStorage {
    private static let defaults = UserDefaults.standard
    private static let prefix = "auth."

    static func save(key: String, value: String) {
        defaults.set(value, forKey: prefix + key)
    }

    static func read(key: String) -> String? {
        defaults.string(forKey: prefix + key)
    }

    static func delete(key: String) {
        defaults.removeObject(forKey: prefix + key)
    }
}
