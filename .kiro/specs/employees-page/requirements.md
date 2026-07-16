# Requirements Document

## Introduction

The Employees Page feature adds a read-only UI page for viewing employees in the shop admin interface. Employees are auto-created by the import stream sync pipeline and cannot be manually created, edited, or deleted. This page provides operators with visibility into which employees exist in the system, following the same patterns established by the Accounts page (paginated table with cursor-based navigation).

The feature requires a new backend API endpoint for listing employees with pagination, a new DynamoDB GSI to support efficient querying of all employees, and a frontend page with table display and navigation integration.

## Glossary

- **Employees_Page**: The React frontend page component that displays a paginated table of employees
- **List_Employees_Endpoint**: The backend Lambda route handler that returns paginated employee records
- **Employee**: A person record with uuid, name, sourceId, createdAt, and updatedAt attributes, created automatically during item import
- **GSI2**: A new Global Secondary Index on the DynamoDB table used to query all employees with cursor-based pagination
- **Cursor**: An opaque, base64-encoded string representing the last evaluated key for DynamoDB pagination
- **Page_Size**: The number of records returned per page (20, 50, or 100)

## Requirements

### Requirement 1: List Employees API Endpoint

**User Story:** As a shop operator, I want to retrieve a paginated list of employees from the API, so that the frontend can display them in a table.

#### Acceptance Criteria

1. WHEN a GET request is sent to `/api/employees`, THE List_Employees_Endpoint SHALL return a JSON response containing an array of Employee records, a nextCursor string or null, and a hasMore boolean
2. WHEN a `pageSize` query parameter is provided with a value of 20, 50, or 100, THE List_Employees_Endpoint SHALL return at most that number of Employee records
3. WHEN no `pageSize` query parameter is provided, THE List_Employees_Endpoint SHALL default to returning at most 20 Employee records
4. WHEN an invalid `pageSize` value is provided, THE List_Employees_Endpoint SHALL return a 400 status with an error message stating the allowed values
5. WHEN a valid `cursor` query parameter is provided, THE List_Employees_Endpoint SHALL return Employee records starting after the position encoded in the cursor
6. WHEN an invalid `cursor` query parameter is provided, THE List_Employees_Endpoint SHALL return a 400 status with an error message
7. WHEN more Employee records exist beyond the current page, THE List_Employees_Endpoint SHALL return a non-null nextCursor value and hasMore as true
8. WHEN no more Employee records exist beyond the current page, THE List_Employees_Endpoint SHALL return nextCursor as null and hasMore as false
9. THE List_Employees_Endpoint SHALL return each Employee record with the fields: uuid, name, sourceId, createdAt, and updatedAt
10. THE List_Employees_Endpoint SHALL require a valid authorization token (same as existing routes)

### Requirement 2: DynamoDB Access Pattern for Employee Listing

**User Story:** As a system designer, I want employees to be efficiently queryable as a collection, so that the list endpoint performs well without scanning the entire table.

#### Acceptance Criteria

1. THE Employee records SHALL include GSI2PK set to `EMPLOYEES` and GSI2SK set to `EMPLOYEE#<uuid>` to support collection queries
2. WHEN the List_Employees_Endpoint queries employees, THE List_Employees_Endpoint SHALL use the GSI2 index with a key condition on GSI2PK equal to `EMPLOYEES`
3. THE DynamoDB table SHALL have a Global Secondary Index named `GSI2` with hash key `GSI2PK` and range key `GSI2SK` with ALL projection
4. WHEN existing Employee records do not have GSI2 attributes, THE system SHALL include a one-time backfill to add GSI2PK and GSI2SK to all existing Employee records

### Requirement 3: Employees Page UI

**User Story:** As a shop operator, I want to view all employees in a paginated table, so that I can see who is registered in the system.

#### Acceptance Criteria

1. THE Employees_Page SHALL display a table with columns: Name, Source ID, and Created At
2. THE Employees_Page SHALL display the page heading "Employees"
3. WHILE employee data is loading, THE Employees_Page SHALL display a loading state
4. IF the API request fails, THEN THE Employees_Page SHALL display an error message with a retry button
5. THE Employees_Page SHALL NOT display any create, edit, or delete action controls
6. THE Employees_Page SHALL be accessible with proper ARIA table semantics and keyboard navigation

### Requirement 4: Pagination Controls

**User Story:** As a shop operator, I want to navigate through pages of employees and adjust the page size, so that I can browse all employees efficiently.

#### Acceptance Criteria

1. WHEN more employees exist beyond the current page, THE Employees_Page SHALL display an enabled "Next" button
2. WHEN the operator is on a page after the first page, THE Employees_Page SHALL display an enabled "Previous" button
3. WHEN the operator clicks the "Next" button, THE Employees_Page SHALL fetch and display the next page of employees
4. WHEN the operator clicks the "Previous" button, THE Employees_Page SHALL display the previously viewed page of employees from cache
5. THE Employees_Page SHALL display a page size selector with options 20, 50, and 100
6. WHEN the operator changes the page size, THE Employees_Page SHALL reset to the first page and fetch employees with the new page size

### Requirement 5: Frontend Navigation Integration

**User Story:** As a shop operator, I want to access the Employees page from the navigation menu, so that I can find it alongside other admin pages.

#### Acceptance Criteria

1. THE navigation menu SHALL include an "Employees" entry with an appropriate icon
2. WHEN the operator clicks the "Employees" navigation entry, THE application SHALL navigate to the `/employees` route
3. THE "Employees" navigation entry SHALL be positioned after "Accounts" and before "Sales" in the menu order
4. WHILE the operator is on the Employees page, THE navigation menu SHALL visually indicate the "Employees" entry as the active page

### Requirement 6: API Gateway Route Configuration

**User Story:** As a system administrator, I want the employees list endpoint registered in API Gateway, so that requests are routed to the Lambda handler with proper authorization.

#### Acceptance Criteria

1. THE API Gateway SHALL have a route with key `GET /api/employees` pointing to the monolambda integration
2. THE `GET /api/employees` route SHALL use the same CUSTOM authorization type and Cognito authorizer as existing routes
3. THE Lambda router SHALL map the `GET /api/employees` route key to the list employees handler function
