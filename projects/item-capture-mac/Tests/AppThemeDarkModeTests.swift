import XCTest
import SwiftUI
import AppKit
@testable import ThymosTicket

/// Bug condition exploration tests — Property 1: Hardcoded Colors Do Not Adapt in Dark Mode
///
/// These tests assert the EXPECTED (correct) dark-mode behavior. They are designed to FAIL
/// on unfixed code, confirming the bug exists. Once the fix is applied (adaptive Color(light:dark:)),
/// these tests will PASS.
///
/// **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**
final class AppThemeDarkModeTests: XCTestCase {

    // MARK: - Helpers

    /// Resolves a SwiftUI Color to its RGBA components in the given appearance context.
    private func resolveColor(_ color: Color, in appearance: NSAppearance) -> (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) {
        let nsColor = NSColor(color)
        // Set the current appearance so color resolution uses the correct context
        let previous = NSAppearance.current
        NSAppearance.current = appearance
        defer { NSAppearance.current = previous }

        // Resolve in sRGB color space
        guard let resolved = nsColor.usingColorSpace(.sRGB) else {
            XCTFail("Could not convert color to sRGB")
            return (0, 0, 0, 1)
        }
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        resolved.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (r, g, b, a)
    }

    /// Calculates relative luminance per WCAG 2.1 definition.
    /// L = 0.2126 * R + 0.7152 * G + 0.0722 * B (where R, G, B are linearized)
    private func relativeLuminance(r: CGFloat, g: CGFloat, b: CGFloat) -> CGFloat {
        func linearize(_ c: CGFloat) -> CGFloat {
            c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
    }

    /// Calculates WCAG contrast ratio between two luminance values.
    /// Contrast ratio = (L1 + 0.05) / (L2 + 0.05) where L1 >= L2
    private func contrastRatio(luminance1: CGFloat, luminance2: CGFloat) -> CGFloat {
        let lighter = max(luminance1, luminance2)
        let darker = min(luminance1, luminance2)
        return (lighter + 0.05) / (darker + 0.05)
    }

    // MARK: - Dark Mode Context

    private var darkAppearance: NSAppearance {
        NSAppearance(named: .darkAqua)!
    }

    // MARK: - Bug Condition Tests

    /// Test: warmBackground resolved in dark mode should have low luminance (dark surface).
    /// Bug: warmBackground is hardcoded to #F9FAFB (luminance ~0.95) — remains bright in dark mode.
    /// Expected after fix: luminance < 0.25 (a dark surface color ~#1A1D1C)
    func testWarmBackgroundDarkModeLuminance() {
        let components = resolveColor(AppTheme.warmBackground, in: darkAppearance)
        let luminance = relativeLuminance(r: components.r, g: components.g, b: components.b)

        XCTAssertLessThan(
            luminance, 0.25,
            "warmBackground in dark mode should have luminance < 0.25 (dark surface), "
            + "but got \(luminance) with RGB(\(components.r), \(components.g), \(components.b)). "
            + "This confirms the bug: color does not adapt to dark mode."
        )
    }

    /// Test: lightSage resolved in dark mode should have low luminance (dark teal-tinted surface).
    /// Bug: lightSage is hardcoded to #E8F4F0 (luminance ~0.88) — remains pale green in dark mode.
    /// Expected after fix: luminance < 0.25 (a dark teal surface ~#1E2E2A)
    func testLightSageDarkModeLuminance() {
        let components = resolveColor(AppTheme.lightSage, in: darkAppearance)
        let luminance = relativeLuminance(r: components.r, g: components.g, b: components.b)

        XCTAssertLessThan(
            luminance, 0.25,
            "lightSage in dark mode should have luminance < 0.25 (dark teal surface), "
            + "but got \(luminance) with RGB(\(components.r), \(components.g), \(components.b)). "
            + "This confirms the bug: color does not adapt to dark mode."
        )
    }

    /// Test: darkAccent resolved in dark mode should have sufficient contrast against dark background.
    /// Bug: darkAccent is hardcoded to #1B4B43 (dark green) — when used as text on a dark background
    /// (~#1E2E2A), contrast is only ~1.5:1, far below WCAG AA minimum of 4.5:1.
    /// Expected after fix: a lighter sage-green (~#A8D4C8) giving ≥ 4.5:1 contrast.
    func testDarkAccentDarkModeContrast() {
        let textComponents = resolveColor(AppTheme.darkAccent, in: darkAppearance)
        let textLuminance = relativeLuminance(r: textComponents.r, g: textComponents.g, b: textComponents.b)

        // Dark background is the expected dark-mode lightSage: ~#1E2E2A
        let bgLuminance = relativeLuminance(r: 0.118, g: 0.180, b: 0.165)

        let ratio = contrastRatio(luminance1: textLuminance, luminance2: bgLuminance)

        XCTAssertGreaterThanOrEqual(
            ratio, 4.5,
            "darkAccent in dark mode should have contrast ratio ≥ 4.5:1 against dark background, "
            + "but got \(ratio):1 with text RGB(\(textComponents.r), \(textComponents.g), \(textComponents.b)). "
            + "This confirms the bug: dark text on dark background is unreadable."
        )
    }

    /// Test: priceText resolved in dark mode should have sufficient contrast against dark background.
    /// Bug: priceText references darkAccent (#1B4B43) — same dark-on-dark contrast issue.
    /// Expected after fix: inherits adaptive darkAccent, giving ≥ 4.5:1 contrast.
    func testPriceTextDarkModeContrast() {
        let textComponents = resolveColor(AppTheme.priceText, in: darkAppearance)
        let textLuminance = relativeLuminance(r: textComponents.r, g: textComponents.g, b: textComponents.b)

        // Dark background is the expected dark-mode lightSage: ~#1E2E2A
        let bgLuminance = relativeLuminance(r: 0.118, g: 0.180, b: 0.165)

        let ratio = contrastRatio(luminance1: textLuminance, luminance2: bgLuminance)

        XCTAssertGreaterThanOrEqual(
            ratio, 4.5,
            "priceText in dark mode should have contrast ratio ≥ 4.5:1 against dark background, "
            + "but got \(ratio):1 with text RGB(\(textComponents.r), \(textComponents.g), \(textComponents.b)). "
            + "This confirms the bug: price text on dark background is unreadable."
        )
    }
}
