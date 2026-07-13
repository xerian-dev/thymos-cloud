# Implementation Plan: ConsignCloud Sale Import

## Overview

This plan implements sale import from the ConsignCloud API following the same two-phase architecture (fetch → sync) established by the item import. It reuses the existing Lambda function, Step Functions state machine, Import_Table, and rate limiter. New files go in `projects/shop-api/src/import/` with tests in `projects/shop-api/tests/import/`. The implementation adds path-based routing for `/api/import/sales/*` endpoints, a `sales` subcommand to the CLI script, and API Gateway routes via Terraform.

## Tasks

- [x] 1. Infrastructure and routing changes
  - [x] 1.1 Add API Gateway routes for sale import endpoints
    - Add five new `aws_apigatewayv2_route` resources to `infrastructure/modules/import/main.tf`:
      - `POST /api/import/sales/start`
      - `POST /api/import/sales/sync`
      - `POST /api/import/sales/resume`
      - `POST /api/import/sales/status`
      - `POST /api/import/sales/cancel`
    - All routes use the existing integration and authorizer (same pattern as item import routes)
    - _Requirements: 1.6_

  - [x] 1.2 Add CLI `sales` subcommand to import-consigncloud.sh
    - Add `sales` case to the main dispatch in `scripts/import-consigncloud.sh`
    - Implement subcommands: `fetch`, `sync`, `status`, `resume`, `cancel`
    - Follow the same pattern as the `items` subcommand (POST to `/api/import/sales/*` paths)
    - Update help text to include sales commands
    - _Requirements: 1.6_

- [x] 2. Implement Sale Job Manager
  - [x] 2.1 Create sale-job-manager.ts
    - Create `projects/shop-api/src/import/sale-job-manager.ts`
    - Implement `createSaleJob(filterParams)`: generate v4 UUID, PutItem with PK `SALE_IMPORT#<jobId>`, SK `METADATA`, state `running`, phase `fetch`, startedAt, lastUpdatedAt, progress counts zeroed, filterParams
    - Implement `getSaleJob(jobId)`: GetItem, return `SaleImportJob | null`
    - Implement `getRunningSaleJob()`: Scan Import_Table for any sale job in `running` or `paused` state (PK begins_with `SALE_IMPORT#`), return first match or null
    - Implement `transitionSaleJob(jobId, state, progress, error?)`: UpdateItem to set state, progress, lastUpdatedAt, optional error (truncated to 500 chars)
    - Implement `updateSaleJobPhase(jobId, phase)`: UpdateItem to set phase and lastUpdatedAt
    - Export `SaleImportJob`, `SaleJobState` interfaces
    - Reuse `ProgressCounts` from existing `job-manager.ts`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 2.2 Write property test for error description truncation (Property 5)
    - **Property 5: Error descriptions are bounded to 500 characters**
    - Create `projects/shop-api/tests/import/sale-error-truncation.property.test.ts`
    - For any error string of length L, the stored error description has length `min(L, 500)` and is a prefix of the original string
    - Use fast-check with 100+ iterations
    - **Validates: Requirements 10.5**

- [x] 3. Implement Sale Checkpoint Manager
  - [x] 3.1 Create sale-checkpoint-manager.ts
    - Create `projects/shop-api/src/import/sale-checkpoint-manager.ts`
    - Implement `saveSaleFetchCheckpoint(checkpoint)`: PutItem with PK `SALE_IMPORT#<jobId>`, SK `CHECKPOINT`, cursor, progress counts, lastUpdatedAt
    - Implement `loadSaleFetchCheckpoint(jobId)`: GetItem, return `SaleFetchCheckpoint | null`
    - Implement `saveSaleSyncCheckpoint(checkpoint)`: PutItem with PK `SALE_IMPORT#<jobId>`, SK `SYNC_CHECKPOINT`, exclusiveStartKey, progress, failures, lineItemsImported, lastUpdatedAt
    - Implement `loadSaleSyncCheckpoint(jobId)`: GetItem, return `SaleSyncCheckpoint | null`
    - Export `SaleFetchCheckpoint`, `SaleSyncCheckpoint` interfaces
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 4. Implement Sale ConsignCloud Client
  - [x] 4.1 Create sale-consigncloud-client.ts
    - Create `projects/shop-api/src/import/sale-consigncloud-client.ts`
    - Implement `fetchSalePage(config, cursor, limit)`: build URL with `limit=100`, `expand=cashier`, optional `created:gt` param, optional cursor
    - Authenticate with Bearer token from config
    - Enforce 30-second per-request timeout via AbortSignal
    - Handle 429 responses: use `Retry-After` header if present, else exponential backoff (1s doubling, max 60s), pause after 5 consecutive 429s
    - Handle 5xx responses: retry up to 3 times with exponential backoff (1s, 2s, 4s)
    - Implement `fetchSaleLineItems(config, saleId)`: GET `/sales/{id}/line_items`, same retry/auth logic
    - Export `ConsignCloudSale`, `ConsignCloudLineItem`, `FetchSalePageResult`, `FetchLineItemsResult`, `SaleClientConfig` interfaces
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.7, 4.1, 4.2, 4.3, 4.5, 4.6_

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Sale Mapper
  - [x] 6.1 Create sale-mapper.ts
    - Create `projects/shop-api/src/import/sale-mapper.ts`
    - Implement `mapConsignCloudSale(sale)`: transform ConsignCloudSale + line items to `SaleMappingResult`
    - Map Sale fields: sourceId from `id`, sourceNumber from `number`, status as `"finalized"`, subtotal/total/storePortion/consignorPortion/change from corresponding fields (as-is cents), memo from `memo` (null if not present), finalizedAt from `finalized`, voidedAt as null, createdAt from `created`
    - Map Line Item fields: salePrice from `price`, discount from `discount`, consignorPortion from `consignor_portion`, storePortion from `store_portion`
    - Implement `isFinalizedSale(sale)`: returns true iff `status === "finalized"`
    - Implement `buildSaleKeys(uuid, number)`: returns PK, SK, GSI1PK, GSI1SK (number zero-padded to 7 digits)
    - Implement `buildLineItemSk(index)`: returns `LINE_ITEM#<index zero-padded to 4 digits>`
    - Return discriminated union: `{ success: true, mapped, lineItems }` | `{ success: false, error }`
    - Export `MappedSaleFields`, `MappedLineItemFields`, `SaleMappingResult` interfaces
    - _Requirements: 6.1, 6.2, 7.1, 7.2_

  - [x] 6.2 Write property test for status filter (Property 1)
    - **Property 1: Only finalized sales pass the status filter**
    - Create `projects/shop-api/tests/import/sale-status-filter.property.test.ts`
    - For any ConsignCloud sale with a `status` field, `isFinalizedSale` returns true iff `status === "finalized"`
    - Generate random status strings including "open", "voided", "finalized", and arbitrary strings
    - Use fast-check with 100+ iterations
    - **Validates: Requirements 3.4**

  - [x] 6.3 Write property test for sale mapping (Property 2)
    - **Property 2: Sale mapping preserves monetary values and produces valid output**
    - Create `projects/shop-api/tests/import/sale-mapping-preserves-values.property.test.ts`
    - For any valid ConsignCloudSale object, the mapper produces output where subtotal/total/storePortion/consignorPortion/change equal input values, sourceId equals input id, sourceNumber equals input number, createdAt equals input created
    - Use fast-check with 100+ iterations
    - **Validates: Requirements 6.1**

  - [x] 6.4 Write property test for sale key construction (Property 3)
    - **Property 3: Sale key construction follows the defined patterns**
    - Create `projects/shop-api/tests/import/sale-key-construction.property.test.ts`
    - For any valid UUID and positive integer sale number, `buildSaleKeys` produces: PK `SALE#<uuid>`, SK `METADATA`, GSI1PK `SALES`, GSI1SK `SALE#` + number zero-padded to 7 digits
    - Use fast-check with 100+ iterations
    - **Validates: Requirements 6.2**

  - [x] 6.5 Write property test for line item mapping (Property 4)
    - **Property 4: Line item mapping produces correctly indexed records with preserved values**
    - Create `projects/shop-api/tests/import/sale-line-item-mapping.property.test.ts`
    - For any list of line items (0 to N), mapping produces N records where SK for index i equals `LINE_ITEM#` + i zero-padded to 4 digits, and salePrice/discount/consignorPortion/storePortion equal input values
    - Use fast-check with 100+ iterations
    - **Validates: Requirements 7.1, 7.2**

- [x] 7. Implement Sale Fetch Orchestrator
  - [x] 7.1 Create sale-fetch-orchestrator.ts
    - Create `projects/shop-api/src/import/sale-fetch-orchestrator.ts`
    - Implement `runSaleFetchLoop(config)`: main fetch processing loop
    - Load fetch checkpoint if resuming, otherwise start from null cursor
    - Fetch sale pages one at a time via sale-consigncloud-client
    - For each page: filter out non-finalized sales (increment skipped), fetch line items for each finalized sale via `GET /sales/{id}/line_items`, batch write staged records to Import_Table with PK `IMPORT#CONSIGNCLOUD#SALE#<sale-id>`, SK `METADATA`, embedding line_items array
    - Handle line item fetch failure gracefully: log WARN, store sale with empty `line_items` array
    - After each page: save checkpoint with current cursor and cumulative counts
    - After each page: check elapsed time against 270s threshold; if exceeded, return `continue`
    - When no more pages (null next_cursor): transition job to `paused`, return `complete`
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.3, 9.1_

- [x] 8. Implement Sale Sync Orchestrator
  - [x] 8.1 Create sale-sync-orchestrator.ts
    - Create `projects/shop-api/src/import/sale-sync-orchestrator.ts`
    - Implement `runSaleSyncLoop(config)`: main sync processing loop
    - Load sync checkpoint if resuming, otherwise start fresh
    - Scan staged sale records from Import_Table (PK begins_with `IMPORT#CONSIGNCLOUD#SALE#`)
    - For each staged sale:
      - Check deduplication: query Shop_Table sourceId-index for existing sale with same sourceId
      - If duplicate: skip, increment skipped count
      - Map sale fields via `sale-mapper.ts`
      - Resolve cashier: query Employee by sourceId, create if not found (same pattern as item sync)
      - Resolve line item references: for each line item, query Item by sourceId, set itemId to null if not found (log WARN)
      - Generate sale number: atomic increment `SEQUENCE#SALE` / `COUNTER` (retry up to 3 times)
      - TransactWrite: Sale record + all Sale_Line_Item records atomically
      - Handle TransactWrite conditional failure as duplicate (skip)
    - After each scan page: save sync checkpoint with exclusiveStartKey, progress, failures, lineItemsImported
    - Check elapsed time against 270s threshold; if exceeded, return `continue`
    - When scan complete: transition job to `complete`, write import report
    - _Requirements: 2.3, 2.4, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 5.2, 9.1_

  - [x] 8.2 Write property test for report failure truncation (Property 6)
    - **Property 6: Import report failure list is bounded and truncated correctly**
    - Create `projects/shop-api/tests/import/sale-report-failure-truncation.property.test.ts`
    - For any list of failure entries of length F, the report contains at most 100 entries, each error max 200 chars, truncated is true iff F > 100, totalFailures equals F
    - Use fast-check with 100+ iterations
    - **Validates: Requirements 11.2, 11.5**

- [x] 9. Implement Sale Import Handler
  - [x] 9.1 Create sale-import-handler.ts
    - Create `projects/shop-api/src/import/sale-import-handler.ts`
    - Implement `handleSaleImportStart(event)`: parse optional createdAfter from body, check for existing running/paused sale job (reject 409 if exists), create new job, start Step Function with phase `fetch`, return 200 with jobId/state/phase/startedAt
    - Implement `handleSaleImportSync(event)`: parse jobId from body, validate job in paused/failed state, update phase to sync, transition to running, start Step Function with phase `sync`, return 200
    - Implement `handleSaleImportResume(event)`: parse jobId from body, validate job in failed/paused state, transition to running, start Step Function with current phase, return 200
    - Implement `handleSaleImportStatus(event)`: parse jobId from body, get job, return status/progress or report if complete
    - Implement `handleSaleImportCancel(event)`: parse jobId from body, validate job in paused/failed state, delete job and checkpoint records, return 200
    - Implement `handleSaleResumeInternal(jobId, phase)`: dispatch to fetch or sync loop (same pattern as item handleResumeInternal)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 9.2 Extend import-handler.ts with sale import routes
    - Update `projects/shop-api/src/import-handler.ts` to add routing for:
      - `POST /api/import/sales/start` → handleSaleImportStart
      - `POST /api/import/sales/sync` → handleSaleImportSync
      - `POST /api/import/sales/resume` → handleSaleImportResume
      - `POST /api/import/sales/status` → handleSaleImportStatus
      - `POST /api/import/sales/cancel` → handleSaleImportCancel
    - Add check for `resume-internal` action with phase `fetch`/`sync` and job PK prefix detection for sale jobs (or explicit `type: "sale"` in Step Function payload)
    - _Requirements: 1.6, 9.1, 9.2, 9.3, 9.4_

- [x] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Unit tests
  - [x] 11.1 Write unit tests for sale-consigncloud-client
    - Create `projects/shop-api/tests/import/sale-consigncloud-client.test.ts`
    - Test: correct URL construction with limit and expand=cashier, createdAfter as `created:gt` param, cursor pagination, 30s timeout, Bearer auth header, 429 with Retry-After, 5xx retry exhaustion, line item fetch for a sale ID
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.7, 4.2, 4.3, 4.5_

  - [x] 11.2 Write unit tests for sale-mapper edge cases
    - Create `projects/shop-api/tests/import/sale-mapper.test.ts`
    - Test: mapping with all fields present, null memo handling, null cashier handling, empty line items array, line item with object vs string item reference, zero-padding of sale number (7 digits) and line item index (4 digits)
    - _Requirements: 6.1, 6.2, 7.1, 7.2_

  - [x] 11.3 Write unit tests for sale-job-manager
    - Create `projects/shop-api/tests/import/sale-job-manager.test.ts`
    - Test: createSaleJob returns valid SaleImportJob, getSaleJob returns null for non-existent, getRunningSaleJob finds active job, transitionSaleJob updates state, error truncated to 500 chars, updateSaleJobPhase sets phase
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 11.4 Write unit tests for sale-checkpoint-manager
    - Create `projects/shop-api/tests/import/sale-checkpoint-manager.test.ts`
    - Test: fetch checkpoint save/load round trip, sync checkpoint save/load round trip, loadCheckpoint returns null for missing, failures list persisted correctly
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 11.5 Write unit tests for sale-import-handler routing
    - Create `projects/shop-api/tests/import/sale-import-handler.test.ts`
    - Test: start request creates job and starts Step Function, start rejected when active job exists (409), sync validates job state, resume from paused/failed, resume rejected for invalid state, status returns report for completed job, cancel deletes records
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 11.6 Write integration tests for sale import lifecycle
    - Create `projects/shop-api/tests/import/sale-import-integration.test.ts`
    - Test: full fetch→pause→sync→complete lifecycle with mocked ConsignCloud API, deduplication across multiple sync runs, TransactWrite atomicity (sale + line items), cashier resolution (existing employee vs create new), item reference resolution (existing vs null), checkpoint resume from fetch phase, checkpoint resume from sync phase, line item fetch failure graceful degradation
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.3, 6.4, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 6 universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript throughout with vitest + fast-check for testing
- Existing modules reused as-is: `rate-limiter.ts`, `ssm-client.ts`, `dynamodb-client.ts`, `step-function-starter.ts`
- The Step Functions state machine is shared — sale jobs use the same `resume-internal` pattern but need routing logic to dispatch to sale fetch/sync loops
- Sale number generation uses `SEQUENCE#SALE` / `COUNTER` with the same atomic increment pattern as items
- Line items are fetched per-sale during the fetch phase to preserve the two-phase contract (sync phase never calls external API)
- Employee resolution and creation reuses the same pattern from `item-sync-orchestrator.ts`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "6.1"] },
    { "id": 3, "tasks": ["6.2", "6.3", "6.4", "6.5"] },
    { "id": 4, "tasks": ["7.1"] },
    { "id": 5, "tasks": ["8.1", "8.2"] },
    { "id": 6, "tasks": ["9.1"] },
    { "id": 7, "tasks": ["9.2"] },
    { "id": 8, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5"] },
    { "id": 9, "tasks": ["11.6"] }
  ]
}
```
