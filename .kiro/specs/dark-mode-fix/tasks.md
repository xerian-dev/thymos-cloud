# Implementation Plan

## Overview

Fix four hardcoded color properties in `AppTheme.swift` (`warmBackground`, `lightSage`, `darkAccent`, `priceText`) that do not adapt to macOS dark mode. The fix introduces light/dark color pairs so these properties resolve to appropriate values based on system appearance, while preserving all existing light-mode behavior and leaving unaffected color properties unchanged.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Hardcoded Colors Do Not Adapt in Dark Mode
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate all four affected colors resolve to light-mode values in dark appearance
  - **Scoped PBT Approach**: Scope the property to the four concrete failing properties (`warmBackground`, `lightSage`, `darkAccent`, `priceText`) resolved in a dark appearance environment
  - Add a `Tests/` directory and test target to `Package.swift` (testTarget depending on `ThymosTicket`)
  - Create `Tests/AppThemeDarkModeTests.swift` with XCTest cases:
    - Resolve `AppTheme.warmBackground` in dark appearance context and assert luminance < 0.25 (will fail — actual ~0.98)
    - Resolve `AppTheme.lightSage` in dark appearance context and assert luminance < 0.25 (will fail — actual ~0.94)
    - Resolve `AppTheme.darkAccent` in dark appearance context and assert contrast ratio ≥ 4.5:1 against a dark background (#1E2E2A) (will fail — dark-on-dark gives ~1.5:1)
    - Resolve `AppTheme.priceText` in dark appearance context and assert same contrast requirement (will fail)
  - Use `NSAppearance(named: .darkAqua)` to simulate dark mode resolution in tests
  - Run test on UNFIXED code — expect FAILURE (this confirms the bug exists)
  - Document counterexamples: all four colors resolve to their light-mode hardcoded values regardless of appearance
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Light Mode and Unaffected Colors Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: Resolve all 11 AppTheme colors in light appearance on UNFIXED code — record exact RGBA values
  - Observe: Resolve `primary`, `softTeal`, `captureButton`, `confidenceHigh`, `confidenceMedium`, `confidenceLow` in dark appearance — record values (should be identical to light mode since they are single fixed values)
  - Write property-based tests in `Tests/AppThemePreservationTests.swift`:
    - For all AppTheme color properties resolved in light appearance: assert RGBA matches recorded baseline values (from Preservation Requirements 3.1, 3.6)
    - For unaffected properties (`primary`, `softTeal`, `buttonPrimary`, `captureButton`, `confidenceHigh`, `confidenceMedium`, `confidenceLow`) resolved in BOTH light and dark appearance: assert identical RGBA values (from Preservation Requirements 3.2, 3.3, 3.4, 3.5)
  - Verify tests PASS on UNFIXED code (confirms baseline behavior to preserve)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix for hardcoded colors not adapting to dark mode

  - [x] 3.1 Implement the fix in `AppTheme.swift`
    - Replace `warmBackground` with `Color(light:dark:)` using light value `Color(red: 0.976, green: 0.980, blue: 0.984)` and dark value `Color(red: 0.102, green: 0.114, blue: 0.110)`
    - Replace `lightSage` with `Color(light:dark:)` using light value `Color(red: 0.910, green: 0.957, blue: 0.941)` and dark value `Color(red: 0.118, green: 0.180, blue: 0.165)`
    - Replace `darkAccent` with `Color(light:dark:)` using light value `Color(red: 0.106, green: 0.294, blue: 0.263)` and dark value `Color(red: 0.659, green: 0.831, blue: 0.784)`
    - Verify `priceText = darkAccent` already references `darkAccent` — it inherits adaptivity, no change needed
    - Leave all other properties (`primary`, `softTeal`, `buttonPrimary`, `captureButton`, confidence colors) unchanged
    - No changes to view files (`ContentView.swift`, `CameraView.swift`, `PriceSuggestionPanelView.swift`)
    - _Bug_Condition: isBugCondition(input) where input.systemAppearance == .dark AND input.colorProperty IN [warmBackground, lightSage, darkAccent, priceText]_
    - _Expected_Behavior: Dark mode surfaces have luminance < 0.25; text colors maintain ≥ 4.5:1 contrast against dark backgrounds_
    - _Preservation: Light mode colors identical; unaffected properties unchanged in both modes_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Adaptive Colors in Dark Mode
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (dark luminance, contrast ratios)
    - When this test passes, it confirms all four adaptive colors resolve correctly in dark mode
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Light Mode and Unaffected Colors Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all light-mode color values and unaffected-property values remain identical

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite with `swift test` in `projects/item-capture-mac/`
  - Verify both test files pass: `AppThemeDarkModeTests` and `AppThemePreservationTests`
  - Verify the project builds cleanly with `swift build`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Dark mode color values were chosen to maintain WCAG AA contrast ratios (≥ 4.5:1 for text) against their expected background surfaces.
- `priceText` is an alias for `darkAccent` — it inherits adaptivity automatically and requires no separate change.
- Tests use `NSAppearance(named: .darkAqua)` to simulate dark mode resolution without requiring a running application.
- The observation-first methodology for preservation tests ensures we capture actual current behavior rather than assumed behavior.
