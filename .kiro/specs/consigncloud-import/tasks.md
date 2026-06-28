# Implementation Plan: ConsignCloud Import

## Overview

This plan implements the two-phase ConsignCloud import pipeline: a dedicated Import Lambda with two API routes (`POST /api/import/fetch` and `POST /api/import/sync`), infrastructure provisioning (DynamoDB import table, SSM parameter, IAM policies, API Gateway routes), and supporting modules (rate limiter, ConsignCloud API client, field mapper, import table client). The implementation uses the existing shop-api project structure with a separate esbuild entry point for the import handler.

## Tasks

- [x] 1. Infrastructure setup
  - [x] 1.1 Add DynamoDB import table and SSM parameter to Terraform
    - Add `aws_dynamodb_table.import` resource to `infrastructure/dynamodb.tf` with PAY_PER_REQUEST billing, PK (String hash key), SK (String range key)
    - Create `infrastructure/ssm.tf` with `aws_ssm_parameter.consigncloud_api_key` as SecureString at `/${var.project_name}/${var.environment}/consigncloud-api-key` with `lifecycle { ignore_changes = [value] }`
    - _Requirements: 5.1, 5.4_

  - [x] 1.2 Add Import Lambda IAM role and policies to Terraform
    - Add `aws_iam_role.shop_import_lambda` with Lambda assume role policy in `infrastructure/lambda.tf`
    - Add IAM policy for Import_Table read/write (GetItem, PutItem, UpdateItem, Query, Scan, BatchWriteItem)
    - Add IAM policy for Shop_Table read/write (GetItem, PutItem, UpdateItem, Query, Scan, TransactWriteItems)
    - Add IAM policy for SSM GetParameter on the consigncloud-api-key parameter ARN
    - Add IAM policy for CloudWatch Logs (CreateLogGroup, CreateLogStream, PutLogEvents)
    - _Requirements: 5.2, 5.3_

  - [x] 1.3 Add Import Lambda function and API Gateway routes to Terraform
    - Add `aws_lambda_function.shop_import` with 300s timeout, 256MB memory, handler `import-handler.handler`, environment variables: TABLE_NAME, IMPORT_TABLE_NAME, SSM_API_KEY_PATH, CONSIGNCLOUD_BASE_URL
    - Add `aws_apigatewayv2_integration.import_lambda` as AWS_PROXY integration
    - Add `aws_apigatewayv2_route.post_import_fetch` for `POST /api/import/fetch` with CUSTOM auth
    - Add `aws_apigatewayv2_route.post_import_sync` for `POST /api/import/sync` with CUSTOM auth
    - Add `aws_lambda_permission.shop_import_apigw` for API Gateway invocation
    - _Requirements: 5.5, 5.6, 5.7_

- [x] 2. Rate limiter module
  - [x] 2.1 Implement token bucket rate limiter
    - Create `projects/shop-api/src/import/rate-limiter.ts`
    - Export `RateLimiter` interface with `acquire(): Promise<void>` method
    - Export `RateLimiterConfig` interface with `capacity` (number) and `drainRate` (number) fields
    - Export `createRateLimiter(config: RateLimiterConfig): RateLimiter` factory function
    - Implement token bucket: track available tokens and last refill timestamp; `acquire()` returns immediately if token available, otherwise waits via setTimeout until a token drains back
    - _Requirements: 1.5_

  - [x] 2.2 Write property test for rate limiter (Property 2)
    - **Property 2: Rate limiter respects capacity and drain rate**
    - Create `projects/shop-api/src/import/__tests__/rate-limiter.property.test.ts`
    - Use fast-check to generate arbitrary sequences of acquire() calls and verify burst never exceeds capacity (100) and sustained throughput does not exceed drain rate (10/sec)
    - **Validates: Requirements 1.5**

  - [x] 2.3 Write unit tests for rate limiter
    - Create `projects/shop-api/src/import/__tests__/rate-limiter.test.ts`
    - Test: immediate acquisition when tokens available
    - Test: blocking when tokens exhausted
    - Test: token replenishment over time
    - _Requirements: 1.5_

- [x] 3. SSM client module
  - [x] 3.1 Implement SSM client for API key retrieval
    - Create `projects/shop-api/src/import/ssm-client.ts`
    - Add `@aws-sdk/client-ssm` dependency to `projects/shop-api/package.json`
    - Export `getConsignCloudApiKey(): Promise<string>` function
    - Read `SSM_API_KEY_PATH` from environment variable, call SSM GetParameter with `WithDecryption: true`
    - Throw descriptive error if parameter not found or value is empty
    - _Requirements: 1.1, 5.4_

  - [x] 3.2 Write unit tests for SSM client
    - Create `projects/shop-api/src/import/__tests__/ssm-client.test.ts`
    - Test: successful retrieval of API key
    - Test: throws error when parameter not found
    - Test: throws error when value is empty
    - _Requirements: 1.1, 5.4_

- [x] 4. ConsignCloud API client
  - [x] 4.1 Implement ConsignCloud API client with pagination and retry
    - Create `projects/shop-api/src/import/consigncloud-client.ts`
    - Export `ConsignCloudAccount` interface with all fields (id, number, first_name, last_name, company, email, balance, email_notifications_enabled, created, deleted)
    - Export `FetchPageResult` interface with `accounts` and `nextCursor`
    - Export `ConsignCloudClientConfig` interface with `apiKey`, `baseUrl`, `rateLimiter`
    - Implement `fetchAccountPage(config, cursor, limit): Promise<FetchPageResult>` — makes GET request with Bearer auth, `limit` and `cursor` query params; handles retries for 429/5xx with exponential backoff (max 3 retries, base 1s delay)
    - Implement `fetchAllAccounts(config): Promise<{ accounts, skipped }>` — paginates with limit=100, follows `next_cursor` until null, filters out soft-deleted records (non-null `deleted` field)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 1.8_

  - [x] 4.2 Write property test for pagination (Property 1)
    - **Property 1: Pagination follows cursors until termination**
    - Create `projects/shop-api/src/import/__tests__/consigncloud-client.property.test.ts`
    - Use fast-check to generate arbitrary page sequences with cursors; verify exactly N requests are made until null cursor, each request passes previous cursor
    - **Validates: Requirements 1.3, 1.4**

  - [x] 4.3 Write property test for soft-delete filtering (Property 3)
    - **Property 3: Soft-deleted accounts are excluded from import**
    - Add to `projects/shop-api/src/import/__tests__/consigncloud-client.property.test.ts`
    - Use fast-check to generate arbitrary lists of accounts with some deleted; verify output contains only non-deleted accounts in order
    - **Validates: Requirements 1.8**

  - [x] 4.4 Write unit tests for ConsignCloud client
    - Create `projects/shop-api/src/import/__tests__/consigncloud-client.test.ts`
    - Test: Bearer token is set in request headers
    - Test: limit=100 query parameter
    - Test: HTTP 429 triggers backoff and retry
    - Test: HTTP 5xx triggers up to 3 retries with exponential backoff
    - Test: HTTP 4xx (non-429) fails immediately without retry
    - Test: empty accounts array returns empty result
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 1.7_

- [x] 5. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Import table client
  - [x] 6.1 Implement Import_Table DynamoDB client
    - Create `projects/shop-api/src/import/import-table-client.ts`
    - Export `writeImportedAccounts(accounts: ConsignCloudAccount[], importedAt: string): Promise<void>` — uses BatchWriteItem (batches of 25), constructs PK as `IMPORT#CONSIGNCLOUD#{id}`, SK as `METADATA`, maps all raw fields plus `importedAt`
    - Export `writeSummaryRecord(summary: FetchResult): Promise<void>` — writes PK `IMPORT#CONSIGNCLOUD#SUMMARY`, SK `LATEST`
    - Export `scanImportedAccounts(): Promise<ImportedAccountRecord[]>` — scans Import_Table, filters out the SUMMARY record (PK starts with `IMPORT#CONSIGNCLOUD#SUMMARY`)
    - Export `writeSyncReport(report: ImportReport): Promise<void>` — writes PK `SYNC#REPORT`, SK as ISO timestamp of sync start
    - Read `IMPORT_TABLE_NAME` from environment variables
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.4_

  - [x] 6.2 Write property test for import record construction (Property 4)
    - **Property 4: Import record construction preserves all fields with correct keys**
    - Create `projects/shop-api/src/import/__tests__/import-table-client.property.test.ts`
    - Use fast-check to generate arbitrary ConsignCloudAccount objects and timestamps; verify PK format, SK value, all fields mapped correctly, importedAt matches
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [x] 6.3 Write unit tests for import table client
    - Create `projects/shop-api/src/import/__tests__/import-table-client.test.ts`
    - Test: writeImportedAccounts batches correctly (25 per batch)
    - Test: writeSummaryRecord writes correct PK/SK
    - Test: scanImportedAccounts excludes SUMMARY record
    - Test: writeSyncReport uses correct PK and ISO timestamp SK
    - Test: idempotent upsert (PutItem overwrites existing)
    - _Requirements: 2.1, 2.4, 2.5, 4.4_

- [x] 7. Field mapper
  - [x] 7.1 Implement field mapper module
    - Create `projects/shop-api/src/import/field-mapper.ts`
    - Export `MappedAccountFields` interface with `name`, `company`, `telephone`
    - Export `mapConsignCloudToShop(source: ConsignCloudAccount): MappedAccountFields` — concatenates `first_name` + " " + `last_name` (trimmed) as `name`, passes `company` through, uses `email` as `telephone`
    - Export `hasFieldChanges(existing, mapped): boolean` — returns true if any of (name, company, telephone) differ
    - _Requirements: 3.3, 3.4, 3.5_

  - [x] 7.2 Write property test for field mapping (Property 6)
    - **Property 6: Field mapping from ConsignCloud to Shop format**
    - Create `projects/shop-api/src/import/__tests__/field-mapper.property.test.ts`
    - Use fast-check to generate arbitrary first_name, last_name, company, email; verify name is trimmed concatenation, company passes through, telephone equals email
    - **Validates: Requirements 3.5**

  - [x] 7.3 Write property test for change detection (Property 7)
    - **Property 7: Change detection triggers update if and only if fields differ**
    - Add to `projects/shop-api/src/import/__tests__/field-mapper.property.test.ts`
    - Use fast-check to generate arbitrary existing/mapped field pairs; verify hasFieldChanges returns true iff at least one field differs, false when all identical
    - **Validates: Requirements 3.3, 3.4**

  - [x] 7.4 Write unit tests for field mapper
    - Create `projects/shop-api/src/import/__tests__/field-mapper.test.ts`
    - Test: basic name concatenation
    - Test: trimming of whitespace in names
    - Test: empty first or last name
    - Test: hasFieldChanges with identical fields returns false
    - Test: hasFieldChanges with one differing field returns true
    - _Requirements: 3.3, 3.4, 3.5_

- [x] 8. Fetch route handler
  - [x] 8.1 Implement fetch-from-consigncloud route handler
    - Create `projects/shop-api/src/import/fetch-from-consigncloud.ts`
    - Export `FetchResult` interface with status, totalFetched, skipped, stored, timestamp, error fields
    - Export `fetchFromConsignCloud(event): Promise<APIGatewayProxyResultV2>` function
    - Orchestrate: log start → get API key from SSM → create rate limiter (capacity: 100, drainRate: 10) → fetchAllAccounts → writeImportedAccounts → writeSummaryRecord → log completion → return JSON response
    - Handle non-retryable errors: log error, return 500 with descriptive message
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.2, 2.3, 2.5, 6.1, 6.2, 6.3_

  - [x] 8.2 Write property test for import summary counts (Property 5)
    - **Property 5: Import summary counts are accurate**
    - Create `projects/shop-api/src/import/__tests__/fetch-from-consigncloud.property.test.ts`
    - Use fast-check to generate arbitrary account lists with some deleted; verify totalFetched = N, skipped = S, stored = W, and W = N - S
    - **Validates: Requirements 2.5**

  - [x] 8.3 Write unit tests for fetch route handler
    - Create `projects/shop-api/src/import/__tests__/fetch-from-consigncloud.test.ts`
    - Test: successful fetch with multiple pages
    - Test: empty account set returns zero counts
    - Test: SSM failure returns 500 with descriptive error
    - Test: logging at start and end of execution
    - _Requirements: 1.1, 2.5, 6.1, 6.2_

- [x] 9. Sync route handler
  - [x] 9.1 Implement sync-to-shop-table route handler
    - Create `projects/shop-api/src/import/sync-to-shop-table.ts`
    - Export `ImportReport` and `ImportError` interfaces
    - Export `syncToShopTable(event): Promise<APIGatewayProxyResultV2>` function
    - Orchestrate: log start with record count → scanImportedAccounts → for each account sequentially: query Shop_Table by sourceId (Scan with filter), if not found → get sequence counter + TransactWriteItems (Put account + Update counter), if found with changes → UpdateItem, if found identical → skip; record outcome for each → writeSyncReport → log report summary → return Import_Report JSON
    - On individual record failure: record error, continue processing remaining records
    - On catastrophic failure: log error, produce partial report, return with error status
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 6.4, 6.5, 6.6_

  - [x] 9.2 Write property test for error resilience (Property 8)
    - **Property 8: Sync continues processing after individual record failures**
    - Create `projects/shop-api/src/import/__tests__/sync-to-shop-table.property.test.ts`
    - Use fast-check to generate N records with K failures; verify all N are attempted, errored = K, and added + updated + skipped + errored = N
    - **Validates: Requirements 3.7**

  - [x] 9.3 Write property test for report aggregation (Property 9)
    - **Property 9: Sync report accurately aggregates outcomes**
    - Add to `projects/shop-api/src/import/__tests__/sync-to-shop-table.property.test.ts`
    - Use fast-check to generate arbitrary sync outcomes (A added, U updated, S skipped, E errored); verify report fields match counts and errors array has exactly E entries with valid consignCloudId and non-empty message
    - **Validates: Requirements 4.1, 4.2**

  - [x] 9.4 Write unit tests for sync route handler
    - Create `projects/shop-api/src/import/__tests__/sync-to-shop-table.test.ts`
    - Test: new account creation with sequence counter increment
    - Test: existing account update when fields differ
    - Test: skip when fields are identical
    - Test: individual record failure recorded in report, processing continues
    - Test: summary record excluded from sync scan
    - Test: sync report written with correct PK/SK format
    - Test: logging at start and completion
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 4.1, 4.4_

- [x] 10. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Import handler entry point and esbuild configuration
  - [x] 11.1 Implement import-handler entry point with routing
    - Create `projects/shop-api/src/import-handler.ts`
    - Export `handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2>`
    - Route `POST /api/import/fetch` → `fetchFromConsignCloud`
    - Route `POST /api/import/sync` → `syncToShopTable`
    - Return 404 for unknown routes, 405 for wrong methods
    - _Requirements: 5.5, 5.6, 5.7_

  - [x] 11.2 Update esbuild configuration for import-handler entry point
    - Modify `projects/shop-api/esbuild.config.mjs` to add `src/import-handler.ts` to `entryPoints` array
    - Add zip command: `zip -j import-handler.zip import-handler.js`
    - Update completion message to include `dist/import-handler.zip`
    - _Requirements: 5.5_

  - [x] 11.3 Write unit tests for import-handler routing
    - Create `projects/shop-api/src/import/__tests__/import-handler.test.ts`
    - Test: POST /api/import/fetch routes to fetchFromConsignCloud
    - Test: POST /api/import/sync routes to syncToShopTable
    - Test: unknown route returns 404
    - Test: wrong HTTP method returns 405
    - _Requirements: 5.5, 5.6_

- [x] 12. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `@aws-sdk/client-ssm` dependency must be added in task 3.1
- All import modules live under `projects/shop-api/src/import/` with tests in `projects/shop-api/src/import/__tests__/`
- The existing `docClient` and `TABLE_NAME` from `dynamodb-client.ts` can be reused for Shop_Table operations; a new DynamoDB document client instance is needed for Import_Table using `IMPORT_TABLE_NAME` env var

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "3.1", "7.1"] },
    { "id": 1, "tasks": ["1.3", "2.2", "2.3", "3.2", "4.1", "7.2", "7.3", "7.4"] },
    { "id": 2, "tasks": ["4.2", "4.3", "4.4", "6.1"] },
    { "id": 3, "tasks": ["6.2", "6.3", "8.1"] },
    { "id": 4, "tasks": ["8.2", "8.3", "9.1"] },
    { "id": 5, "tasks": ["9.2", "9.3", "9.4", "11.1"] },
    { "id": 6, "tasks": ["11.2", "11.3"] }
  ]
}
```
