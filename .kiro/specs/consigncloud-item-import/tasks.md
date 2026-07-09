# Implementation Plan: ConsignCloud Item Import

## Overview

This plan implements paginated item import from the ConsignCloud API with checkpoint-based resumability and self-re-invocation for handling 100,000+ items within Lambda timeout constraints. Tasks are ordered: infrastructure first (IAM, routes, env vars), then core components (job manager, checkpoint manager, client, mapper), then orchestration (self-invoker, orchestrator), then handler routing, and finally tests. All components live in `projects/shop-api/src/import/`.

## Tasks

- [x] 1. Infrastructure changes for self-invocation and item import routes
  - [x] 1.1 Add IAM self-invoke policy to Terraform
    - Add `aws_iam_role_policy.self_invoke` to `infrastructure/modules/import/main.tf`
    - Grant `lambda:InvokeFunction` on the import Lambda's own ARN
    - _Requirements: 9.3_

  - [x] 1.2 Add FUNCTION_NAME environment variable to Lambda
    - Add `FUNCTION_NAME = aws_lambda_function.import.function_name` to the Lambda environment variables block in `infrastructure/modules/import/main.tf`
    - _Requirements: 9.1, 9.2_

  - [x] 1.3 Add API Gateway routes for item import endpoints
    - Add three new `aws_apigatewayv2_route` resources to `infrastructure/modules/import/main.tf`:
      - `POST /api/import/items/start`
      - `POST /api/import/items/resume`
      - `POST /api/import/items/status`
    - All routes use the existing integration and authorizer
    - _Requirements: 1.6_

- [x] 2. Implement Job Manager
  - [x] 2.1 Create job-manager.ts
    - Create `projects/shop-api/src/import/job-manager.ts`
    - Implement `createJob(filterParams)`: generate v4 UUID, PutItem with PK `ITEM_IMPORT#<jobId>`, SK `METADATA`, state `running`, startedAt, lastUpdatedAt, progress counts zeroed, filterParams
    - Implement `getJob(jobId)`: GetItem, return `ImportJob | null`
    - Implement `getRunningOrPausedJob()`: Query/Scan Import_Table for any job in `running` or `paused` state, return first match or null
    - Implement `transitionJob(jobId, state, progress, error?)`: UpdateItem to set state, progress, lastUpdatedAt, optional error (max 500 chars)
    - Export `ImportJob`, `JobState`, `ProgressCounts` interfaces
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 2.2 Write property test for job state transitions (Property 6)
    - **Property 6: Job state transitions are valid**
    - Create `projects/shop-api/tests/import/job-state-transitions.property.test.ts`
    - For any ImportJob in a given state, only valid transitions are: running→complete, running→paused, running→failed, paused→running, failed→running
    - Generate random state + target state pairs, verify only valid transitions succeed
    - **Validates: Requirements 6.1, 6.3, 6.4, 6.5**

  - [x] 2.3 Write property test for single active job invariant (Property 7)
    - **Property 7: Single active job invariant**
    - Create `projects/shop-api/tests/import/single-active-job.property.test.ts`
    - For any start-import request when a job exists in `running` or `paused` state, the request is rejected with the existing job's identifier and no new job is created
    - **Validates: Requirements 1.2, 6.7**

- [x] 3. Implement Checkpoint Manager
  - [x] 3.1 Create checkpoint-manager.ts
    - Create `projects/shop-api/src/import/checkpoint-manager.ts`
    - Implement `saveCheckpoint(checkpoint)`: PutItem with PK `ITEM_IMPORT#<jobId>`, SK `CHECKPOINT`, cursor, progress counts, lastUpdatedAt
    - Include retry logic: up to 3 retries with 500ms fixed delay on DynamoDB write failure
    - Implement `loadCheckpoint(jobId)`: GetItem, return `Checkpoint | null`
    - Export `Checkpoint` interface
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.7_

  - [x] 3.2 Write property test for checkpoint cursor consistency (Property 5)
    - **Property 5: Checkpoint cursor consistency**
    - Create `projects/shop-api/tests/import/checkpoint-consistency.property.test.ts`
    - For any sequence of pages processed where page K returns cursor C_K with I_K imports, S_K skips, F_K failures, after checkpointing page N the stored cursor equals C_N and progress counts are cumulative sums
    - **Validates: Requirements 4.1, 4.3, 8.4**

- [x] 4. Implement Item ConsignCloud Client
  - [x] 4.1 Create item-consigncloud-client.ts
    - Create `projects/shop-api/src/import/item-consigncloud-client.ts`
    - Implement `fetchItemPage(config, cursor, limit)`: build URL with `limit`, `include`, `expand`, optional `created_after`, optional `cursor` params
    - Include all required `include` values: batches, created_by, days_on_shelf, historic_consignor_portions, historic_sale_prices, historic_store_portions, last_sold, last_viewed, list_on_shopify, list_on_square, location, printed, split_price, surcharges, tags, tax_exempt, images, quantity, weight, weight_unit
    - Include all required `expand` values: account, category, created_by, surcharges, shelf, batches, images, location
    - Authenticate with Bearer token from config
    - Enforce 30-second per-request timeout via AbortSignal
    - Handle 429 responses: use `Retry-After` header if present, else exponential backoff (1s doubling, max 60s), pause after 5 consecutive 429s
    - Handle 5xx responses: retry up to 3 times with exponential backoff (1s, 2s, 4s)
    - Export `ConsignCloudItem`, `FetchItemPageResult`, `ItemClientConfig` interfaces
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.2 Write property test for rate limiter timing (Property 8)
    - **Property 8: Rate limiter respects capacity and drain rate**
    - Create `projects/shop-api/tests/import/rate-limiter-timing.property.test.ts`
    - For any sequence of N requests through a rate limiter with capacity C and drain rate R, elapsed time is at least `max(0, (N - C) / R)` seconds
    - **Validates: Requirements 3.1**

  - [x] 4.3 Write property test for exponential backoff on 429 (Property 9)
    - **Property 9: Exponential backoff on 429 responses**
    - Create `projects/shop-api/tests/import/backoff-calculation.property.test.ts`
    - For any sequence of consecutive 429 responses without Retry-After header, wait time before attempt K equals `min(2^(K-1) * 1000, 60000)` ms
    - **Validates: Requirements 3.3**

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Item Mapper
  - [x] 6.1 Create item-mapper.ts
    - Create `projects/shop-api/src/import/item-mapper.ts`
    - Implement `mapConsignCloudItem(item)`: transform ConsignCloudItem to MappedItemFields
    - Map fields: title from name (truncate at 200 chars), tagPrice from price, quantity from quantity, split from consignor_split, category from category.name, tags from tags (max 20), description from description (truncate at 2000 chars), brand, color, size, shelf from shelf.name or location.name, taxExempt from tax_exempt, imageKeys from images[].url
    - Validate required fields: title, tagPrice (0–999,999.99), quantity (1–9999), split (0–100)
    - Return discriminated union: `{ success: true, mapped }` | `{ success: false, error }`
    - Set `inventoryType: "Consignment"` and `terms: "Return To Consignor"` as defaults
    - Export `MappedItemFields`, `ItemMappingResult` interfaces
    - _Requirements: 5.1, 5.4, 5.5, 5.10_

  - [x] 6.2 Write property test for item mapping preserves required fields (Property 1)
    - **Property 1: Item mapping preserves required fields**
    - Create `projects/shop-api/tests/import/item-mapping-preserves-fields.property.test.ts`
    - For any valid ConsignCloud item with all required fields present and within valid ranges, mapConsignCloudItem produces MappedItemFields where title equals source name (truncated to 200), tagPrice equals source price, quantity equals source quantity, split equals source consignor_split
    - **Validates: Requirements 5.1**

  - [x] 6.3 Write property test for invalid item rejection (Property 2)
    - **Property 2: Invalid items are rejected with field-specific errors**
    - Create `projects/shop-api/tests/import/item-mapping-rejects-invalid.property.test.ts`
    - For any ConsignCloud item where at least one required field is null/missing/out-of-range, mapping produces a failure result containing an error naming the invalid field
    - **Validates: Requirements 5.4, 5.5**

  - [x] 6.4 Write property test for deleted items skipped (Property 3)
    - **Property 3: Deleted items are always skipped**
    - Create `projects/shop-api/tests/import/deleted-items-skipped.property.test.ts`
    - For any ConsignCloud item with a non-null deleted field, processing skips it and increments the skipped count regardless of other field values
    - **Validates: Requirements 5.6**

  - [x] 6.5 Write property test for new item creation invariants (Property 11)
    - **Property 11: New item creation invariants**
    - Create `projects/shop-api/tests/import/new-item-creation-invariants.property.test.ts`
    - For any valid item that passes validation, has a resolvable account, is not deleted, and does not already exist, the created record has a sequential SKU, stores ConsignCloud UUID as sourceId, sets inventoryType to "Consignment", and terms to "Return To Consignor"
    - **Validates: Requirements 5.8, 5.9, 5.10**

- [x] 7. Implement Self Invoker
  - [x] 7.1 Create self-invoker.ts
    - Create `projects/shop-api/src/import/self-invoker.ts`
    - Implement `invokeSelf(jobId)`: use AWS Lambda SDK to invoke the function asynchronously
    - Use `FUNCTION_NAME` env var (or `AWS_LAMBDA_FUNCTION_NAME`) for the function name
    - Set `InvocationType: "Event"` for async fire-and-forget
    - Payload: `{ action: "resume-internal", jobId }`
    - Export `SelfInvokePayload` interface
    - _Requirements: 9.1, 9.2, 9.4, 9.5_

- [x] 8. Implement Item Import Orchestrator
  - [x] 8.1 Create item-import-orchestrator.ts
    - Create `projects/shop-api/src/import/item-import-orchestrator.ts`
    - Implement `runImportLoop(config)`: main processing loop coordinating all components
    - Load checkpoint if resuming, otherwise start from null cursor
    - Fetch pages one at a time via item-consigncloud-client
    - For each page: skip deleted items, check deduplication (sourceId query), resolve account IDs (with in-memory cache), validate and map items, write new items with conditional expression (sourceId not exists), update progress counts
    - After each page: save checkpoint with current cursor and cumulative counts
    - After each page: check elapsed time against 270s threshold; if exceeded, save checkpoint + invoke self + return
    - When no more pages (null next_cursor): transition job to complete, write import report
    - Handle individual item failures: log, increment failed count, continue
    - Generate SKU from item sequence counter for each new item
    - Account resolution: query Shop_Table for account with matching sourceId, cache in memory
    - _Requirements: 4.1, 4.4, 4.5, 5.2, 5.3, 5.6, 5.7, 5.8, 5.9, 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.5_

  - [x] 8.2 Implement import report generation in orchestrator
    - When job completes: write Import_Report to Import_Table with PK `ITEM_IMPORT#REPORT`, SK `<jobId>`
    - Include: totalProcessed, imported, skipped, failed, elapsedSeconds, failures list (max 100 entries, each error max 200 chars), truncated flag, totalFailures, completedAt
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

  - [x] 8.3 Write property test for deduplication and SKU sequence (Property 4)
    - **Property 4: Deduplication prevents duplicates and preserves SKU sequence**
    - Create `projects/shop-api/tests/import/deduplication-sku-sequence.property.test.ts`
    - For any page with a mix of new items and items whose UUID already exists as sourceId, duplicates are skipped without creating records or consuming sequence numbers, and the counter advances by exactly the count of newly imported items
    - **Validates: Requirements 5.7, 8.1, 8.2, 8.5**

  - [x] 8.4 Write property test for report failure list bounds (Property 10)
    - **Property 10: Report failure list is bounded and ordered**
    - Create `projects/shop-api/tests/import/report-failure-bounds.property.test.ts`
    - For any completed import with F total failures, the report's failure list contains min(F, 100) entries in processing order with each error truncated to 200 chars, truncated is true iff F > 100, and totalFailures equals F
    - **Validates: Requirements 7.2, 7.5**

  - [x] 8.5 Write property test for page processing continues after failures (Property 12)
    - **Property 12: Page processing continues after individual failures**
    - Create `projects/shop-api/tests/import/page-continues-after-failure.property.test.ts`
    - For any page of N items where item at index J fails, all items at indices J+1 through N-1 are still processed, and final page counts reflect correct totals
    - **Validates: Requirements 8.3, 5.3**

- [x] 9. Implement Handler Routing
  - [x] 9.1 Create item-import-handler.ts
    - Create `projects/shop-api/src/import/item-import-handler.ts`
    - Implement `handleItemImportStart(event)`: parse optional createdAfter from body, check for existing running/paused job (reject if exists), create new job, kick off orchestrator, return 200 with jobId/state/startedAt
    - Implement `handleItemImportResume(event)`: parse jobId from body, validate job exists and is in failed/paused state, transition to running, kick off orchestrator from checkpoint, return 200
    - Implement `handleItemImportStatus(event)`: parse jobId from body, get job, return status/progress or report if complete
    - Handle `resume-internal` action for self-re-invocation (bypass API Gateway routing)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 9.2 Extend import-handler.ts with item import routes
    - Update `projects/shop-api/src/import-handler.ts` to add routing for:
      - `POST /api/import/items/start` → handleItemImportStart
      - `POST /api/import/items/resume` → handleItemImportResume
      - `POST /api/import/items/status` → handleItemImportStatus
    - Add check for `resume-internal` action in the raw event payload (for self-re-invocation, event is not APIGatewayProxyEventV2)
    - _Requirements: 1.6, 9.2_

- [x] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Unit and integration tests
  - [x] 11.1 Write unit tests for item-consigncloud-client
    - Create `projects/shop-api/tests/import/item-consigncloud-client.test.ts`
    - Test: correct URL construction with all include/expand params, createdAfter forwarding, cursor pagination, 30s timeout, 429 with Retry-After header parsing, 5xx retry exhaustion, authentication header
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8, 3.2, 3.5_

  - [x] 11.2 Write unit tests for item-mapper edge cases
    - Create `projects/shop-api/tests/import/item-mapper.test.ts`
    - Test: exactly 200-char title (no truncation), 201-char title (truncated), boundary prices 0.00 and 999,999.99, quantity boundaries 1 and 9999, split boundaries 0 and 100, null category/tags/description handling, images array mapping
    - _Requirements: 5.1, 5.4, 5.5_

  - [x] 11.3 Write unit tests for job-manager
    - Create `projects/shop-api/tests/import/job-manager.test.ts`
    - Test: createJob returns valid ImportJob, getJob returns null for non-existent, getRunningOrPausedJob finds active job, transitionJob updates state correctly, error truncated to 500 chars
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 11.4 Write unit tests for checkpoint-manager
    - Create `projects/shop-api/tests/import/checkpoint-manager.test.ts`
    - Test: saveCheckpoint round trip, loadCheckpoint returns null for missing, retry logic on write failure (1, 2, 3 failures then success), all retries exhausted
    - _Requirements: 4.1, 4.3, 4.7_

  - [x] 11.5 Write unit tests for self-invoker
    - Create `projects/shop-api/tests/import/self-invoker.test.ts`
    - Test: payload construction, async invocation type, function name from env var, invocation failure handling
    - _Requirements: 9.1, 9.2_

  - [x] 11.6 Write unit tests for item-import-handler routing
    - Create `projects/shop-api/tests/import/item-import-handler.test.ts`
    - Test: start request validation, resume with invalid job state rejection, status returns report for completed job, resume-internal action handling, method checking, 404/405 responses
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 11.7 Write integration tests for page processing
    - Create `projects/shop-api/tests/import/item-import-integration.test.ts`
    - Test: multi-page processing with mocked ConsignCloud API, DynamoDB writes verify item record structure, conditional expression prevents duplicates, checkpoint save/load round trip, job state transitions across simulated re-invocations, account resolution with sourceId lookup
    - _Requirements: 4.1, 4.2, 5.7, 8.1, 8.2, 8.4, 8.5_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 12 universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout with vitest + fast-check for testing
- The existing `rate-limiter.ts`, `ssm-client.ts`, `dynamodb-client.ts`, and `import-table-client.ts` are reused as-is
- Account resolution uses an in-memory cache that resets between re-invocations
- The self-re-invocation threshold is 270 seconds (30s before Lambda's 300s timeout)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "6.1"] },
    { "id": 4, "tasks": ["6.2", "6.3", "6.4", "6.5", "7.1"] },
    { "id": 5, "tasks": ["8.1", "8.2"] },
    { "id": 6, "tasks": ["8.3", "8.4", "8.5", "9.1"] },
    { "id": 7, "tasks": ["9.2"] },
    { "id": 8, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6"] },
    { "id": 9, "tasks": ["11.7"] }
  ]
}
```
