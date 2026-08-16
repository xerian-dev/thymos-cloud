# Bugfix Requirements Document

## Introduction

The ThymosTicket macOS app has broken dark mode support. The `AppTheme` enum in `Sources/Theme/AppTheme.swift` defines all colors as hardcoded `Color(red:green:blue:)` literals that do not adapt to the system color scheme. When macOS is in dark mode, backgrounds remain light-colored (near-white and pale green), text with dark accent colors loses contrast, and the app appears to ignore system appearance entirely. This creates a jarring visual mismatch and potential accessibility issues.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the system is in dark mode THEN the main window background (`warmBackground` = #F9FAFB near-white) remains light, creating a bright mismatch against the dark system chrome

1.2 WHEN the system is in dark mode THEN the price suggestion panel background (`lightSage` = #E8F4F0) remains pale green, looking out of place against dark surroundings

1.3 WHEN the system is in dark mode THEN the camera placeholder background (`lightSage`) remains pale green, visually inconsistent with the system appearance

1.4 WHEN the system is in dark mode THEN the "Price Suggestion" heading using `darkAccent` (#1B4B43 dark green) disappears or becomes unreadable against dark backgrounds due to insufficient contrast

1.5 WHEN the system is in dark mode THEN the toolbar background (`lightSage`) remains light, clashing with the native dark toolbar appearance

1.6 WHEN the system is in dark mode THEN the `priceText` color (`darkAccent`) becomes hard to read against dark container backgrounds

### Expected Behavior (Correct)

2.1 WHEN the system is in dark mode THEN the main window background SHALL display a dark surface color (e.g., near-black or dark grey) that harmonizes with the macOS dark chrome

2.2 WHEN the system is in dark mode THEN the price suggestion panel background SHALL display a darker teal-tinted surface that maintains brand identity while fitting the dark environment

2.3 WHEN the system is in dark mode THEN the camera placeholder background SHALL display a darker teal-tinted surface consistent with other panel backgrounds in dark mode

2.4 WHEN the system is in dark mode THEN the "Price Suggestion" heading SHALL use a lighter color variant that maintains readable contrast (minimum WCAG AA 4.5:1 ratio) against dark backgrounds

2.5 WHEN the system is in dark mode THEN the toolbar background SHALL display a dark-tinted variant that integrates with the native macOS dark toolbar appearance

2.6 WHEN the system is in dark mode THEN the `priceText` color SHALL use a lighter variant that maintains readable contrast against dark container backgrounds

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the system is in light mode THEN the system SHALL CONTINUE TO display all colors exactly as currently defined (warmBackground #F9FAFB, lightSage #E8F4F0, darkAccent #1B4B43, etc.)

3.2 WHEN the system is in either light or dark mode THEN the primary brand teal color (#2D8B7A) SHALL CONTINUE TO be used for buttons and accent elements without change

3.3 WHEN the system is in either light or dark mode THEN the softTeal color (#4AADA0) SHALL CONTINUE TO be used for secondary accent elements without change

3.4 WHEN the system is in either light or dark mode THEN the confidence badge colors (high/medium/low) SHALL CONTINUE TO function correctly since they use opacity-based backgrounds that adapt naturally

3.5 WHEN the system is in either light or dark mode THEN the capture button tint (primary teal) SHALL CONTINUE TO remain the same brand color

3.6 WHEN the system is in light mode THEN the overall teal/sage brand identity and aesthetic SHALL CONTINUE TO be preserved exactly as it currently appears
