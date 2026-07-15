# Requirements Document

## Introduction

This document specifies the requirements for backend Lambda route handlers supporting Sales and Employee endpoints in the shop-api project. The frontend application already makes calls to these endpoints but the Lambda router does not yet have handlers registered. The handlers follow the existing monolambda architecture with DynamoDB single-table design.

## Glossary

- **Router**: The central route dispatcher in `router.ts` that maps API Gateway route keys to handler functions
- **Handler**: An async function that receives an API Gateway event and returns an HTTP response
- **Sale**: A transaction record representing items sold to a customer, identified by UUID with a sequential sale number
- **Employee**: A staff member record used for cashier references on sales
- **Shop_Table**: The single DynamoDB table (`thymos-{environment}-shop`) storing all entities
- **GSI1**: Global Secondary Index with partition key `GSI1PK` and sort key `GSI1SK`, used for listing/ordering entities
- **Cursor**: An opaque base64url-encoded token representing a DynamoDB `LastEvaluatedKey` for pagination
- **Sequence_Counter**: A DynamoDB record (`PK: SEQUENCE#SALE`, `SK: COUNTER`) that tracks the next available sale number
- **Sale_Number**: A sequential integer auto-generated from the Sequence_Counter, used as the operator-facing identifier for sales

## Requirements

### Requirement 1: List Sales with Cursor Pagination

**User Story:** As a shop operator, I want to retrieve a paginated list of sales ordered by sale number, so that I can browse sales history efficiently.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/sales`, THE Handler SHALL query GSI1 with `GSI1PK = "SALES"` and return sale records ordered by `GSI1SK` in descending order (newest first)
2. WHEN a `pageSize` query parameter is provided, THE Handler SHALL limit results to the specified page size (one of 20, 50, or 100)
3. WHEN no `pageSize` query parameter is provided, THE Handler SHALL default to a page size of 20
4. WHEN a `pageSize` value is not one of 20, 50, or 100, THE Handler SHALL return HTTP 400 with error `"pageSize must be one of 20, 50, 100"`
5. WHEN a `cursor` query parameter is provided, THE Handler SHALL decode the cursor and use it as the DynamoDB `ExclusiveStartKey` for pagination
6. WHEN an invalid `cursor` value is provided, THE Handler SHALL return HTTP 400 with error `"Invalid cursor"`
7. THE Handler SHALL return HTTP 200 with a JSON body containing `sales` (array), `nextCursor` (string or null), and `hasMore` (boolean)
8. WHEN DynamoDB returns a `LastEvaluatedKey`, THE Handler SHALL encode it as a cursor in the `nextCursor` field and set `hasMore` to true
9. WHEN DynamoDB does not return a `LastEvaluatedKey`, THE Handler SHALL set `nextCursor` to null and `hasMore` to false

### Requirement 2: Get Next Sale Number

**User Story:** As a shop operator, I want to see the next available sale number before creating a sale, so that I can confirm the expected numbering.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/sales/next-number`, THE Handler SHALL read the current value from the Sequence_Counter record for sales
2. THE Handler SHALL return HTTP 200 with a JSON body containing `nextNumber` set to the current counter value plus one
3. WHEN the Sequence_Counter record does not exist, THE Handler SHALL return `nextNumber` as 1

### Requirement 3: Create a Sale

**User Story:** As a shop operator, I want to create a new sale record, so that I can record a transaction.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/sales` with a valid JSON body, THE Handler SHALL create a new Sale record in the Shop_Table
2. THE Handler SHALL generate a v4 UUID for the new sale
3. THE Handler SHALL auto-generate the sale number by atomically incrementing the Sequence_Counter using a DynamoDB conditional expression
4. THE Handler SHALL store the sale with `PK: "SALE#<uuid>"`, `SK: "METADATA"`, `GSI1PK: "SALES"`, and `GSI1SK: "SALE#<zero-padded-number>"`
5. THE Handler SHALL set `createdAt` to the current UTC ISO 8601 timestamp
6. THE Handler SHALL validate that `status` is one of `"open"`, `"finalized"`, or `"voided"`
7. THE Handler SHALL validate that `cashierId` is a non-empty string
8. IF the request body is not valid JSON, THEN THE Handler SHALL return HTTP 400 with error `"invalid_json"`
9. IF required fields are missing or invalid, THEN THE Handler SHALL return HTTP 400 with error `"validation_error"` and a `fields` array describing each violation
10. THE Handler SHALL return HTTP 201 with the created sale record on success
11. IF a UUID collision occurs during the DynamoDB transaction, THEN THE Handler SHALL retry with a new UUID up to 3 times

### Requirement 4: Update a Sale

**User Story:** As a shop operator, I want to update an existing sale, so that I can modify its status, memo, or financial fields.

#### Acceptance Criteria

1. WHEN a PUT request is received at `/api/sales/{uuid}`, THE Handler SHALL update the Sale record identified by the UUID path parameter
2. THE Handler SHALL update only the provided fields: `status`, `cashierId`, `subtotal`, `total`, `storePortion`, `consignorPortion`, `change`, `memo`, `finalizedAt`, `voidedAt`
3. THE Handler SHALL set `updatedAt` to the current UTC ISO 8601 timestamp on every update
4. THE Handler SHALL validate that `status` (if provided) is one of `"open"`, `"finalized"`, or `"voided"`
5. IF the UUID path parameter is missing, THEN THE Handler SHALL return HTTP 400 with error `"missing_uuid"`
6. IF the sale record does not exist, THEN THE Handler SHALL return HTTP 404 with error `"not_found"`
7. IF the request body is not valid JSON, THEN THE Handler SHALL return HTTP 400 with error `"invalid_json"`
8. THE Handler SHALL return HTTP 200 with the updated sale record on success

### Requirement 5: Delete a Sale

**User Story:** As a shop operator, I want to delete a sale record, so that I can remove erroneous entries.

#### Acceptance Criteria

1. WHEN a DELETE request is received at `/api/sales/{uuid}`, THE Handler SHALL delete the Sale record identified by the UUID path parameter
2. THE Handler SHALL delete all related records under the same PK (METADATA and any LINE_ITEM# sort keys)
3. IF the UUID path parameter is missing, THEN THE Handler SHALL return HTTP 400 with error `"missing_uuid"`
4. IF the sale record does not exist, THEN THE Handler SHALL return HTTP 404 with error `"not_found"`
5. THE Handler SHALL return HTTP 204 with an empty body on success

### Requirement 6: Get Single Employee

**User Story:** As the frontend application, I want to fetch a single employee by UUID, so that I can display cashier details on sales.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/employees/{uuid}`, THE Handler SHALL retrieve the Employee record with `PK: "EMPLOYEE#<uuid>"` and `SK: "METADATA"` from the Shop_Table
2. THE Handler SHALL return HTTP 200 with the employee record containing `uuid`, `name`, `sourceId`, `createdAt`, and `updatedAt`
3. IF the UUID path parameter is missing, THEN THE Handler SHALL return HTTP 400 with error `"missing_uuid"`
4. IF the employee record does not exist, THEN THE Handler SHALL return HTTP 404 with error `"not_found"`

### Requirement 7: Batch Get Employees

**User Story:** As the frontend application, I want to fetch multiple employees in a single request, so that I can efficiently resolve cashier names for a list of sales.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/employees/batch` with a JSON body containing a `uuids` array, THE Handler SHALL retrieve all matching Employee records from the Shop_Table using a DynamoDB BatchGetItem operation
2. THE Handler SHALL return HTTP 200 with an `employees` array containing matching records (each with `uuid`, `name`, `sourceId`, `createdAt`, `updatedAt`)
3. WHEN a UUID in the request has no matching employee record, THE Handler SHALL omit it from the response array (no error)
4. IF the request body is not valid JSON, THEN THE Handler SHALL return HTTP 400 with error `"invalid_json"`
5. IF the `uuids` field is missing or not an array, THEN THE Handler SHALL return HTTP 400 with error `"validation_error"`
6. IF the `uuids` array is empty, THEN THE Handler SHALL return HTTP 200 with an empty `employees` array
7. IF the `uuids` array exceeds 100 items, THEN THE Handler SHALL return HTTP 400 with error `"too_many_uuids"`

### Requirement 8: Route Registration

**User Story:** As a developer, I want all new endpoint handlers registered in the router, so that the Lambda can dispatch requests to the correct handler functions.

#### Acceptance Criteria

1. THE Router SHALL register the route key `"GET /api/sales"` mapped to the list-sales handler
2. THE Router SHALL register the route key `"GET /api/sales/next-number"` mapped to the next-sale-number handler
3. THE Router SHALL register the route key `"POST /api/sales"` mapped to the create-sale handler
4. THE Router SHALL register the route key `"PUT /api/sales/{uuid}"` mapped to the update-sale handler
5. THE Router SHALL register the route key `"DELETE /api/sales/{uuid}"` mapped to the delete-sale handler
6. THE Router SHALL register the route key `"GET /api/employees/{uuid}"` mapped to the get-employee handler
7. THE Router SHALL register the route key `"POST /api/employees/batch"` mapped to the batch-get-employees handler
