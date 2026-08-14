import Foundation

/// Errors that can occur during API communication.
enum APIError: Error, LocalizedError {
    case invalidURL
    case unauthorized
    case serverError(statusCode: Int)
    case networkError(underlying: Error)
    case decodingError(underlying: Error)
    case timeout

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid API URL configuration."
        case .unauthorized:
            return "Authentication failed. Please check your API token."
        case .serverError(let code):
            return "Server returned an error (HTTP \(code))."
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .decodingError(let error):
            return "Failed to parse server response: \(error.localizedDescription)"
        case .timeout:
            return "Request timed out."
        }
    }
}

/// Configuration for the API client, loaded from the app's settings.
struct APIConfiguration: Sendable {
    var baseURL: String
    var authToken: String

    static let `default` = APIConfiguration(
        baseURL: "https://7ne4yil3k7.execute-api.eu-central-1.amazonaws.com",
        authToken: ""
    )
}

/// HTTP client for communicating with the shop API.
/// Handles authentication, pagination, and error mapping.
actor APIClient {
    private let configuration: APIConfiguration
    private let authService: AuthService?
    private let session: URLSession
    private let decoder: JSONDecoder

    init(configuration: APIConfiguration, authService: AuthService? = nil) {
        self.configuration = configuration
        self.authService = authService

        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = 30
        sessionConfig.timeoutIntervalForResource = 120
        self.session = URLSession(configuration: sessionConfig)

        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601
    }

    // MARK: - Categories

    func fetchCategories() async throws -> [CategoryDTO] {
        let data = try await request(path: "/categories")
        let response = try decode(CategoriesResponse.self, from: data)
        return response.categories
    }

    // MARK: - Canonical Values

    func fetchCanonicalBrands() async throws -> [String] {
        let data = try await request(path: "/pricing/canonical/brands")
        let response = try decode(BrandsResponse.self, from: data)
        return response.brands
    }

    func fetchCanonicalColors() async throws -> [String] {
        let data = try await request(path: "/pricing/canonical/colors")
        let response = try decode(ColorsResponse.self, from: data)
        return response.colors
    }

    func fetchCanonicalDescriptions() async throws -> [String] {
        let data = try await request(path: "/pricing/canonical/descriptions")
        let response = try decode(DescriptionsResponse.self, from: data)
        return response.descriptions
    }

    func fetchCanonicalPatterns() async throws -> [String] {
        let data = try await request(path: "/pricing/canonical/patterns")
        let response = try decode(PatternsResponse.self, from: data)
        return response.patterns
    }

    // MARK: - Item Creation

    /// Creates a new item by POSTing the given payload dictionary to the /items endpoint.
    /// The caller is responsible for constructing the payload with the correct fields.
    func createItem(payload: [String: Any]) async throws {
        try await postRequest(path: "/items", body: payload)
    }

    // MARK: - Pricing Data

    func fetchPricingData(cursor: String? = nil, limit: Int = 100) async throws -> PricingPageResponse {
        var queryItems: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: String(limit))
        ]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        let data = try await request(path: "/pricing/records", queryItems: queryItems)
        return try decode(PricingPageResponse.self, from: data)
    }

    // MARK: - Private Helpers

    private func postRequest(path: String, body: [String: Any]) async throws {
        guard let components = URLComponents(string: configuration.baseURL + path) else {
            throw APIError.invalidURL
        }

        guard let url = components.url else {
            throw APIError.invalidURL
        }

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"

        let token: String
        if let authService {
            token = (try? await authService.getAccessToken()) ?? configuration.authToken
        } else {
            token = configuration.authToken
        }
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        urlRequest.httpBody = try JSONSerialization.data(withJSONObject: body)

        do {
            let (_, response) = try await session.data(for: urlRequest)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.serverError(statusCode: 0)
            }

            switch httpResponse.statusCode {
            case 200...299:
                return
            case 401:
                throw APIError.unauthorized
            default:
                throw APIError.serverError(statusCode: httpResponse.statusCode)
            }
        } catch let error as APIError {
            throw error
        } catch let error as URLError where error.code == .timedOut {
            throw APIError.timeout
        } catch {
            throw APIError.networkError(underlying: error)
        }
    }

    private func request(path: String, queryItems: [URLQueryItem] = []) async throws -> Data {
        guard var components = URLComponents(string: configuration.baseURL + path) else {
            throw APIError.invalidURL
        }

        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        guard let url = components.url else {
            throw APIError.invalidURL
        }

        var urlRequest = URLRequest(url: url)
        // Get token from AuthService if available, otherwise fall back to config
        let token: String
        if let authService {
            token = (try? await authService.getAccessToken()) ?? configuration.authToken
        } else {
            token = configuration.authToken
        }
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")

        do {
            let (data, response) = try await session.data(for: urlRequest)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.serverError(statusCode: 0)
            }

            switch httpResponse.statusCode {
            case 200...299:
                return data
            case 401:
                throw APIError.unauthorized
            default:
                throw APIError.serverError(statusCode: httpResponse.statusCode)
            }
        } catch let error as APIError {
            throw error
        } catch let error as URLError where error.code == .timedOut {
            throw APIError.timeout
        } catch {
            throw APIError.networkError(underlying: error)
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try decoder.decode(type, from: data)
        } catch {
            throw APIError.decodingError(underlying: error)
        }
    }
}

// MARK: - Response DTOs

struct CategoriesResponse: Decodable {
    let categories: [CategoryDTO]
}

struct CategoryDTO: Decodable {
    let id: String
    let name: String
}

struct BrandsResponse: Decodable {
    let brands: [String]
}

struct ColorsResponse: Decodable {
    let colors: [String]
}

struct DescriptionsResponse: Decodable {
    let descriptions: [String]
}

struct PatternsResponse: Decodable {
    let patterns: [String]
}

struct PricingPageResponse: Decodable {
    let records: [PricingRecordDTO]
    let nextCursor: String?
    let hasMore: Bool
}

struct PricingRecordDTO: Decodable {
    let id: String
    let brand: String
    let categoryId: String
    let categoryName: String
    let description: String
    let color: String
    let pattern: String
    let size: String
    let tagPrice: Double
    let soldPrice: Double?
    let daysOnShelf: Int?
    let soldAt: Date?
    let createdAt: Date

    private enum CodingKeys: String, CodingKey {
        case id, brand, categoryId, categoryName, description, color, pattern
        case size, tagPrice, soldPrice, daysOnShelf, soldAt, createdAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        brand = try container.decode(String.self, forKey: .brand)
        categoryId = try container.decode(String.self, forKey: .categoryId)
        categoryName = try container.decode(String.self, forKey: .categoryName)
        description = try container.decode(String.self, forKey: .description)
        color = try container.decode(String.self, forKey: .color)
        pattern = try container.decodeIfPresent(String.self, forKey: .pattern) ?? ""
        size = try container.decode(String.self, forKey: .size)
        tagPrice = try container.decode(Double.self, forKey: .tagPrice)
        soldPrice = try container.decodeIfPresent(Double.self, forKey: .soldPrice)
        daysOnShelf = try container.decodeIfPresent(Int.self, forKey: .daysOnShelf)
        soldAt = try container.decodeIfPresent(Date.self, forKey: .soldAt)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
    }
}
