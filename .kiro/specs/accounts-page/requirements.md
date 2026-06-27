# Requirements Document

## Introduction

This feature adds an "Accounts" page to the shop application, providing a data table of consigner accounts with sorting, viewing, and creation capabilities. Each account is a "shop entity" stored in a single DynamoDB table using single-table design. Accounts have a 7-digit shop UID (left-padded with zeros), a name, address, telephone number, comments, and tags. Comments and tags are modeled as reusable patterns shared across all shop entity types, stored as separate items within the same table using sort key patterns.

## Glossary

- **Accounts_Page**: The protected page component that displays the accounts data table and provides access to account creation.
- **Accounts_Table**: The data table component rendered on the Accounts_Page that lists consigner accounts with sortable columns.
- **Account**: A shop entity representing a consigner account, consisting of a shop UID, name, address, telephone number, comments, and tags.
- **Shop_UID**: A 7-digit natural number that uniquely identifies a shop entity, displayed left-padded with zeros (e.g., `0000042`).
- **Shop_Entity**: A domain object stored in the shared DynamoDB table. Account is a shop entity; future entity types will share the same table and reusable patterns.
- **Account_Form**: The form component used to create a new account with input validation.
- **DynamoDB_Table**: The single AWS DynamoDB table storing all shop entities using single-table design with composite keys.
- **Comment**: A timestamped text note attached to a shop entity, stored as a separate DynamoDB item with sort key pattern `COMMENT#<timestamp>`.
- **Tag**: A label attached to a shop entity, stored as a separate DynamoDB item with sort key pattern `TAG#<tag-name>`.
- **UUID**: A universally unique identifier assigned to each account, used as the internal primary key but not displayed in the table by default.

## Requirements

### Requirement 1: Accounts Page Navigation

**User Story:** As a shop user, I want to access the Accounts page from the main navigation, so that I can view and manage consigner accounts.

#### Acceptance Criteria

1. THE Accounts_Page SHALL be accessible at the `/accounts` route, nested under the authenticated layout so that unauthenticated users are redirected to `/login`.
2. THE Accounts_Page SHALL appear in the application navigation menu with a lucide-react icon and the label "Accounts".
3. WHEN the user navigates to `/accounts`, THE Accounts_Page SHALL render the Accounts_Table.
4. IF an unauthenticated user attempts to access `/accounts`, THEN THE application SHALL redirect the user to `/login` without rendering the Accounts_Page.

### Requirement 2: Accounts Data Table Display

**User Story:** As a shop user, I want to see a table of all consigner accounts with their key details, so that I can quickly find and review account information.

#### Acceptance Criteria

1. THE Accounts_Table SHALL display columns in the following order: account number, name, address, telephone number, comments, and tags.
2. THE Accounts_Table SHALL NOT display the UUID column by default.
3. THE Accounts_Table SHALL display the account number as a 7-digit string left-padded with zeros.
4. THE Accounts_Table SHALL display the comments column as a numeric count of comments associated with the account, showing "0" when no comments exist.
5. THE Accounts_Table SHALL display the tags column as a comma-separated list of tag labels, showing an empty cell when no tags exist.
6. WHILE the Accounts_Table is loading account data, THE Accounts_Table SHALL display a loading indicator in place of the table rows.
7. IF the account data request fails, THEN THE Accounts_Table SHALL display an error message indicating the data could not be loaded.
8. WHEN the account data request returns zero accounts, THE Accounts_Table SHALL display the column headers and a message indicating no accounts exist.

### Requirement 3: Accounts Table Sorting

**User Story:** As a shop user, I want to sort the accounts table by specific columns, so that I can organize the data in a way that helps me find what I need.

#### Acceptance Criteria

1. THE Accounts_Table SHALL support sorting on the account number column.
2. THE Accounts_Table SHALL support sorting on the name column.
3. THE Accounts_Table SHALL support sorting on the address column.
4. THE Accounts_Table SHALL support sorting on the telephone number column.
5. THE Accounts_Table SHALL NOT support sorting on the comments column.
6. THE Accounts_Table SHALL NOT support sorting on the tags column.
7. WHEN the user clicks a sortable column header that is not currently sorted, THE Accounts_Table SHALL sort rows by that column in ascending order and clear any previous sort.
8. WHEN the user clicks the currently sorted column header, THE Accounts_Table SHALL toggle the sort direction between ascending and descending for that column.
9. WHEN sorting is active, THE Accounts_Table SHALL display a visual sort direction indicator on the sorted column header.
10. THE Accounts_Table SHALL sort the account number column in numeric order and all other sortable columns in case-insensitive alphabetical order.

### Requirement 4: Account Creation Form Access

**User Story:** As a shop user, I want to add new consigner accounts, so that I can register new consigners in the system.

#### Acceptance Criteria

1. THE Accounts_Page SHALL provide an "Add Account" button that opens the Account_Form in a modal dialog.
2. THE Account_Form SHALL display input fields for: account number (max 7 digits), name (max 200 characters), address (max 500 characters), telephone number (max 30 characters).
3. WHEN the Account_Form is opened, THE Account_Form SHALL default the account number field to the next sequential Shop_UID value.
4. THE Account_Form SHALL allow the user to override the default account number value.
5. WHEN the user activates the cancel or close action on the Account_Form, THE Account_Form SHALL close the modal dialog without persisting any data.

### Requirement 5: Account Number Validation

**User Story:** As a shop user, I want the system to validate account numbers on creation, so that I cannot create accounts with invalid or duplicate identifiers.

#### Acceptance Criteria

1. WHEN the user submits the Account_Form, THE Account_Form SHALL validate that the account number is a natural number (positive integer with no fractional part) between 1 and 9999999 (inclusive), rejecting any value that contains decimal points, negative signs, or non-digit characters.
2. WHEN the user submits the Account_Form and the backend responds that the account number already exists, THE Account_Form SHALL display an error message indicating the account number is already in use and re-enable the form for correction.
3. WHEN the user submits the Account_Form with a non-integer, zero, or empty value for account number, THE Account_Form SHALL display a validation error before making any API call.
4. WHEN the account number input loses focus, THE Account_Form SHALL display the account number value formatted as a 7-digit string left-padded with zeros (e.g., input "42" displays as "0000042").

### Requirement 6: Account Form Input Validation

**User Story:** As a shop user, I want the account form to validate required fields, so that I cannot create incomplete accounts.

#### Acceptance Criteria

1. WHEN the user submits the Account_Form with an empty name field, THE Account_Form SHALL display a validation error indicating the name field is required.
2. THE Account_Form SHALL require the name field to contain at least one non-whitespace character and no more than 100 characters in total length.
3. THE Account_Form SHALL treat address and telephone number as optional fields that accept empty values without validation error.
4. WHEN validation errors exist, THE Account_Form SHALL NOT submit the data to the backend.
5. THE Account_Form SHALL visually indicate which fields are required before the user attempts submission.

### Requirement 7: Account Creation Submission

**User Story:** As a shop user, I want to submit valid account data and have it persisted, so that the new account appears in the accounts table.

#### Acceptance Criteria

1. WHEN the user submits the Account_Form with valid data, THE Account_Form SHALL send the account data to the backend for persistence.
2. WHILE the account creation request is in progress, THE Account_Form SHALL disable the submit button, disable all input fields, and display a loading indicator.
3. WHEN the account creation request succeeds, THE Accounts_Page SHALL close the Account_Form and refresh the Accounts_Table data so the newly created account is visible according to the current sort order.
4. IF the account creation request fails due to a network error, THEN THE Account_Form SHALL display an error message indicating the connection failed.
5. IF the account creation request fails due to a server error, THEN THE Account_Form SHALL display an error message indicating an unexpected failure occurred.
6. WHEN an error is displayed on the Account_Form, THE Account_Form SHALL preserve all field values, remove the loading indicator, and re-enable the submit button and all input fields for correction.
7. IF the account creation request does not receive a response within 30 seconds, THEN THE Account_Form SHALL treat the request as failed and display an error message indicating the request timed out.

### Requirement 8: DynamoDB Storage Design

**User Story:** As a developer, I want accounts stored in a single DynamoDB table using single-table design, so that related entities share infrastructure and access patterns are efficient.

#### Acceptance Criteria

1. THE DynamoDB_Table SHALL store account metadata with partition key `ACCOUNT#<Shop_UID>` (where Shop_UID is the 7-digit zero-padded representation) and sort key `METADATA`, containing attributes for name, address, telephone number, and UUID.
2. THE DynamoDB_Table SHALL store account comments with partition key `ACCOUNT#<Shop_UID>` and sort key `COMMENT#<timestamp>`, where timestamp is an ISO 8601 UTC string with millisecond precision (e.g., `2024-01-15T09:30:00.000Z`) ensuring lexicographic order equals chronological order.
3. THE DynamoDB_Table SHALL store account tags with partition key `ACCOUNT#<Shop_UID>` and sort key `TAG#<tag-name>`.
4. WHEN an account is created, THE DynamoDB_Table SHALL generate a version-4 UUID and store it in the account metadata item.
5. THE DynamoDB_Table SHALL enforce uniqueness of the Shop_UID across all accounts using a conditional write on the partition key.
6. IF a conditional write fails due to a duplicate Shop_UID, THEN THE DynamoDB_Table SHALL reject the write and return an error indicating the Shop_UID is already in use.

### Requirement 9: Shop UID Sequence Management

**User Story:** As a developer, I want the system to track the next available account number, so that new accounts default to a sequential identifier.

#### Acceptance Criteria

1. THE DynamoDB_Table SHALL maintain a sequence counter item with partition key `SEQUENCE#ACCOUNT` and sort key `COUNTER` that stores the next available Shop_UID for accounts, initialized to 1 when no accounts exist.
2. WHEN a new account is created with the default sequential Shop_UID, THE DynamoDB_Table SHALL atomically increment the sequence counter by 1.
3. WHEN a new account is created with a user-specified Shop_UID that exceeds the current sequence value, THE DynamoDB_Table SHALL update the sequence counter to one greater than the specified Shop_UID.
4. WHEN a new account is created with a user-specified Shop_UID that is less than or equal to the current sequence value, THE DynamoDB_Table SHALL NOT modify the sequence counter.
5. IF the sequence counter would exceed 9999999 after an increment or update, THEN THE DynamoDB_Table SHALL reject the account creation and return an error indicating the maximum account number has been reached.

### Requirement 10: Accessibility

**User Story:** As a user relying on assistive technology, I want the accounts page and form to be fully accessible, so that I can manage accounts using assistive devices.

#### Acceptance Criteria

1. THE Accounts_Table SHALL use proper table semantics with column headers marked using `scope="col"`.
2. WHEN sorting is applied to a column, THE Accounts_Table SHALL set `aria-sort="ascending"` or `aria-sort="descending"` on the sorted column header and `aria-sort="none"` on all other sortable column headers.
3. THE Account_Form SHALL associate each input field with a visible label element using the `for`/`id` attribute pairing.
4. WHEN a validation error is displayed, THE Account_Form SHALL set `aria-invalid="true"` on the corresponding input and link the error message via `aria-describedby`.
5. WHEN a validation error or submission error message appears, THE Account_Form SHALL mark the error text with `role="alert"` so assistive technologies announce the error immediately without requiring focus change.
6. THE Account_Form SHALL support keyboard navigation such that Tab moves focus forward through fields in document order, Shift+Tab moves focus backward, and Enter while focused on the submit button submits the form.
7. WHEN the Account_Form opens, THE Account_Form SHALL move focus to the first input field within 100ms.
8. WHEN the Account_Form is closed or submission succeeds, THE Accounts_Page SHALL return focus to the "Add Account" action that triggered the form.
9. WHILE the Account_Form or Accounts_Table is being navigated via keyboard, THE Accounts_Page SHALL display a visible focus indicator on the currently focused interactive element.
