# Requirements Document

## Introduction

This feature adds a Sales table view to the shop application, establishes a shared user-detail panel for displaying linked user information across all entity tables, and ensures consistency across the three main entity views (Accounts, Items, Sales). The Sales table provides full CRUD operations with cursor-based pagination. Where entities reference users (Employee records via `createdBy`, `cashierId`), the UI shows a clickable username that reveals a slide-over detail panel.

Reference: #[[file:../../docs/data-model.md]]

## Glossary

- **Sales_Page**: The protected page component that displays the Sales data table with CRUD operations.
- **Sales_Table**: The data table component rendered on the Sales_Page that lists sales with paginated rows and action buttons.
- **Sale**: A transaction entity representing a point-of-sale event, containing line items, totals, and a status lifecycle (open → finalized / voided).
- **Sale_Line_Item**: A child record of a Sale representing a single item sold, with price and portion breakdown at time of sale.
- **Sale_Form**: The dialog form component used to create or edit a sale.
- **Delete_Sale_Dialog**: The confirmation dialog for deleting/voiding a sale.
- **User_Detail_Panel**: A slide-over Sheet panel that displays extended information about a linked user (Employee or Account) when their name is clicked in any table.
- **Linked_User**: A reference to an Employee or Account entity displayed as a clickable username in a table cell.
- **PageSize**: The shared pagination size type (20 | 50 | 100) used consistently across all table views.
- **Cursor_Pagination**: The pagination strategy using opaque cursor tokens for navigating through pages without offset-based counting.

## Requirements

### Requirement 1: Sales Page Navigation

**User Story:** As a shop user, I want to access the Sales page from the main navigation, so that I can view and manage sales transactions.

#### Acceptance Criteria

1. THE Sales_Page SHALL be accessible at the `/sales` route, nested under the authenticated layout so that unauthenticated users are redirected to `/login`.
2. THE Sales_Page SHALL appear in the application navigation menu with a lucide-react icon and the label "Sales", positioned between "Accounts" and "Help".
3. WHEN the user navigates to `/sales`, THE Sales_Page SHALL render the Sales_Table.
4. IF an unauthenticated user attempts to access `/sales`, THEN THE application SHALL redirect the user to `/login` without rendering the Sales_Page.

### Requirement 2: Sales Data Table Display

**User Story:** As a shop user, I want to see a paginated table of sales with their key details, so that I can review transaction history.

#### Acceptance Criteria

1. THE Sales_Table SHALL display columns in the following order: Sale # (number), Status, Cashier, Total (CHF), Finalized At, Actions.
2. THE Sales_Table SHALL display the Sale number as a plain integer (no zero-padding).
3. THE Sales_Table SHALL display the Status column using a visual badge/chip with distinct styling per status value: "open" (neutral), "finalized" (success/green), "voided" (destructive/red).
4. THE Sales_Table SHALL display the Cashier column as a clickable username (Employee name). If the employee name cannot be resolved, display "Unknown".
5. THE Sales_Table SHALL display the Total column formatted as CHF with two decimal places (e.g., "CHF 42.50"), converting from cents storage to display value.
6. THE Sales_Table SHALL display the Finalized At column as a formatted date-time string, or "—" if the sale has not been finalized.
7. THE Sales_Table SHALL use cursor-based pagination with the shared PageSize type (20 | 50 | 100), matching the Accounts and Items tables.
8. WHILE the Sales_Table is loading data, THE Sales_Table SHALL display a loading indicator.
9. IF the sales data request fails, THEN THE Sales_Table SHALL display an error message with a retry button.
10. WHEN the sales data request returns zero sales, THE Sales_Table SHALL display an empty state message "No sales found."

### Requirement 3: Sales CRUD Operations

**User Story:** As a shop user, I want to create, edit, and delete sales, so that I can manage the transaction lifecycle.

#### Acceptance Criteria

1. THE Sales_Page SHALL provide an "Add Sale" button that opens the Sale_Form in a modal dialog for creating a new sale.
2. THE Sales_Table SHALL provide an edit action button on each row that opens the Sale_Form pre-populated with the sale's current data.
3. THE Sales_Table SHALL provide a delete action button on each row that opens the Delete_Sale_Dialog.
4. WHEN the Sale_Form is submitted successfully (create or edit), THE Sales_Page SHALL close the form, refresh the table data, and return focus to the triggering action.
5. WHEN the Delete_Sale_Dialog confirms deletion successfully, THE Sales_Page SHALL close the dialog, refresh the table data, and return focus appropriately.
6. THE Sale_Form SHALL display input fields for: cashier (Employee selection), memo (optional), and line items (item selection with quantity).
7. THE Sale_Form SHALL validate required fields before submission and display accessible error messages.
8. THE Delete_Sale_Dialog SHALL display the sale number and status, and warn that the action cannot be undone.

### Requirement 4: User Detail Panel (Sheet)

**User Story:** As a shop user, I want to click on a linked username in any table to see their full details in a side panel, so that I can quickly review user information without leaving the current view.

#### Acceptance Criteria

1. WHEN the user clicks a Linked_User name in any table (Cashier in Sales, CreatedBy in Items), THE User_Detail_Panel SHALL slide in from the right side of the screen.
2. THE User_Detail_Panel SHALL display the Employee's name, source ID, creation date, and any other available attributes.
3. THE User_Detail_Panel SHALL NOT obscure the full table — it overlays the right portion of the screen while the table remains visible on the left.
4. THE User_Detail_Panel SHALL provide a close button and support closing via Escape key.
5. THE User_Detail_Panel SHALL show a loading state while fetching employee details.
6. IF the employee data cannot be loaded, THE User_Detail_Panel SHALL display an error message.
7. THE User_Detail_Panel SHALL be a shared component reusable across all feature tables (Accounts, Items, Sales).

### Requirement 5: Consistency Across Table Views

**User Story:** As a developer, I want all three table views (Accounts, Items, Sales) to follow the same structural pattern, so that the codebase is maintainable and predictable.

#### Acceptance Criteria

1. ALL table views SHALL use the shared `PageSize` type exported from a single location (`@/lib/pagination-types.ts`), eliminating duplicate type definitions.
2. ALL table views SHALL compose the shared `DataTable` component with feature-specific column definitions and the shared `PaginationControls` component.
3. ALL table views SHALL follow the same file structure pattern: `*-types.ts`, `*-api.ts`, `use-paginated-*.ts`, `*-columns.tsx`, `*-table.tsx`, `*-page.tsx`, `*-form.tsx`, `delete-*-dialog.tsx`.
4. ALL pagination hooks SHALL use the same cursor-based pattern with page caching, abort controllers, and retry logic.
5. ALL page components SHALL follow the same layout: page title + "Add" button in a header row, memoized table below, form dialog and delete dialog managed by page state.
6. ALL action columns SHALL use the same icon buttons (Pencil for edit, Trash2 for delete) with consistent styling and ARIA labels.
7. THE Accounts and Items feature modules SHALL be updated to import `PageSize` from the shared location instead of defining it locally.

### Requirement 6: Items Table — Show CreatedBy as Username

**User Story:** As a shop user, I want to see which employee created each item, displayed as a clickable name, so that I can trace item provenance.

#### Acceptance Criteria

1. THE Item type interface SHALL include `createdBy` (string, Employee UUID) and `categoryId` (string, Category UUID) fields matching the data model.
2. THE Items_Table SHALL display a "Created By" column showing the Employee name resolved from the `createdBy` UUID.
3. THE "Created By" column cell SHALL be clickable, opening the User_Detail_Panel with the employee's details.
4. IF the employee name cannot be resolved, THE Items_Table SHALL display "Unknown" in the Created By column.

### Requirement 7: Accessibility

**User Story:** As a user relying on assistive technology, I want the Sales page and user detail panel to be fully accessible.

#### Acceptance Criteria

1. THE Sales_Table SHALL use proper table semantics with column headers marked using `scope="col"`.
2. THE Sale_Form SHALL associate each input field with a visible label element using `for`/`id` pairing.
3. WHEN a validation error is displayed, THE Sale_Form SHALL set `aria-invalid="true"` on the corresponding input and link the error message via `aria-describedby`.
4. THE User_Detail_Panel SHALL trap focus within the panel while open and return focus to the triggering element on close.
5. THE User_Detail_Panel SHALL have `role="dialog"` and an accessible title via `aria-labelledby`.
6. ALL clickable username links SHALL be keyboard-accessible and have descriptive `aria-label` text (e.g., "View details for {name}").
