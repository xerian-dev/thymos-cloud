import XCTest
import SwiftUI
import AppKit
@testable import ThymosTicket

/// Preservation property tests — Property 2: Light Mode and Unaffected Colors Unchanged
///
/// These tests capture the baseline RGBA values of all AppTheme colors in light mode,
/// and verify that unaffected properties resolve identically in both light and dark modes.
/// They MUST PASS on unfixed code (confirming baseline to preserve) and continue to pass
/// after the dark-mode fix is applied (confirming no regressions).
///
/// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
final class AppThemePreservationTests: XCTestCase {

    // MARK: - Helpers

    /// Resolves a SwiftUI Color to its RGBA components in the given appearance context.
    private func resolveColor(_ color: Color, in appearance: NSAppearance) -> (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) {
        let nsColor = NSColor(color)
        let previous = NSAppearance.current
        NSAppearance.current = appearance
        defer { NSAppearance.current = previous }

        guard let resolved = nsColor.usingColorSpace(.sRGB) else {
            XCTFail("Could not convert color to sRGB")
            return (0, 0, 0, 1)
        }
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        resolved.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (r, g, b, a)
    }

    /// Asserts that two RGBA tuples are equal within tolerance.
    private func assertColorsEqual(
        _ actual: (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat),
        _ expected: (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat),
        accuracy: CGFloat = 0.001,
        label: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertEqual(actual.r, expected.r, accuracy: accuracy, "\(label) red component mismatch", file: file, line: line)
        XCTAssertEqual(actual.g, expected.g, accuracy: accuracy, "\(label) green component mismatch", file: file, line: line)
        XCTAssertEqual(actual.b, expected.b, accuracy: accuracy, "\(label) blue component mismatch", file: file, line: line)
        XCTAssertEqual(actual.a, expected.a, accuracy: accuracy, "\(label) alpha component mismatch", file: file, line: line)
    }

    // MARK: - Appearance Contexts

    private var lightAppearance: NSAppearance {
        NSAppearance(named: .aqua)!
    }

    private var darkAppearance: NSAppearance {
        NSAppearance(named: .darkAqua)!
    }

    // MARK: - Recorded Baseline Values (observed from unfixed code)

    // These are the exact RGB values defined in AppTheme.swift as Color(red:green:blue:) literals.
    // Since they are fixed colors, they resolve identically in any appearance context.

    private let expectedPrimary: (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) = (0.176, 0.545, 0.478, 1.0)
    private let expectedDarkAccent: (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) = (0.106, 0.294, 0.263, 1.0)
    private let expectedLightSage: (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) = (0.910, 0.957, 0.941, 1.0)
    private let expectedSoftTeal: (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) = (0.290, 0.678, 0.627, 1.0)
    private let expectedWarmBackground: (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) = (0.976, 0.980, 0.984, 1.0)
    private let expectedConfidenceHigh: (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) = (0.176, 0.545, 0.478, 1.0)
    private let expectedConfidenceMedium: (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) = (0.780, 0.580, 0.180, 1.0)
    private let expectedConfidenceLow: (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) = (0.55, 0.55, 0.55, 1.0)

    // MARK: - Light Mode Preservation Tests (Requirement 3.1, 3.6)

    /// All AppTheme colors must resolve to their defined RGB values in light appearance.
    /// This ensures the fix does not alter any light-mode behavior.
    func testAllColorsLightModePreservation() {
        // Core palette colors
        assertColorsEqual(resolveColor(AppTheme.primary, in: lightAppearance), expectedPrimary, label: "primary (light)")
        assertColorsEqual(resolveColor(AppTheme.darkAccent, in: lightAppearance), expectedDarkAccent, label: "darkAccent (light)")
        assertColorsEqual(resolveColor(AppTheme.lightSage, in: lightAppearance), expectedLightSage, label: "lightSage (light)")
        assertColorsEqual(resolveColor(AppTheme.softTeal, in: lightAppearance), expectedSoftTeal, label: "softTeal (light)")
        assertColorsEqual(resolveColor(AppTheme.warmBackground, in: lightAppearance), expectedWarmBackground, label: "warmBackground (light)")

        // Semantic aliases
        assertColorsEqual(resolveColor(AppTheme.buttonPrimary, in: lightAppearance), expectedPrimary, label: "buttonPrimary (light)")
        assertColorsEqual(resolveColor(AppTheme.suggestionBackground, in: lightAppearance), expectedLightSage, label: "suggestionBackground (light)")
        assertColorsEqual(resolveColor(AppTheme.priceText, in: lightAppearance), expectedDarkAccent, label: "priceText (light)")
        assertColorsEqual(resolveColor(AppTheme.captureButton, in: lightAppearance), expectedPrimary, label: "captureButton (light)")

        // Confidence colors
        assertColorsEqual(resolveColor(AppTheme.confidenceHigh, in: lightAppearance), expectedConfidenceHigh, label: "confidenceHigh (light)")
        assertColorsEqual(resolveColor(AppTheme.confidenceMedium, in: lightAppearance), expectedConfidenceMedium, label: "confidenceMedium (light)")
        assertColorsEqual(resolveColor(AppTheme.confidenceLow, in: lightAppearance), expectedConfidenceLow, label: "confidenceLow (light)")
    }

    // MARK: - Unaffected Properties: Identical in Both Modes (Requirements 3.2, 3.3, 3.4, 3.5)

    /// primary must resolve identically in light and dark modes (single fixed value).
    /// Validates: Requirement 3.2
    func testPrimaryIdenticalInBothModes() {
        let light = resolveColor(AppTheme.primary, in: lightAppearance)
        let dark = resolveColor(AppTheme.primary, in: darkAppearance)
        assertColorsEqual(dark, light, label: "primary should be identical in light and dark")
    }

    /// softTeal must resolve identically in light and dark modes (single fixed value).
    /// Validates: Requirement 3.3
    func testSoftTealIdenticalInBothModes() {
        let light = resolveColor(AppTheme.softTeal, in: lightAppearance)
        let dark = resolveColor(AppTheme.softTeal, in: darkAppearance)
        assertColorsEqual(dark, light, label: "softTeal should be identical in light and dark")
    }

    /// buttonPrimary must resolve identically in light and dark modes (alias for primary).
    /// Validates: Requirement 3.2
    func testButtonPrimaryIdenticalInBothModes() {
        let light = resolveColor(AppTheme.buttonPrimary, in: lightAppearance)
        let dark = resolveColor(AppTheme.buttonPrimary, in: darkAppearance)
        assertColorsEqual(dark, light, label: "buttonPrimary should be identical in light and dark")
    }

    /// captureButton must resolve identically in light and dark modes (alias for primary).
    /// Validates: Requirement 3.5
    func testCaptureButtonIdenticalInBothModes() {
        let light = resolveColor(AppTheme.captureButton, in: lightAppearance)
        let dark = resolveColor(AppTheme.captureButton, in: darkAppearance)
        assertColorsEqual(dark, light, label: "captureButton should be identical in light and dark")
    }

    /// confidenceHigh must resolve identically in light and dark modes (fixed color).
    /// Validates: Requirement 3.4
    func testConfidenceHighIdenticalInBothModes() {
        let light = resolveColor(AppTheme.confidenceHigh, in: lightAppearance)
        let dark = resolveColor(AppTheme.confidenceHigh, in: darkAppearance)
        assertColorsEqual(dark, light, label: "confidenceHigh should be identical in light and dark")
    }

    /// confidenceMedium must resolve identically in light and dark modes (fixed color).
    /// Validates: Requirement 3.4
    func testConfidenceMediumIdenticalInBothModes() {
        let light = resolveColor(AppTheme.confidenceMedium, in: lightAppearance)
        let dark = resolveColor(AppTheme.confidenceMedium, in: darkAppearance)
        assertColorsEqual(dark, light, label: "confidenceMedium should be identical in light and dark")
    }

    /// confidenceLow must resolve identically in light and dark modes (fixed color).
    /// Validates: Requirement 3.4
    func testConfidenceLowIdenticalInBothModes() {
        let light = resolveColor(AppTheme.confidenceLow, in: lightAppearance)
        let dark = resolveColor(AppTheme.confidenceLow, in: darkAppearance)
        assertColorsEqual(dark, light, label: "confidenceLow should be identical in light and dark")
    }
}
