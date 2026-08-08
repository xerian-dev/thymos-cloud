# Requirements Document

## Introduction

Integrate pattern detection directly into the existing color management workflow. Instead of maintaining a separate standalone pattern system (separate Lambdas, S3 prefix, API routes, frontend page), the color scan-cluster and apply-mappings pipeline produces both a canonical color AND a canonical pattern for each raw color value. The standalone pattern system is removed entirely.

## Glossary

- **Color_Scanner**: The Lambda function that scans all items in the shop table, extracts distinct color values, detects embedded pattern keywords, splits compound values into color and pattern components, and writes a draft mapping to S3.
- **Color_Applier**: The Lambda function that diffs draft vs applied mappings in S3 and writes canonical color and pattern values to items in DynamoDB.
- **Color_API**: The set of HTTP routes (`/api/colors/*`) that expose color mapping management to the frontend.
- **Color_Management_UI**: The frontend page at `/colors` that displays and allows editing of color-pattern mappings.
- **Mapping_Entry**: A single mapping record with format `{ raw: string, canonical: string | null, pattern: string | null }`.
- **Canonical_Pattern**: One of the fixed German pattern names: Gestreift, Punkte, Kariert, Bedruckt, Blumen, Tiere, Sterne, Herzen, Camouflage, Uni.
- **Pure_Pattern**: A raw color value that resolves entirely to a pattern with no color component (e.g., "gestreift" → `canonical: null, pattern: "Gestreift"`).
- **Compound_Value**: A raw color value containing both a color and a pattern (e.g., "blau gestreift" → `canonical: "Blau", pattern: "Gestreift"`).
- **Pattern_Keywords**: The set of known words (in German and English) that map to a Canonical_Pattern.
- **Standalone_Pattern_System**: The separate pattern pipeline (pattern-cluster Lambda, pattern-apply Lambda, `/api/patterns/*` routes, `/patterns` frontend page) that is being removed.

## Requirements

### Requirement 1: Color Scanner Detects Patterns

**User Story:** As a shop operator, I want the color scanning process to automatically detect patterns within color values, so that I get both color and pattern information from a single scan without running a separate pipeline.

#### Acceptance Criteria

1. WHEN a raw color value contains a Pattern_Keyword as a token, THE Color_Scanner SHALL split the value into separate color and pattern components.
2. WHEN a raw color value consists entirely of a Pattern_Keyword, THE Color_Scanner SHALL produce a Mapping_Entry with `canonical: null` and the resolved Canonical_Pattern.
3. WHEN a raw color value contains both a color word and a Pattern_Keyword, THE Color_Scanner SHALL produce a Mapping_Entry with the resolved canonical color and the resolved Canonical_Pattern.
4. WHEN a raw color value contains no Pattern_Keyword, THE Color_Scanner SHALL produce a Mapping_Entry with `pattern: null` and the resolved canonical color.
5. THE Color_Scanner SHALL write draft mappings to S3 at key `color-mappings/draft.json` in the format `Array<{ raw: string, canonical: string | null, pattern: string | null }>`.

### Requirement 2: Extended Mapping Format

**User Story:** As a shop operator, I want the mapping format to include a pattern field alongside the canonical color, so that I can review and correct both assignments in one place.

#### Acceptance Criteria

1. THE Color_API SHALL accept and return Mapping_Entry objects with the shape `{ raw: string, canonical: string | null, pattern: string | null }`.
2. WHEN saving mappings via `PUT /api/colors/mappings`, THE Color_API SHALL validate that each entry has a string `raw` field, a string or null `canonical` field, and a string or null `pattern` field.
3. WHEN loading mappings via `GET /api/colors/mappings`, THE Color_API SHALL return the full Mapping_Entry including the `pattern` field.

### Requirement 3: Apply Writes Both Color and Pattern

**User Story:** As a shop operator, I want applying mappings to update both the color and pattern fields on items in one pass, so that items are fully classified without running separate apply steps.

#### Acceptance Criteria

1. WHEN a Mapping_Entry has a non-null `canonical` and a non-null `pattern`, THE Color_Applier SHALL SET the item's `color` to `canonical`, SET `pattern` to the pattern value, and SET `sourcePattern` to the raw value (using `if_not_exists`).
2. WHEN a Mapping_Entry has a null `canonical` and a non-null `pattern` (Pure_Pattern), THE Color_Applier SHALL SET the item's `pattern` to the pattern value, SET `sourcePattern` to the raw value (using `if_not_exists`), and REMOVE the item's `color` field.
3. WHEN a Mapping_Entry has a non-null `canonical` and a null `pattern`, THE Color_Applier SHALL SET the item's `color` to `canonical` and SET `sourceColor` to the raw value (using `if_not_exists`), matching existing behavior.
4. THE Color_Applier SHALL compute the delta by comparing draft and applied mappings on all three fields (`raw`, `canonical`, `pattern`).
5. THE Color_Applier SHALL seed canonical pattern list entries (`PK: "CANONICAL#PATTERNS"`, `SK: "PATTERN#<name>"`) for each distinct pattern value in the draft.

### Requirement 4: Color Management UI Shows Pattern Column

**User Story:** As a shop operator, I want to see and edit the pattern assignment for each mapping directly on the color management page, so that I do not need a separate page for pattern review.

#### Acceptance Criteria

1. THE Color_Management_UI SHALL display a "Pattern" column alongside the "Raw Value" and "Canonical" columns for each Mapping_Entry.
2. WHEN the operator edits the pattern field of a Mapping_Entry, THE Color_Management_UI SHALL mark the mappings as having unsaved changes.
3. THE Color_Management_UI SHALL allow the pattern field to be set to empty (representing null) or to any string value.
4. WHEN saving mappings, THE Color_Management_UI SHALL include the pattern field for each entry in the request payload.

### Requirement 5: Remove Standalone Pattern System

**User Story:** As a developer, I want the standalone pattern system removed from the codebase and infrastructure, so that there is a single unified color-pattern pipeline without duplicate functionality.

#### Acceptance Criteria

1. THE System SHALL remove the pattern-cluster Lambda function and its Terraform resource definition.
2. THE System SHALL remove the pattern-apply Lambda function and its Terraform resource definition.
3. THE System SHALL remove the `/api/patterns/*` API routes from the API Gateway Terraform configuration.
4. THE System SHALL remove the pattern management route handlers from the router and route source files.
5. THE System SHALL remove the pattern-cluster-handler and pattern-apply-handler esbuild entry points.
6. THE System SHALL remove the `/patterns` frontend page, its navigation entry, and its route configuration.
7. THE System SHALL remove the `pattern-mappings/*` S3 IAM permissions that are no longer needed (the color-mappings prefix remains and the apply step handles patterns via that prefix now).
8. THE System SHALL remove the `PATTERN_CLUSTER_FUNCTION_NAME` and `PATTERN_APPLY_FUNCTION_NAME` environment variables from the shop API Lambda and IAM invoke permissions.

### Requirement 6: Pattern Detection Algorithm

**User Story:** As a shop operator, I want reliable pattern detection that handles compound German color-pattern values, so that the automated clustering produces accurate results.

#### Acceptance Criteria

1. THE Color_Scanner SHALL recognize all Pattern_Keywords defined in the canonical patterns table (Gestreift, Punkte, Kariert, Bedruckt, Blumen, Tiere, Sterne, Herzen, Camouflage, Uni) and their known variant spellings.
2. WHEN splitting a Compound_Value, THE Color_Scanner SHALL resolve the color portion using the existing canonical color lookup (including prefix handling for "dunkel", "hell", etc.).
3. WHEN a Compound_Value is separated by spaces, slashes, or hyphens, THE Color_Scanner SHALL correctly identify and split on the Pattern_Keyword token.
4. WHEN a raw value contains a Pattern_Keyword as a substring within a larger word (not a separate token), THE Color_Scanner SHALL attempt substring-based splitting as a fallback.
5. FOR ALL valid Mapping_Entry objects, formatting then parsing SHALL preserve the `canonical` and `pattern` fields (round-trip property of the mapping format).
