# Requirements Document

## Introduction

This feature adds comprehensive item management to the consignment shop application. Items represent physical goods owned by external consignor accounts that are sold on their behalf with a revenue split. The feature includes: creating items via a form and API, listing items in a paginated table, editing existing items, and deleting items. Each item receives a synthetic UUID for identity and a sequential numeric SKU (shopUid) for operator-friendly reference. The UI reuses shared table and pagination components extracted from the accounts feature to maintain consistency.

## Glossary

- **Item_API**: The REST API endpoint(s) on the Shop_API Lambda responsible for creating, reading, updating, and deleting items
- **Shop_Table**: The existing DynamoDB table (`thymos-{environment}-shop`) storing all shop entities using single-table design
- **Item**: An inventory record representing a physical good consigned by an Account for sale in the shop
- **Account**: An existing consignor entity in the Shop_Table that owns one or more Items
- **SKU**: A sequential numeric identifier (shopUid) auto-generated from the item sequence counter, used as the operator-facing item reference
- **Tag_Price**: The listed sale price of an Item in CHF (Swiss Francs)
- **Split**: The revenue percentage allocated to the consignor Account upon sale of the Item
- **Terms**: The disposition policy for an Item after its consignment period (e.g., "Return To Consignor", "Donate", "Discard")
- **Inventory_Type**: The classification of how an Item is stocked (e.g., "Consignment", "Retail")
- **Item_Form**: The frontend React component providing the user interface for item creation and editing
- **Items_Table**: The frontend React component displaying items in a paginated table with columns for SKU, title, account, category, tag price, quantity, inventory type, and actions
- **Items_Page**: The frontend page component composing the Items_Table, add button, Item_Form dialog, and delete confirmation dialog
- **Shared_Data_Table**: A reusable table component encapsulating header rendering, row rendering, empty state, loading state, and error state with retry — used by both AccountsTable and Items_Table
- **Shared_Pagination_Controls**: A reusable pagination component providing cursor-based navigation and page size selection — used by both AccountsTable and Items_Table
- **Sequence_Counter**: A DynamoDB record used to atomically increment and retrieve the next available SKU for items

## Requirements

### Requirement 1: Store Item in DynamoDB

**User Story:** As a shop operator, I want created items to be persisted in the database, so that inventory data is durably stored and queryable.

#### Acceptance Criteria

1. WHEN an item is created, THE Item_API SHALL store the item in the Shop_Table with PK set to `ITEM#<uuid>` and SK set to `METADATA`
2. WHEN an item is created, THE Item_API SHALL generate a v4 UUID as the item's primary identity
3. WHEN an item is created, THE Item_API SHALL atomically increment the Sequence_Counter (PK=`SEQUENCE#ITEM`, SK=`COUNTER`) and use the resulting value as the item's SKU (shopUid)
4. WHEN an item is created, THE Item_API SHALL store `GSI1PK` as `ITEMS` and `GSI1SK` as `ITEM#<sku>` where sku is the numeric SKU zero-padded to 7 digits (e.g., `ITEM#0000042`)
5. WHEN an item is created, THE Item_API SHALL store both `createdAt` and `updatedAt` as ISO 8601 UTC timestamps set to the current time at creation
6. WHEN an item is created, THE Item_API SHALL store the owning account's UUID as an `accountId` attribute on the item record
7. WHEN an item is created, THE Item_API SHALL execute the Sequence_Counter increment and the item Put as a single DynamoDB TransactWriteItems operation so that either both succeed or neither is persisted
8. IF the TransactWriteItems operation fails due to a Sequence_Counter conditional check failure, THEN THE Item_API SHALL return a 500 error response indicating a sequencing conflict without creating the item
9. IF the TransactWriteItems operation fails due to a PK uniqueness conflict on the item record, THEN THE Item_API SHALL retry with a newly generated UUID up to 3 attempts before returning a 500 error response

### Requirement 2: Validate Item Data

**User Story:** As a shop operator, I want item data to be validated before saving, so that the inventory contains only well-formed records.

#### Acceptance Criteria

1. WHEN an item creation or update request is received, THE Item_API SHALL require a non-empty `accountId` referencing a valid Account in the Shop_Table
2. WHEN an item creation or update request is received, THE Item_API SHALL require a non-empty `title` with a maximum length of 200 characters
3. WHEN an item creation or update request is received, THE Item_API SHALL require a `tagPrice` that is a non-negative number with at most 2 decimal places and a maximum value of 999999.99
4. WHEN an item creation or update request is received, THE Item_API SHALL require a `quantity` that is a positive integer with a maximum value of 9999
5. WHEN an item creation or update request is received, THE Item_API SHALL require a `split` value that is an integer between 0 and 100 inclusive (representing the consignor's percentage)
6. WHEN an item creation or update request is received, THE Item_API SHALL require an `inventoryType` from the set: "Consignment", "Retail"
7. WHEN an item creation or update request is received, THE Item_API SHALL require `terms` from the set: "Return To Consignor", "Donate", "Discard"
8. IF the referenced `accountId` does not exist in the Shop_Table, THEN THE Item_API SHALL return a 422 response with error code `account_not_found`
9. WHEN an item creation or update request includes a `description` field, THE Item_API SHALL accept a maximum of 2000 characters
10. WHEN an item creation or update request includes a `details` field (rich text), THE Item_API SHALL accept a maximum of 5000 characters
11. WHEN an item creation or update request includes `tags`, THE Item_API SHALL accept an array of strings with a maximum of 20 tags, each tag having a maximum of 50 characters
12. WHEN an item creation or update request includes an `expirationDate`, THE Item_API SHALL validate the date is in ISO 8601 format and is later than the current UTC date at the time of the request
13. IF any required field (`accountId`, `title`, `tagPrice`, `quantity`, `split`, `inventoryType`, `terms`) is missing or fails validation, THEN THE Item_API SHALL reject the request and include a field-level error indicator for each invalid field in the response

### Requirement 3: Item Creation API Endpoint

**User Story:** As a shop operator, I want a REST API endpoint for creating items, so that the frontend can submit item data securely.

#### Acceptance Criteria

1. THE Item_API SHALL expose a `POST /api/items` endpoint that accepts a JSON request body for item creation
2. WHEN a valid item creation request is received, THE Item_API SHALL return a 201 response with a JSON body containing the created item record including all stored attributes, the assigned UUID, SKU, `createdAt`, and `updatedAt` timestamps
3. WHEN a request fails validation, THE Item_API SHALL return a 400 response with a JSON body containing an array of error objects, each identifying the field name and a human-readable error description for that field
4. WHEN the caller is not authenticated via the Cognito authorizer, THE Item_API SHALL return a 401 response
5. IF an unexpected server error occurs during item creation, THEN THE Item_API SHALL return a 500 response with a JSON body containing a generic error message that does not reveal internal system details (stack traces, database errors, or infrastructure identifiers) and SHALL log the detailed error to CloudWatch

### Requirement 4: Item Update API Endpoint

**User Story:** As a shop operator, I want a REST API endpoint for updating items, so that I can correct or modify item details after creation.

#### Acceptance Criteria

1. THE Item_API SHALL expose a `PUT /api/items/{uuid}` endpoint that accepts a JSON request body for item update
2. WHEN a valid update request is received, THE Item_API SHALL update the item attributes in the Shop_Table and set the `updatedAt` timestamp to the current UTC time
3. WHEN a valid update request is received, THE Item_API SHALL NOT modify the item's UUID, SKU, or `createdAt` timestamp
4. WHEN a valid update request is received, THE Item_API SHALL return a 200 response with a JSON body containing the updated item record including all stored attributes
5. IF the item identified by the UUID does not exist in the Shop_Table, THEN THE Item_API SHALL return a 404 response with error code `not_found`
6. WHEN the caller is not authenticated via the Cognito authorizer, THE Item_API SHALL return a 401 response
7. IF an unexpected server error occurs during item update, THEN THE Item_API SHALL return a 500 response with a generic error message and log the detailed error to CloudWatch

### Requirement 5: Item Deletion API Endpoint

**User Story:** As a shop operator, I want a REST API endpoint for deleting items, so that I can remove inventory records that are no longer needed.

#### Acceptance Criteria

1. THE Item_API SHALL expose a `DELETE /api/items/{uuid}` endpoint for item deletion
2. WHEN a valid delete request is received, THE Item_API SHALL remove the item record from the Shop_Table and return a 200 response with a JSON body confirming deletion
3. IF the item identified by the UUID does not exist in the Shop_Table, THEN THE Item_API SHALL return a 404 response with error code `not_found`
4. WHEN the caller is not authenticated via the Cognito authorizer, THE Item_API SHALL return a 401 response
5. IF an unexpected server error occurs during item deletion, THEN THE Item_API SHALL return a 500 response with a generic error message and log the detailed error to CloudWatch

### Requirement 6: Item List API Endpoint

**User Story:** As a shop operator, I want a REST API endpoint for listing items with pagination, so that the frontend can display items in a paginated table.

#### Acceptance Criteria

1. THE Item_API SHALL expose a `GET /api/items` endpoint that returns a paginated list of items
2. WHEN the list endpoint is called, THE Item_API SHALL accept optional query parameters `pageSize` (20, 50, or 100, default 20) and `cursor` (an opaque pagination token)
3. WHEN the list endpoint is called without a cursor, THE Item_API SHALL return the first page of items ordered by SKU ascending via the GSI1 index
4. WHEN the list endpoint is called with a valid cursor, THE Item_API SHALL return the next page of items starting after the position encoded in the cursor
5. THE Item_API SHALL return a JSON response containing an `items` array, a `nextCursor` field (null if no more pages), and a `hasMore` boolean
6. WHEN the caller is not authenticated via the Cognito authorizer, THE Item_API SHALL return a 401 response
7. IF an unexpected server error occurs, THEN THE Item_API SHALL return a 500 response with a generic error message and log the detailed error to CloudWatch

### Requirement 7: Item Creation and Edit Form UI

**User Story:** As a shop operator, I want a form to enter and modify item details, so that I can add new inventory and update existing items.

#### Acceptance Criteria

1. THE Item_Form SHALL present a two-column layout: item attributes on the left and inventory/pricing fields on the right
2. THE Item_Form SHALL include a searchable Account dropdown allowing the operator to select the owning consignor
3. THE Item_Form SHALL include fields for: category, description, brand, color, size (all optional dropdowns), details (rich text editor), and image upload area
4. THE Item_Form SHALL include fields for: quantity (default 1), tag price (CHF currency input), title, SKU (read-only display showing the numeric value), tags (multi-select input), inventory type (dropdown, default "Consignment"), expiration date (toggle + date picker), shelf (dropdown), split (percentage input with "% to consignor" label), terms (dropdown, default "Return To Consignor"), and tax exempt (toggle, default off)
5. WHEN the form is opened in create mode, THE Item_Form SHALL display the next available SKU (fetched from the API) as a read-only preview
6. WHEN the form is opened in edit mode, THE Item_Form SHALL populate all fields with the existing item's data and display the SKU as a read-only field
7. WHEN the form is opened in edit mode, THE Item_Form SHALL NOT allow modification of the SKU field
8. WHEN the form is submitted with valid data in create mode, THE Item_Form SHALL send a POST request to the Item_API and display a success confirmation
9. WHEN the form is submitted with valid data in edit mode, THE Item_Form SHALL send a PUT request to the Item_API and display a success confirmation
10. WHEN the form submission fails with validation errors, THE Item_Form SHALL display the specific error messages adjacent to the relevant fields
11. WHILE the form is submitting, THE Item_Form SHALL disable the submit button and show a loading indicator to prevent duplicate submissions
12. THE Item_Form SHALL be accessible with proper ARIA labels on all form controls, keyboard navigation between all fields using Tab order, and visible focus indicators meeting WCAG 2.1 AA contrast requirements
13. WHEN the form submission fails with a network or server error, THE Item_Form SHALL display a dismissible error banner at the top of the form with a user-friendly message
14. THE Item_Form SHALL validate required fields on the client side before submitting to the Item_API and display inline errors immediately without a round-trip
15. WHEN an item is successfully created, THE Item_Form SHALL reset all fields to their default values

### Requirement 8: SKU Sequence Counter

**User Story:** As a shop operator, I want each item to have a unique sequential SKU, so that I can quickly reference items by a short numeric identifier.

#### Acceptance Criteria

1. THE Sequence_Counter for items SHALL be stored in the Shop_Table with PK `SEQUENCE#ITEM` and SK `COUNTER`
2. WHEN a new item is created, THE Item_API SHALL atomically increment the Sequence_Counter and use the resulting value as the item's SKU (shopUid)
3. IF no Sequence_Counter record exists when an item is created, THEN THE Item_API SHALL initialize the counter with a value of 1 using a conditional write and assign SKU 1 to the item
4. THE SKU SHALL be a positive integer that increases monotonically with each item created (gaps are permitted when an increment succeeds but the subsequent item write fails)
5. IF two concurrent item creation requests cause a conditional expression conflict, THEN THE Item_API SHALL retry the increment up to 3 times before returning an error response to the caller
6. IF the Sequence_Counter increment succeeds but the subsequent item write fails, THEN THE Item_API SHALL return an error response without rolling back the counter (accepting a gap in the sequence)

### Requirement 9: Fetch Next SKU

**User Story:** As a shop operator, I want to see the next SKU before creating an item, so that I can confirm the numbering sequence.

#### Acceptance Criteria

1. THE Item_API SHALL expose a `GET /api/items/next-sku` endpoint that returns the next available SKU without incrementing the counter
2. WHEN the next-sku endpoint is called, THE Item_API SHALL read the current Sequence_Counter value and return a JSON response containing the field `nextSku` set to the current counter value plus one
3. IF no Sequence_Counter record exists in the Shop_Table, THEN THE Item_API SHALL return a JSON response containing `nextSku` set to 1
4. IF the caller is not authenticated via the Cognito authorizer, THEN THE Item_API SHALL return a 401 response
5. IF an unexpected error occurs while reading the Sequence_Counter, THEN THE Item_API SHALL return a 500 response with a generic error message and log the detailed error

### Requirement 10: Optional Item Fields

**User Story:** As a shop operator, I want flexibility in which fields I fill out, so that I can quickly create items with minimal information or provide full detail.

#### Acceptance Criteria

1. WHEN an item creation or update request omits `category`, THE Item_API SHALL store the item without a `category` attribute on the record
2. WHEN an item creation or update request omits `brand`, THE Item_API SHALL store the item without a `brand` attribute on the record
3. WHEN an item creation or update request omits `color`, THE Item_API SHALL store the item without a `color` attribute on the record
4. WHEN an item creation or update request omits `size`, THE Item_API SHALL store the item without a `size` attribute on the record
5. WHEN an item creation or update request omits `shelf`, THE Item_API SHALL store the item without a `shelf` attribute on the record
6. WHEN an item creation or update request omits `expirationDate`, THE Item_API SHALL store the item without an `expirationDate` attribute on the record
7. WHEN an item creation or update request omits `details`, THE Item_API SHALL store the item without a `details` attribute on the record
8. WHEN the `taxExempt` field is omitted, THE Item_API SHALL default the value to false
9. WHEN an item creation or update request provides an empty string for any optional field (`category`, `brand`, `color`, `size`, `shelf`, `details`), THE Item_API SHALL treat the field as omitted and not store the attribute on the record
10. WHEN an item creation or update request omits `description`, THE Item_API SHALL store the item without a `description` attribute on the record
11. WHEN an item creation or update request omits `tags`, THE Item_API SHALL store the item without a `tags` attribute on the record

### Requirement 11: Image Upload

**User Story:** As a shop operator, I want to attach images to items, so that I can visually identify inventory and present items to customers.

#### Acceptance Criteria

1. THE Item_Form SHALL provide an upload area that accepts image files (JPEG, PNG, WebP) up to 5 MB each
2. THE Item_Form SHALL allow uploading a maximum of 10 images per item
3. WHEN images are uploaded, THE Item_Form SHALL display thumbnail previews of each uploaded image within 2 seconds of the file being selected
4. THE Item_Form SHALL allow removing individual images before submission by providing a remove control on each thumbnail
5. WHEN an item is created or updated with images, THE Item_API SHALL store image references (S3 keys) as an ordered array attribute on the item record, preserving the display order set by the operator
6. IF an image file exceeds 5 MB, THEN THE Item_Form SHALL display an error message indicating the size limit without submitting the file and SHALL NOT discard other valid files selected in the same batch
7. IF an image file is not a supported format, THEN THE Item_Form SHALL display an error message indicating the accepted formats without submitting the file and SHALL NOT discard other valid files selected in the same batch
8. IF the operator selects files that would cause the total image count to exceed 10, THEN THE Item_Form SHALL reject the entire batch and display an error message indicating the maximum of 10 images per item
9. WHEN images are selected for upload, THE Item_Form SHALL upload each image to S3 via a presigned URL obtained from the Item_API and display an upload progress indicator per image
10. IF an image upload to S3 fails, THEN THE Item_Form SHALL display an error message on the affected thumbnail and allow the operator to retry the upload or remove the image

### Requirement 12: Items Table

**User Story:** As a shop operator, I want to see all items in a paginated table, so that I can browse, find, and manage inventory.

#### Acceptance Criteria

1. THE Items_Table SHALL display items in a table with columns: SKU, Title, Account, Category, Tag Price, Quantity, Inventory Type, and Actions
2. THE Items_Table SHALL display the SKU column as a plain numeric value (the item's shopUid)
3. WHEN items are loaded, THE Items_Table SHALL display the account name (resolved from the accountId) in the Account column
4. THE Items_Table SHALL display tag price formatted as CHF currency in the Tag Price column
5. THE Items_Table SHALL provide Edit and Delete action buttons in the Actions column for each row
6. WHEN the Edit action is clicked, THE Items_Table SHALL invoke the onEdit callback with the selected item
7. WHEN the Delete action is clicked, THE Items_Table SHALL invoke the onDelete callback with the selected item
8. WHILE items are loading, THE Items_Table SHALL display a loading indicator
9. IF the items fetch fails, THEN THE Items_Table SHALL display an error message with a Retry button
10. WHEN no items exist, THE Items_Table SHALL display an empty state message
11. THE Items_Table SHALL support cursor-based pagination with page sizes of 20, 50, or 100 using the Shared_Pagination_Controls component
12. THE Items_Table SHALL be accessible with proper ARIA labels on the table region, action buttons, and pagination controls

### Requirement 13: Items Page

**User Story:** As a shop operator, I want a dedicated page for item management, so that I can create, browse, edit, and delete items from a single view.

#### Acceptance Criteria

1. THE Items_Page SHALL replace the current placeholder inventory page and compose the Items_Table, an "Add Item" button, the Item_Form dialog, and a delete confirmation dialog
2. WHEN the "Add Item" button is clicked, THE Items_Page SHALL fetch the next available SKU and open the Item_Form in create mode
3. WHEN an edit action is triggered from the Items_Table, THE Items_Page SHALL open the Item_Form in edit mode populated with the selected item's data
4. WHEN a delete action is triggered from the Items_Table, THE Items_Page SHALL open a confirmation dialog displaying the item title and SKU
5. WHEN deletion is confirmed, THE Items_Page SHALL send a DELETE request to the Item_API and refresh the table on success
6. WHEN an item is successfully created or updated, THE Items_Page SHALL close the form dialog and refresh the table data
7. THE Items_Page SHALL manage pagination state (page size, cursor history, navigation) analogous to the accounts page pattern

### Requirement 14: Shared Data Table Component

**User Story:** As a developer, I want a reusable table component, so that both accounts and items tables share consistent structure and behavior without code duplication.

#### Acceptance Criteria

1. THE Shared_Data_Table SHALL accept column definitions, row data, loading state, error state, and callback props as generic typed parameters
2. THE Shared_Data_Table SHALL render table headers from column definitions using the TanStack Table library
3. THE Shared_Data_Table SHALL render table rows from data using the TanStack Table library
4. WHEN the loading prop is true, THE Shared_Data_Table SHALL display a centered loading message
5. WHEN the error prop is non-null, THE Shared_Data_Table SHALL display the error message with a Retry button that invokes the onRetry callback
6. WHEN the data array is empty and loading is false and error is null, THE Shared_Data_Table SHALL display an empty state message
7. THE Shared_Data_Table SHALL wrap the table in a region with an aria-label prop for accessibility
8. THE Shared_Data_Table SHALL be usable by both the AccountsTable and Items_Table components as a drop-in replacement for their current inline table rendering

### Requirement 15: Shared Pagination Controls Component

**User Story:** As a developer, I want a reusable pagination component, so that both accounts and items tables share consistent pagination behavior.

#### Acceptance Criteria

1. THE Shared_Pagination_Controls SHALL accept props for hasPrevious, hasMore, pageSize, onNext, onPrevious, onPageSizeChange, and disabled
2. THE Shared_Pagination_Controls SHALL render Previous and Next buttons that are disabled based on hasPrevious and hasMore respectively
3. THE Shared_Pagination_Controls SHALL render a page size selector with options 20, 50, and 100
4. THE Shared_Pagination_Controls SHALL be importable from a shared location accessible to all feature modules
5. WHEN the Shared_Pagination_Controls component replaces the existing PaginationControls in the accounts feature, THE accounts pagination behavior SHALL remain unchanged
