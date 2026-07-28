# Requirements Document

## Introduction

The Category Selector feature replaces the plain text Category input in the Item Capture Page with a searchable autocomplete component. It introduces a backend API endpoint that queries existing CATEGORY records from the DynamoDB shop table and returns them for use in the frontend dropdown. The frontend component follows the same pattern as the existing BrandAutocomplete and ColorAutocomplete components.

## Glossary

- **Shop_API**: The monolambda backend service handling all API requests for the shop application
- **API_Gateway**: The AWS API Gateway HTTP API that routes requests to the Shop_API Lambda
- **Categories_Endpoint**: The GET /api/categories route that returns category data
- **CategoryAutocomplete**: The frontend React component providing searchable category selection
- **AutocompleteInput**: The existing shared component that renders a filterable dropdown list
- **Item_Capture_Page**: The page where operators enter item details including category selection
- **Category_Record**: A DynamoDB record with PK `CATEGORY#<uuid>` and SK `METADATA`, containing id (uuid) and name attributes
- **Categories_Cache**: An in-memory cache within the Shop_API Lambda that stores fetched category data with a time-to-live

## Requirements

### Requirement 1: Backend Categories API Endpoint

**User Story:** As a frontend client, I want to fetch all available categories from a dedicated API endpoint, so that the CategoryAutocomplete component can display them for selection.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/categories`, THE Shop_API SHALL query all Category_Record entries from the DynamoDB shop table by scanning for records with PK beginning with `CATEGORY#` and SK equal to `METADATA`.
2. WHEN the query completes successfully, THE Shop_API SHALL return a JSON response with HTTP status 200 containing an array of objects with `id` (UUID) and `name` (string) properties.
3. THE Shop_API SHALL sort the returned categories alphabetically by name using locale-aware string comparison.
4. WHEN the Categories_Cache contains valid (non-expired) data, THE Shop_API SHALL return the cached data instead of querying DynamoDB.
5. THE Categories_Cache SHALL use a time-to-live of 5 minutes, after which the next request triggers a fresh DynamoDB query.
6. IF the DynamoDB query fails, THEN THE Shop_API SHALL log the error details and return an HTTP 500 response with a generic error payload.

### Requirement 2: API Gateway Route Configuration

**User Story:** As an operator, I want the categories endpoint to be accessible through the API Gateway with authentication, so that only authorized users can retrieve category data.

#### Acceptance Criteria

1. THE API_Gateway SHALL define a route for `GET /api/categories` that integrates with the monolambda integration.
2. THE API_Gateway SHALL apply CUSTOM authorization using the existing Cognito authorizer to the `GET /api/categories` route.

### Requirement 3: Frontend CategoryAutocomplete Component

**User Story:** As an operator entering item details, I want a searchable category dropdown so that I can quickly find and select the correct category without typing UUIDs manually.

#### Acceptance Criteria

1. WHEN the CategoryAutocomplete component mounts, THE CategoryAutocomplete SHALL fetch the list of categories from the Categories_Endpoint.
2. THE CategoryAutocomplete SHALL display category names in the AutocompleteInput dropdown for the operator to search and select.
3. WHEN the operator selects a category from the dropdown, THE CategoryAutocomplete SHALL pass the selected category UUID (id) to the parent component via the onChange callback.
4. THE CategoryAutocomplete SHALL accept a `value` prop representing the currently selected category UUID and display the corresponding category name in the input field.
5. IF the fetch request to the Categories_Endpoint fails, THEN THE CategoryAutocomplete SHALL render the AutocompleteInput with an empty options list without displaying an error to the operator.
6. WHEN the component unmounts before the fetch completes, THE CategoryAutocomplete SHALL abort the in-flight request to prevent memory leaks.

### Requirement 4: Item Capture Page Integration

**User Story:** As an operator, I want the Category field on the Item Capture Page to use the new autocomplete selector, so that I can choose from existing categories instead of typing free text.

#### Acceptance Criteria

1. THE Item_Capture_Page SHALL render the CategoryAutocomplete component in place of the plain text Category input field.
2. WHEN the operator selects a category via the CategoryAutocomplete, THE Item_Capture_Page SHALL store the selected UUID as the `categoryId` state value.
3. THE Item_Capture_Page SHALL pass the `categoryId` state value to the PriceSuggestionPanel component.

### Requirement 5: Router Registration

**User Story:** As the Shop_API, I want the categories handler registered in the request router, so that incoming requests are dispatched to the correct handler function.

#### Acceptance Criteria

1. THE Shop_API SHALL register the route key `GET /api/categories` in the router mapping, dispatching to the categories list handler function.
