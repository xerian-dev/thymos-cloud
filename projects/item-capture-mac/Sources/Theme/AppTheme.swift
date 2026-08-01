import SwiftUI

/// Thymos Ticket color palette — warm teal/sage tones derived from brand.
enum AppTheme {
    // Primary brand teal
    static let primary = Color(red: 0.176, green: 0.545, blue: 0.478)        // #2D8B7A
    // Dark accent for strong emphasis
    static let darkAccent = Color(red: 0.106, green: 0.294, blue: 0.263)     // #1B4B43
    // Light sage tint for subtle backgrounds
    static let lightSage = Color(red: 0.910, green: 0.957, blue: 0.941)      // #E8F4F0
    // Softer teal for secondary elements
    static let softTeal = Color(red: 0.290, green: 0.678, blue: 0.627)       // #4AADA0
    // Warm off-white
    static let warmBackground = Color(red: 0.976, green: 0.980, blue: 0.984) // #F9FAFB

    // Semantic usage
    static let buttonPrimary = primary
    static let suggestionBackground = lightSage
    static let priceText = darkAccent
    static let captureButton = primary
    static let confidenceHigh = Color(red: 0.176, green: 0.545, blue: 0.478) // same as primary
    static let confidenceMedium = Color(red: 0.780, green: 0.580, blue: 0.180) // warm amber
    static let confidenceLow = Color(red: 0.55, green: 0.55, blue: 0.55)
}
