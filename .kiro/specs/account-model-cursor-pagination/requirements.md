# Requirements Document

## Introduction

Refactor the accounts data model from a natural-key primary key (`ACCOUNT#<zero_padded_number>`) to a UUID-based primary key (`ACCOUNT#<uuid>`), add an overloaded GSI for cursor-based pagination sorted by account number, replace the backend full-table scan with a DynamoDB Query, and simplify the frontend by removing column sorting while retaining page-size selection.

## Glossary

- **Shop_Table**: The single-table DynamoDB table used by the shop application (resource name pattern: `{project}-{env}-shop`)
- **Account_Record**: A DynamoDB item representing an account entity, with `PK = "ACCOUNT#<uuid>"` and `SK = "METADATA"`
- **GSI1**: A Global Secondary Index on Shop_Table with partition key attribute `GSI1PK` and sort key attribute `GSI1SK`, used for entity listing and pagination access patterns
- **Cursor**: An opaque base64-encoded token representing the position of the last item returned in a paginated result set
- **Page_Size**: The number of Account_Records returned in a single paginated response; allowed values are 20, 50, or 100
- **Import_Process**: The Lambda function (`syncToShopTable`) that reads records from the import table and writes Account_Records to Shop_Table
- **List_Accounts_API**: The backend Lambda handler that serves paginated account lists to the frontend
- **Accounts_Page**: The React page component that renders the accounts table with pagination controls
- **shopUid**: A regular string attribute on Account_Record containing the zero-padded account number (business identifier, not a key)

## Requirements

### Requirement 1: UUID-Based Primary Key

**User Story:** As a developer, I want account records to use synthetic UUID-based primary keys, so that keys are immutable and decoupled from business-visible identifiers.

#### Acceptance Criteria

1. THE Import_Process SHALL write each Account_Record with `PK` set to `ACCOUNT#<uuid>` where `<uuid>` is a v4 UUID generated at creation time.
2. THE Import_Process SHALL write each Account_Record with `SK` set to the literal string `METADATA`.
3. THE Import_Process SHALL store the zero-padded account number as a regular attribute named `shopUid` on each Account_Record.
4. THE Import_Process SHALL generate a new UUID for each Account_Record that does not already exist in Shop_Table.
5. WHEN an Account_Record already exists in Shop_Table (matched via `sourceId`), THE Import_Process SHALL retain the existing `PK` value and update only mutable attributes.

### Requirement 2: Overloaded GSI for Pagination

**User Story:** As a developer, I want an overloaded GSI that supports listing accounts sorted by account number, so that cursor-based pagination can use an efficient Query operation.

#### Acceptance Criteria

1. THE Shop_Table SHALL have a Global Secondary Index named `GSI1` with partition key attribute `GSI1PK` (type String) and sort key attribute `GSI1SK` (type String).
2. THE Import_Process SHALL write `GSI1PK` with the value `ACCOUNT` on each Account_Record.
3. THE Import_Process SHALL write `GSI1SK` with the zero-padded account number string on each Account_Record.
4. THE GSI1 SHALL use projection type `ALL` to include all attributes in the index.

### Requirement 3: Cursor-Based Pagination API

**User Story:** As a frontend developer, I want the list-accounts API to return cursor-based pagination tokens, so that I can fetch sequential pages efficiently without scanning the entire table.

#### Acceptance Criteria

1. THE List_Accounts_API SHALL accept an optional query parameter `pageSize` with allowed values of 20, 50, or 100; defaulting to 20 when omitted.
2. THE List_Accounts_API SHALL accept an optional query parameter `cursor` containing a base64-encoded pagination token.
3. WHEN no `cursor` parameter is provided, THE List_Accounts_API SHALL return the first page of results sorted by account number ascending.
4. WHEN a valid `cursor` parameter is provided, THE List_Accounts_API SHALL return the next page of results starting after the position encoded in the cursor.
5. THE List_Accounts_API SHALL execute a DynamoDB Query on GSI1 with `GSI1PK = "ACCOUNT"` and `ScanIndexForward = true` to retrieve results.
6. THE List_Accounts_API SHALL return a JSON response containing an `accounts` array, a `nextCursor` field (string or null), and a `hasMore` boolean field.
7. WHEN the Query result contains a `LastEvaluatedKey`, THE List_Accounts_API SHALL encode that key as a base64 string and return it as `nextCursor` with `hasMore` set to true.
8. WHEN the Query result does not contain a `LastEvaluatedKey`, THE List_Accounts_API SHALL return `nextCursor` as null and `hasMore` as false.
9. IF an invalid `cursor` value is provided, THEN THE List_Accounts_API SHALL return HTTP 400 with an error message indicating the cursor is invalid.
10. IF an invalid `pageSize` value is provided, THEN THE List_Accounts_API SHALL return HTTP 400 with an error message indicating the allowed page sizes.
11. THE List_Accounts_API SHALL NOT accept `pageIndex`, `sortColumn`, or `sortDirection` query parameters.
12. THE List_Accounts_API SHALL NOT perform a full-table Scan operation.

### Requirement 4: Frontend Cursor-Based Pagination

**User Story:** As a user, I want to navigate through accounts page by page with Previous and Next buttons, so that I can browse accounts without waiting for the entire dataset to load.

#### Acceptance Criteria

1. THE Accounts_Page SHALL display a "Next" button that fetches the next page using the `nextCursor` token from the previous response.
2. THE Accounts_Page SHALL display a "Previous" button that navigates to the previously viewed page using cached data.
3. WHEN `hasMore` is false, THE Accounts_Page SHALL disable the "Next" button.
4. WHEN the user is on the first page, THE Accounts_Page SHALL disable the "Previous" button.
5. THE Accounts_Page SHALL cache previously fetched pages in memory to enable backward navigation without re-fetching.
6. WHEN the user clicks "Next" and the next page exists in the cache, THE Accounts_Page SHALL display the cached page without making an API request.
7. WHEN the user changes the page size, THE Accounts_Page SHALL clear the page cache and fetch the first page with the new page size.
8. THE Accounts_Page SHALL NOT display "Page X of Y" text (total count is unavailable with cursor-based pagination).

### Requirement 5: Page Size Selection

**User Story:** As a user, I want to choose how many accounts appear per page, so that I can balance information density with readability.

#### Acceptance Criteria

1. THE Accounts_Page SHALL display a page size selector with options 20, 50, and 100.
2. THE Accounts_Page SHALL default the page size to 20.
3. WHEN the user selects a different page size, THE Accounts_Page SHALL reset to the first page and fetch results with the selected page size.

### Requirement 6: Remove Column Sorting

**User Story:** As a developer, I want to remove column sort headers from the accounts table, so that the UI reflects the single sort order enforced by the GSI.

#### Acceptance Criteria

1. THE Accounts_Page SHALL display account data sorted by account number ascending (as returned by the API).
2. THE Accounts_Page SHALL NOT display sortable column headers or sort indicator icons.
3. THE Accounts_Page SHALL NOT send sort-related parameters to the List_Accounts_API.

### Requirement 7: Import Process Key Migration

**User Story:** As a developer, I want the import process to write the new key pattern and GSI attributes, so that re-importing data fully populates the new schema.

#### Acceptance Criteria

1. WHEN creating a new Account_Record, THE Import_Process SHALL generate a v4 UUID and use it to construct the `PK` as `ACCOUNT#<uuid>`.
2. WHEN creating a new Account_Record, THE Import_Process SHALL set `GSI1PK` to `ACCOUNT` and `GSI1SK` to the zero-padded account number string.
3. WHEN updating an existing Account_Record, THE Import_Process SHALL preserve the existing `PK`, `GSI1PK`, and `GSI1SK` values.
4. THE Import_Process SHALL continue to write the `sourceId` attribute for change-detection on subsequent imports.
5. THE Import_Process SHALL continue to write the `uuid` attribute with the same value used in the `PK` (without the `ACCOUNT#` prefix).

### Requirement 8: Infrastructure GSI Provisioning

**User Story:** As a developer, I want the Terraform configuration to declare GSI1 on the shop table, so that the index is available before application deployment.

#### Acceptance Criteria

1. THE Shop_Table Terraform resource SHALL declare a `global_secondary_index` block with name `GSI1`, hash key `GSI1PK`, range key `GSI1SK`, and projection type `ALL`.
2. THE Shop_Table Terraform resource SHALL declare `GSI1PK` and `GSI1SK` as String-type attributes.
3. THE Shop_Table Terraform resource SHALL retain the existing `sourceId-index` GSI unchanged.
