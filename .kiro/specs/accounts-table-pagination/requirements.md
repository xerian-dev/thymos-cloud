# Requirements Document

## Introduction

This feature converts the existing accounts table from client-side data loading and sorting to server-side pagination and sorting. The accounts table currently fetches all accounts in a single API call and performs sorting in the browser. This change introduces paginated data fetching with configurable page sizes (20, 50, 100), server-side column sorting, and automatic page reset when sort parameters change.

## Glossary

- **Accounts_Table**: The React table component displaying account records, built with TanStack Table and rendered on the accounts page
- **Pagination_API**: The server endpoint that accepts pagination and sorting parameters and returns a page of account records along with total count metadata
- **Page_Size**: The number of account records displayed per page (valid values: 20, 50, 100)
- **Sort_Parameter**: A combination of a column identifier and sort direction (ascending or descending) sent to the server
- **Pagination_State**: The current page index, page size, sort column, and sort direction maintained by the client
- **Pagination_Controls**: The UI elements that allow users to navigate between pages and change page size

## Requirements

### Requirement 1: Server-Side Paginated Data Fetching

**User Story:** As an admin, I want the accounts table to load data one page at a time from the server, so that the page loads quickly even with a large number of accounts.

#### Acceptance Criteria

1. WHEN the accounts page is loaded, THE Accounts_Table SHALL request the first page of accounts from the Pagination_API with the default page size of 20
2. WHEN a user navigates to a specific page, THE Accounts_Table SHALL request that page of accounts from the Pagination_API using the current page size and sort parameters
3. THE Pagination_API SHALL accept query parameters for page index, page size, sort column, and sort direction
4. THE Pagination_API SHALL return the requested page of account records and the total number of accounts
5. WHILE the Accounts_Table is fetching a page, THE Accounts_Table SHALL display a loading indicator
6. IF the Pagination_API returns an error, THEN THE Accounts_Table SHALL display an error message with a retry option

### Requirement 2: Page Size Selection

**User Story:** As an admin, I want to choose how many accounts I see per page, so that I can adjust the view to my preference.

#### Acceptance Criteria

1. THE Pagination_Controls SHALL offer page size options of 20, 50, and 100 records per page
2. WHEN the accounts page is first loaded, THE Pagination_Controls SHALL use a default page size of 20
3. WHEN the user selects a different page size, THE Accounts_Table SHALL reset to the first page and fetch data using the new page size
4. WHEN the user selects a different page size, THE Pagination_Controls SHALL visually reflect the selected page size

### Requirement 3: Page Navigation

**User Story:** As an admin, I want to navigate between pages of accounts, so that I can browse through all account records.

#### Acceptance Criteria

1. THE Pagination_Controls SHALL display the current page number and total number of pages
2. THE Pagination_Controls SHALL provide buttons to navigate to the previous page and next page
3. WHILE the current page is the first page, THE Pagination_Controls SHALL disable the previous page button
4. WHILE the current page is the last page, THE Pagination_Controls SHALL disable the next page button
5. WHEN the user clicks the next page button, THE Accounts_Table SHALL fetch and display the next page of accounts
6. WHEN the user clicks the previous page button, THE Accounts_Table SHALL fetch and display the previous page of accounts

### Requirement 4: Server-Side Column Sorting

**User Story:** As an admin, I want to sort the accounts table by any column and have the server perform the sorting, so that sort results are consistent and correct across all records, not just the current page.

#### Acceptance Criteria

1. WHEN a user clicks a sortable column header, THE Accounts_Table SHALL send the sort column and sort direction to the Pagination_API
2. WHEN a user clicks a column header that is not currently sorted, THE Accounts_Table SHALL sort that column in ascending order
3. WHEN a user clicks a column header that is currently sorted ascending, THE Accounts_Table SHALL sort that column in descending order
4. WHEN a user clicks a column header that is currently sorted descending, THE Accounts_Table SHALL remove the sort from that column
5. THE Accounts_Table SHALL support sorting on one column at a time (single-sort mode)
6. THE Accounts_Table SHALL display a visual indicator showing the current sort column and direction

### Requirement 5: Sort Change Resets Page

**User Story:** As an admin, I want the table to reset to the first page when I change the sort, so that I see the top results for my new sort order.

#### Acceptance Criteria

1. WHEN the user changes the sort column, THE Accounts_Table SHALL reset the current page to the first page
2. WHEN the user changes the sort direction, THE Accounts_Table SHALL reset the current page to the first page
3. WHEN the sort is reset to the first page, THE Accounts_Table SHALL fetch data from the Pagination_API with page index 0 and the new sort parameters

### Requirement 6: Accessibility of Pagination Controls

**User Story:** As a user relying on assistive technology, I want the pagination controls to be fully accessible, so that I can navigate accounts using a keyboard or screen reader.

#### Acceptance Criteria

1. THE Pagination_Controls SHALL be operable using keyboard navigation alone
2. THE Pagination_Controls SHALL use appropriate ARIA attributes to convey the current page, total pages, and disabled states to screen readers
3. WHEN a page navigation completes, THE Accounts_Table SHALL move focus to the table region so screen reader users are aware of the content update
4. THE page size selector SHALL be labeled with a visible label or accessible name describing its purpose
