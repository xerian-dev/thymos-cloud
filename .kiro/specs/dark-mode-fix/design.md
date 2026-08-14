# Dark Mode Fix Bugfix Design

## Overview

The ThymosTicket macOS app uses hardcoded RGB color literals in `AppTheme.swift` that do not adapt to the system color scheme. When macOS is in dark mode, backgrounds remain light and dark-colored text loses contrast, creating a jarring mismatch. The fix replaces hardcoded `Color(red:green:blue:)` with `Color(light:dark:)` initializers for the four affected properties, making them adaptive while preserving the exact light-mode appearance and brand identity.

## Glossary

- **Bug_Condition (C)**: The system is in dark mode and the app renders colors from `warmBackground`, `lightSage`, `darkAccent`, or `priceText` — all of which remain fixed light-mode values regardless of appearance
- **Property (P)**: When the system is in dark mode, these four color properties SHALL return teal-tinted dark variants that maintain brand identity and WCAG AA contrast ratios
- **Preservation**: When the system is in light mode, all colors SHALL render identically to their current hardcoded values; colors not in the affected set (`primary`, `softTeal`, `captureButton`, `confidenceHigh/Medium/Low`) SHALL remain unchanged in both modes
- **AppTheme**: The enum in `Sources/Theme/AppTheme.swift` that defines all static color properties used across the app's views
- **Color(light:dark:)**: A SwiftUI initializer available on macOS 14+ that returns different color values based on the system appearance without requiring an Asset Catalog

## Bug Details

### Bug Condition

The bug manifests when macOS is set to dark mode and the app renders any view that references `AppTheme.warmBackground`, `AppTheme.lightSage`, `AppTheme.darkAccent`, or `AppTheme.priceText`. These properties return fixed RGB values designed for light backgrounds, causing bright surfaces and unreadable text in dark mode.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type (systemAppearance: Appearance, colorProperty: AppThemeProperty)
  OUTPUT: boolean

  RETURN input.systemAppearance == .dark
         AND input.colorProperty IN [warmBackground, lightSage, darkAccent, priceText]
         AND colorProperty.resolvedValue == lightModeHardcodedValue
END FUNCTION
```

### Examples

- **warmBackground in dark mode**: Expected dark surface (~#1A1D1C), actual bright near-white (#F9FAFB) — window glares against dark system chrome
- **lightSage in dark mode**: Expected dark teal surface (~#1E2E2A), actual pale green (#E8F4F0) — price suggestion panel and camera placeholder appear blindingly light
- **darkAccent in dark mode**: Expected light sage-green (~#A8D4C8) for readable headings, actual dark green (#1B4B43) — text nearly invisible against dark backgrounds
- **priceText in dark mode**: Same as darkAccent — price values unreadable on dark panel backgrounds
- **primary in dark mode**: Expected unchanged (#2D8B7A) — teal works well on both light and dark surfaces (NOT a bug condition)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- All colors in light mode must render exactly as currently defined (warmBackground #F9FAFB, lightSage #E8F4F0, darkAccent #1B4B43)
- `primary` (#2D8B7A), `softTeal` (#4AADA0), `buttonPrimary`, `captureButton` must remain the same single value in both modes
- Confidence badge colors (`confidenceHigh`, `confidenceMedium`, `confidenceLow`) must remain unchanged — they use opacity-based backgrounds that adapt naturally
- View files (`ContentView.swift`, `CameraView.swift`, `PriceSuggestionPanelView.swift`) must not require any modifications
- The overall teal/sage brand identity must be preserved in both modes

**Scope:**
All inputs where the system is in light mode, or where the color property is not in the affected set (`warmBackground`, `lightSage`, `darkAccent`, `priceText`), should be completely unaffected by this fix. This includes:
- Any view rendering in light mode
- Button tints using `primary` or `captureButton`
- Secondary accent elements using `softTeal`
- Confidence badge background/foreground colors

## Hypothesized Root Cause

Based on the bug description, the root cause is straightforward:

1. **Hardcoded RGB Literals**: All color definitions in `AppTheme.swift` use `Color(red:green:blue:)` which produces a fixed color value that does not respond to system appearance changes. SwiftUI has no mechanism to make these adaptive after construction.

2. **No Adaptive Color Mechanism**: The project does not use an Asset Catalog with dark mode variants, nor does it use `Color(light:dark:)` (available since macOS 14/iOS 17), nor does it use `@Environment(\.colorScheme)` to switch colors programmatically.

3. **Design-Time Assumption**: The color palette was designed exclusively for light mode — the chosen values (near-white backgrounds, dark green text) only make sense against a light environment.

## Correctness Properties

Property 1: Bug Condition - Adaptive Colors in Dark Mode

_For any_ rendering context where the system appearance is dark AND the color property is one of `warmBackground`, `lightSage`, `darkAccent`, or `priceText`, the fixed `AppTheme` SHALL return a teal-tinted dark variant that maintains WCAG AA contrast (≥4.5:1 for text) against its expected background and harmonizes with macOS dark chrome.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

Property 2: Preservation - Light Mode and Unaffected Colors

_For any_ rendering context where the system appearance is light, OR the color property is not in the affected set (`primary`, `softTeal`, `buttonPrimary`, `captureButton`, `confidenceHigh`, `confidenceMedium`, `confidenceLow`), the fixed `AppTheme` SHALL produce exactly the same resolved color value as the original code, preserving the existing light-mode appearance and brand identity.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct (hardcoded RGB values that don't adapt):

**File**: `Sources/Theme/AppTheme.swift`

**Scope**: Replace four static color properties with adaptive variants using `Color(light:dark:)`

**Specific Changes**:

1. **`warmBackground`**: Replace fixed `Color(red: 0.976, green: 0.980, blue: 0.984)` with:
   ```swift
   static let warmBackground = Color(
       light: Color(red: 0.976, green: 0.980, blue: 0.984),  // #F9FAFB
       dark: Color(red: 0.102, green: 0.114, blue: 0.110)    // ~#1A1D1C
   )
   ```

2. **`lightSage`**: Replace fixed `Color(red: 0.910, green: 0.957, blue: 0.941)` with:
   ```swift
   static let lightSage = Color(
       light: Color(red: 0.910, green: 0.957, blue: 0.941),  // #E8F4F0
       dark: Color(red: 0.118, green: 0.180, blue: 0.165)    // ~#1E2E2A
   )
   ```

3. **`darkAccent`**: Replace fixed `Color(red: 0.106, green: 0.294, blue: 0.263)` with:
   ```swift
   static let darkAccent = Color(
       light: Color(red: 0.106, green: 0.294, blue: 0.263),  // #1B4B43
       dark: Color(red: 0.659, green: 0.831, blue: 0.784)    // ~#A8D4C8
   )
   ```

4. **`priceText`**: Update the semantic alias to reference the now-adaptive `darkAccent`:
   ```swift
   static let priceText = darkAccent  // Already references darkAccent, inherits adaptivity
   ```
   (No change needed if `priceText` already equals `darkAccent` — verify it does.)

5. **No changes to other properties**: `primary`, `softTeal`, `buttonPrimary`, `captureButton`, `confidenceHigh`, `confidenceMedium`, `confidenceLow` remain as single fixed values — they work well on both light and dark surfaces.

6. **No changes to view files**: `ContentView.swift`, `CameraView.swift`, `PriceSuggestionPanelView.swift` already reference `AppTheme` properties. Making the theme colors adaptive propagates the fix automatically.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that `AppTheme` properties resolve to the same RGB values regardless of system appearance.

**Test Plan**: Write unit tests that resolve `AppTheme` color properties in a simulated dark-mode environment and assert they return dark-appropriate values. Run these on the UNFIXED code to observe failures.

**Test Cases**:
1. **warmBackground Dark Resolution**: Resolve `AppTheme.warmBackground` in dark appearance — assert luminance < 0.2 (will fail on unfixed code, returns ~0.98)
2. **lightSage Dark Resolution**: Resolve `AppTheme.lightSage` in dark appearance — assert luminance < 0.25 (will fail, returns ~0.94)
3. **darkAccent Dark Contrast**: Resolve `AppTheme.darkAccent` against a dark background (#1E2E2A) — assert contrast ratio ≥ 4.5:1 (will fail, dark-on-dark gives ~1.5:1)
4. **priceText Dark Contrast**: Same as darkAccent test (will fail on unfixed code)

**Expected Counterexamples**:
- All four colors resolve to their light-mode values regardless of appearance environment
- Contrast ratios for text colors against dark backgrounds fall below WCAG AA thresholds

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL (appearance, property) WHERE isBugCondition(appearance, property) DO
  resolvedColor := AppTheme.property.resolve(in: darkAppearance)
  IF property IN [warmBackground, lightSage] THEN
    ASSERT luminance(resolvedColor) < 0.25  // dark surface
    ASSERT resolvedColor has green/teal tint  // brand identity
  ELSE IF property IN [darkAccent, priceText] THEN
    background := AppTheme.lightSage.resolve(in: darkAppearance)
    ASSERT contrastRatio(resolvedColor, background) >= 4.5  // WCAG AA
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL (appearance, property) WHERE NOT isBugCondition(appearance, property) DO
  ASSERT AppTheme_original.property.resolve(in: appearance)
       == AppTheme_fixed.property.resolve(in: appearance)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It can generate many (appearance, property) combinations automatically
- It catches unintentional changes to colors that should remain fixed
- It provides strong guarantees that light-mode appearance is pixel-identical

**Test Plan**: Capture the exact resolved RGBA values of all AppTheme properties in light mode on UNFIXED code. After applying the fix, assert all properties resolve to identical values in light mode.

**Test Cases**:
1. **Light Mode Color Preservation**: Verify all 11 AppTheme colors resolve to identical RGBA values in light appearance before and after fix
2. **Unchanged Property Preservation**: Verify `primary`, `softTeal`, `captureButton`, `confidenceHigh/Medium/Low` resolve identically in BOTH light and dark appearance (they should be single fixed values)
3. **View Rendering Preservation**: Verify that ContentView snapshot in light mode is pixel-identical before and after fix

### Unit Tests

- Test each adaptive color resolves to expected light-mode RGB in light appearance
- Test each adaptive color resolves to expected dark-mode RGB in dark appearance
- Test contrast ratios between text colors and their expected background colors in dark mode
- Test that unchanged colors (`primary`, `softTeal`, etc.) return identical values in both modes

### Property-Based Tests

- Generate random appearance contexts (light/dark) and verify all AppTheme properties resolve to values within expected luminance ranges for that mode
- Generate all (appearance, property) pairs and verify preservation: unchanged properties always return same value, adaptive properties return mode-appropriate value
- Generate random background/foreground pairings from theme and verify minimum contrast ratios

### Integration Tests

- Render `PriceSuggestionPanelView` in dark mode and verify heading text is visible (contrast check)
- Render `ContentView` in dark mode and verify no element has luminance > 0.3 on background surfaces
- Render `CameraView` placeholder in dark mode and verify the placeholder background is dark-tinted
- Toggle appearance at runtime and verify colors update immediately (SwiftUI reactivity)
