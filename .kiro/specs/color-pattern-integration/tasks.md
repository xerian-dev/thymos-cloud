# Implementation Plan: Color-Pattern Integration

## Overview

Integrate pattern detection into the existing color management pipeline, replacing the standalone pattern system. The work proceeds in three phases: (1) remove the standalone pattern system entirely, (2) integrate pattern detection into the color scanner and applier, (3) update the API and frontend to handle the extended mapping format.

## Tasks

- [x] 1. Remove standalone pattern system
  - [x] 1.1 Remove pattern routes from router and route source files
    - Remove `import { scanClusterPatterns, getPatternMappings, savePatternMappings, applyPatternMappings, getPatternApplyStatus }` from `projects/shop-api/src/router.ts`
    - Remove the five pattern route entries from the `routes` record in `router.ts`
    - Delete `projects/shop-api/src/routes/pattern-management.ts`
    - _Requirements: 5.4_

  - [x] 1.2 Remove pattern Lambda handlers and esbuild entry points
    - Delete `projects/shop-api/src/pattern-cluster-handler.ts`
    - Delete `projects/shop-api/src/pattern-apply-handler.ts`
    - Remove `src/pattern-cluster-handler.ts` and `src/pattern-apply-handler.ts` from the `entryPoints` array in `projects/shop-api/esbuild.config.mjs`
    - Remove the two `execSync` zip commands for `pattern-cluster-handler.zip` and `pattern-apply-handler.zip`
    - _Requirements: 5.5_

  - [x] 1.3 Remove pattern backend source directory and tests
    - Delete `projects/shop-api/src/patterns/` directory (contains `scan-cluster.ts`, `apply-mappings.ts`)
    - Delete `projects/shop-api/tests/patterns/` directory (contains `scan-cluster.test.ts`, `apply-mappings.test.ts`)
    - _Requirements: 5.1, 5.2_

  - [x] 1.4 Remove pattern frontend feature and navigation
    - Delete `projects/shop/src/features/patterns/` directory (contains `pattern-management-page.tsx`, `patterns-api.ts`, `patterns-types.ts`)
    - Remove the `PatternManagementPage` import and route entry from `projects/shop/src/config/routes.ts`
    - Remove the `{ label: "Patterns", path: "/patterns", icon: Grid3X3 }` entry and `Grid3X3` import from `projects/shop/src/config/navigation.ts`
    - _Requirements: 5.6_

  - [x] 1.5 Remove pattern infrastructure from Terraform
    - Remove `aws_lambda_function.pattern_cluster` and `aws_lambda_function.pattern_apply` resources from `infrastructure/lambda.tf`
    - Remove `aws_lambda_function.pattern_cluster.arn` and `aws_lambda_function.pattern_apply.arn` from the `aws_iam_role_policy.shop_api_invoke_aggregator` Resource list
    - Remove `PATTERN_CLUSTER_FUNCTION_NAME` and `PATTERN_APPLY_FUNCTION_NAME` env vars from `aws_lambda_function.shop_api`
    - Remove `"${aws_s3_bucket.items.arn}/pattern-mappings/*"` from `aws_iam_role_policy.shop_api_s3_items` PutObject/GetObject Resource list
    - Remove `"pattern-mappings/*"` from `aws_iam_role_policy.shop_api_s3_items` ListBucket Condition
    - Remove the `pattern-mappings/*` S3 statement and ListBucket condition entry from `aws_iam_role_policy.pricing_aggregator_s3`
    - Remove the five pattern API Gateway routes (`post_patterns_scan_cluster`, `get_patterns_mappings`, `put_patterns_mappings`, `post_patterns_apply`, `get_patterns_apply_status`) from `infrastructure/api-gateway.tf`
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 5.8_

- [x] 2. Checkpoint - Verify removal is clean
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Integrate pattern detection into color scanner
  - [x] 3.1 Add `PATTERN_MAP` and `splitColorPattern` to `scan-cluster.ts`
    - Add the `PATTERN_MAP` dictionary (mapping variant spellings to canonical German pattern names) to `projects/shop-api/src/colors/scan-cluster.ts`
    - Implement `splitColorPattern(rawValue: string): { color: string | null; pattern: string | null }` that detects pattern keywords via token splitting (space/slash/hyphen separators) and substring fallback
    - Export both `PATTERN_MAP` and `splitColorPattern` for testing
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.1, 6.2, 6.3, 6.4_

  - [x] 3.2 Update `clusterColors` to produce extended `MappingEntry` format
    - Replace `ColorMapping` interface with `MappingEntry { raw: string; canonical: string | null; pattern: string | null }`
    - Remove the `isPurePattern` function and the skip logic that excluded pattern values
    - Update `clusterColors` to call `splitColorPattern` for each raw value, producing entries with both `canonical` and `pattern` fields
    - Update the handler to write the new format to S3 at `color-mappings/draft.json`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 3.3 Write property test: Pattern keyword splitting produces valid components (Property 1)
    - **Property 1: Pattern keyword splitting produces valid components**
    - For any raw string containing exactly one Pattern_Keyword as a token, `splitColorPattern` returns a non-null pattern and the remaining portion as color
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 1.1, 6.3**

  - [ ]* 3.4 Write property test: Pure pattern values produce null canonical color (Property 2)
    - **Property 2: Pure pattern values produce null canonical color**
    - For any raw string consisting entirely of a single Pattern_Keyword, `splitColorPattern` returns `{ color: null, pattern: <canonical> }`
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 1.2, 6.1**

  - [ ]* 3.5 Write property test: Non-pattern values produce null pattern (Property 3)
    - **Property 3: Non-pattern values produce null pattern**
    - For any raw string containing no Pattern_Keyword, `splitColorPattern` returns `{ color: <input>, pattern: null }`
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 1.4**

  - [ ]* 3.6 Write property test: Color prefix resolution is consistent with splitting (Property 6)
    - **Property 6: Color prefix resolution is consistent with splitting**
    - For any compound "prefix+base+pattern" value (e.g., "dunkelblau gestreift"), the color component resolved by `splitColorPattern` equals the result of applying prefix lookup
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 6.2**

- [x] 4. Update color applier for pattern writes
  - [x] 4.1 Extend `apply-mappings.ts` with pattern write branches
    - Update `MappingEntry` interface to `{ raw: string; canonical: string | null; pattern: string | null }` in `projects/shop-api/src/colors/apply-mappings.ts`
    - Update delta computation to compare all three fields (`raw`, `canonical`, `pattern`)
    - Implement three DynamoDB update branches:
      - `canonical != null && pattern != null` → SET color, pattern, sourceColor, sourcePattern
      - `canonical == null && pattern != null` → SET pattern, sourcePattern; REMOVE color
      - `canonical != null && pattern == null` → SET color, sourceColor (existing behavior)
    - Add canonical pattern seeding loop (`PK: "CANONICAL#PATTERNS"`, `SK: "PATTERN#<name>"`)
    - Update `ApplyStatus` interface to include `canonicalPatternsSeeded` count
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 4.2 Write property test: Delta computation detects all field changes (Property 5)
    - **Property 5: Delta computation detects all field changes**
    - For any pair of mapping arrays where at least one entry differs in `canonical` or `pattern`, the delta includes that entry; identical entries are excluded
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 3.4**

- [x] 5. Update API route validation for extended format
  - [x] 5.1 Update `color-management.ts` route validation
    - Update `MappingEntry` interface to `{ raw: string; canonical: string | null; pattern: string | null }` in `projects/shop-api/src/routes/color-management.ts`
    - Update validation in `saveColorMappings` to accept `canonical` as `string | null` and require `pattern` as `string | null`
    - Update `getColorMappings` to return the full extended entries (no change needed if deserialization just passes through)
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 5.2 Write property test: Mapping entry round-trip serialization (Property 4)
    - **Property 4: Mapping entry round-trip serialization**
    - For any valid `MappingEntry` object, JSON.stringify then JSON.parse produces an equivalent object
    - Use `fast-check` with minimum 100 iterations
    - **Validates: Requirements 2.1, 6.5**

- [x] 6. Checkpoint - Ensure backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Update frontend for pattern column
  - [x] 7.1 Update frontend types
    - Update `ColorMapping` in `projects/shop/src/features/colors/colors-types.ts` to `{ raw: string; canonical: string | null; pattern: string | null }`
    - Add `canonicalPatternsSeeded?: number` to `ApplyStatus` interface
    - _Requirements: 2.1, 4.1_

  - [x] 7.2 Add pattern column to color management page
    - Add "Pattern" column header between "Canonical" and the delete button in `projects/shop/src/features/colors/color-management-page.tsx`
    - Add an `<Input>` for pattern editing per row (same approach as canonical field)
    - Add a `handlePatternChange` function (or extend `handleMappingChange`) for pattern field edits
    - Update the apply status message to display `canonicalPatternsSeeded` count
    - Set `hasUnsavedChanges = true` when pattern field is edited
    - Include pattern in the save payload (naturally handled if types are correct)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 7.3 Update existing color scanner test to remove `isPurePattern` references
    - Update `projects/shop-api/tests/colors/scan-cluster.test.ts` to remove `isPurePattern` import and its describe block
    - Add new test cases for `splitColorPattern` covering compound values and pure patterns
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The removal phase (tasks 1.x) MUST complete before integration (tasks 3.x-5.x) to avoid conflicts with deleted imports
- The `splitColorPattern` function is ported from the existing `projects/shop-api/src/patterns/scan-cluster.ts` before that file is deleted

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.4"] },
    { "id": 1, "tasks": ["1.3", "1.5"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2", "5.1"] },
    { "id": 4, "tasks": ["3.3", "3.4", "3.5", "3.6", "4.1", "5.2"] },
    { "id": 5, "tasks": ["4.2", "7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3"] }
  ]
}
```
