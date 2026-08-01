# Requirements Document

## Introduction

This feature adds a description field to the item capture form in the shop frontend. The description field uses an autocomplete component loaded from a canonical descriptions endpoint, following the existing BrandAutocomplete pattern with fuzzy matching. The description value is passed to the suggest-price API to improve pricing accuracy. The PriceSuggestionPanel trigger logic is updated so that price suggestions fire when at least one of description or categoryId is provided, matching the backend API's validation rule.

## Glossary

- **Item_Capture_Form**: The React form at `item-capture-page.tsx` used by shop operators to enter new item data (brand, category, color, size, title, tag price).
- **Description_Autocomplete**: A new autocomplete input component for the description field that loads canonical descriptions and offers suggestions as the operator types, using fuzzy matching.
- **Canonical_Descriptions_Endpoint**: A backend API endpoint that returns the list of known item descriptions for use in the autocomplete.
- **Price_Suggestion_Panel**: The sidebar component that calls the suggest-price API and displays a recommended price based on item attributes.
- **Suggest_Price_API**: The backend route (`/api/pricing/suggest`) that accepts item attributes (brand, categoryId, description, color, size, createdBy) and returns a price suggestion with confidence and explanation.
- **Pricing_API_Client**: The frontend module (`pricing-api.ts`) containing functions that call the shop API pricing endpoints.

## Requirements

### Requirement 1: Description Autocomplete Component

**User Story:** As a shop operator, I want a description autocomplete field that suggests canonical descriptions as I type, so that I can quickly select a standardized description for the item.

#### Acceptance Criteria

1. THE Description_Autocomplete SHALL load the list of canonical descriptions from the Canonical_Descriptions_Endpoint on mount.
2. WHEN the operator types in the description field, THE Description_Autocomplete SHALL filter the canonical descriptions list using case-insensitive substring matching and display matching suggestions.
3. WHEN the operator selects a suggestion from the list, THE Description_Autocomplete SHALL set the description field value to the selected canonical description.
4. WHEN the operator types a value that does not exactly match a canonical description and a fuzzy match exists within Levenshtein distance of 2, THE Description_Autocomplete SHALL display a "Did you mean?" suggestion with the closest canonical description.
5. WHEN the operator clicks the fuzzy match suggestion, THE Description_Autocomplete SHALL replace the current input value with the suggested canonical description.
6. THE Description_Autocomplete SHALL allow the operator to enter a free-text description that does not match any canonical description.
7. IF the Canonical_Descriptions_Endpoint request fails, THEN THE Description_Autocomplete SHALL render the field as a plain text input without autocomplete suggestions.

### Requirement 2: Description Field Placement in Form

**User Story:** As a shop operator, I want the description field placed between category and color in the form, so that I can fill it in naturally as part of the high-priority item attributes.

#### Acceptance Criteria

1. THE Item_Capture_Form SHALL render the description field immediately after the category field and before the color field.
2. THE Item_Capture_Form SHALL label the description field with the text "Description".
3. THE Item_Capture_Form SHALL store the description value in component state and make it available to the Price_Suggestion_Panel.

### Requirement 3: Canonical Descriptions API Endpoint

**User Story:** As the shop frontend, I want a backend endpoint that returns the list of canonical descriptions, so that the Description_Autocomplete can offer standardized suggestions.

#### Acceptance Criteria

1. THE Canonical_Descriptions_Endpoint SHALL respond to GET requests at the path `/api/pricing/canonical/descriptions`.
2. WHEN the Canonical_Descriptions_Endpoint receives a valid authenticated request, THE Canonical_Descriptions_Endpoint SHALL return a JSON response containing an array of canonical description strings.
3. THE Pricing_API_Client SHALL provide a `fetchCanonicalDescriptions` function that calls the Canonical_Descriptions_Endpoint and returns the list of descriptions.
4. THE `fetchCanonicalDescriptions` function SHALL follow the same pattern as `fetchCanonicalBrands` for authentication, timeout handling, and error responses.

### Requirement 4: Price Suggestion Trigger Update

**User Story:** As a shop operator, I want the price suggestion to appear as soon as I provide either a description or a category, so that I get pricing guidance earlier in the item entry process.

#### Acceptance Criteria

1. WHEN at least one of description or categoryId is provided, THE Price_Suggestion_Panel SHALL trigger a price suggestion request to the Suggest_Price_API.
2. WHEN neither description nor categoryId is provided, THE Price_Suggestion_Panel SHALL remain in the idle state and display no suggestion.
3. THE Price_Suggestion_Panel SHALL accept a `description` prop in addition to the existing props (brand, categoryId, color, size, createdBy).
4. THE Price_Suggestion_Panel SHALL include the description value as a dependency in its effect that triggers price suggestion fetching, causing re-fetches when description changes.

### Requirement 5: Description Parameter in Pricing API Client

**User Story:** As the Price_Suggestion_Panel, I want the pricing API client to pass the description parameter to the suggest-price backend, so that description-based pricing references are resolved.

#### Acceptance Criteria

1. THE `fetchPriceSuggestion` function SHALL accept an optional `description` parameter in its params object.
2. WHEN a description value is provided, THE `fetchPriceSuggestion` function SHALL include `description` as a query parameter in the request URL to the Suggest_Price_API.
3. WHEN the description value is empty or undefined, THE `fetchPriceSuggestion` function SHALL omit the `description` query parameter from the request.
