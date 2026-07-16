# Implementation Plan: Import Stream Sync

## Overview

Replace the batch-scan sync mechanism with a reactive DynamoDB Streams-based pipeline. A dedicated Stream Lambda receives filtered events from the Import_Table, routes records to entity-specific mappers, upserts to the Shop_Table, and marks records as synced. Infrastructure is provisioned via Terraform; application code lives in `projects/shop-api/src/stream/`.

## Tasks

- [x] 1. Infrastructure — Terraform provisioning
  - [x] 1.1 Enable DynamoDB Streams on Import_Table and create DLQ
    - Modify `infrastructure/modules/import/main.tf` to add `stream_enabled = true` and `stream_view_type = "NEW_IMAGE"` on `aws_dynamodb_table.import`
    - Add `aws_sqs_queue.stream_dlq` resource with appropriate retention and tags
    - Add outputs for stream ARN and DLQ ARN in `outputs.tf`
    - _Requirements: 1.1, 9.4, 11.1, 11.4_

  - [x] 1.2 Create Stream Lambda function and IAM role
    - Add `aws_iam_role.stream_lambda` with assume role policy for Lambda
    - Attach inline policies: Import_Table stream read, Import_Table read/write, Shop_Table read/write, CloudWatch Logs, SQS send to DLQ
    - Add `aws_lambda_function.stream_sync` resource using esbuild output zip, with environment variables for table names and reserved concurrency
    - Add outputs for Lambda function name and ARN in `outputs.tf`
    - _Requirements: 10.4, 11.2, 11.3, 11.5_

  - [x] 1.3 Create event source mapping with filter criteria
    - Add `aws_lambda_event_source_mapping.stream` connecting DDB Stream to Lambda
    - Configure filter pattern: `eventName = ["INSERT", "MODIFY"]`, PK prefix `IMPORT#CONSIGNCLOUD#`, `syncedAt` not present
    - Set `batch_size = 10`, `bisect_batch_on_function_error = true`, `maximum_retry_attempts = 3`, `function_response_types = ["ReportBatchItemFailures"]`
    - Configure `destination_config.on_failure` to DLQ ARN
    - _Requirements: 1.2, 1.3, 2.1, 2.3, 10.1, 10.2, 10.3_

  - [x] 1.4 Add Terraform variables for Shop_Table references
    - Add `shop_table_name` and `shop_table_arn` variables to `variables.tf` so the import module can reference the Shop_Table for IAM grants
    - _Requirements: 11.3_

- [x] 2. Core shared modules
  - [x] 2.1 Create DynamoDB client module for stream handler
    - Create `projects/shop-api/src/stream/dynamodb-client.ts`
    - Export configured `DynamoDBDocumentClient` instances for Import_Table and Shop_Table using environment variable table names
    - Follow the existing `src/dynamodb-client.ts` pattern
    - _Requirements: 4.2, 4.3, 5.2, 5.3, 6.2, 6.3_

  - [x] 2.2 Implement source-id-lookup module
    - Create `projects/shop-api/src/stream/source-id-lookup.ts`
    - Implement `findBySourceId(sourceId: string): Promise<ExistingRecord | undefined>` querying the `sourceId-index` GSI on Shop_Table
    - _Requirements: 8.1_

  - [x] 2.3 Implement sequence-service module
    - Create `projects/shop-api/src/stream/sequence-service.ts`
    - Implement `getNextSequenceNumber(entityType: 'ACCOUNT' | 'ITEM' | 'SALE'): Promise<number>` using DynamoDB `UpdateItem` with `ADD` on `SEQUENCE#<TYPE>/COUNTER`
    - _Requirements: 4.3, 5.3, 6.3_

  - [x] 2.4 Implement timestamp-marker module
    - Create `projects/shop-api/src/stream/timestamp-marker.ts`
    - Implement `markSynced(pk: string, sk: string): Promise<void>` that writes `syncedAt` ISO 8601 UTC timestamp to the import record
    - Log but do not throw on failure
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 3. Entity mappers
  - [x] 3.1 Implement account-mapper
    - Create `projects/shop-api/src/stream/account-mapper.ts`
    - Implement `mapAccount(raw: Record<string, unknown>): MappedAccount` following field mapping from design (snake_case → camelCase)
    - Reuse `normalizeSwissPhone`, `buildStreet`, `deriveImportTags` from existing `field-mapper.ts`
    - Pure function — no side effects, idempotent
    - _Requirements: 4.1, 4.4_

  - [x] 3.2 Implement item-mapper for stream records
    - Create `projects/shop-api/src/stream/item-mapper.ts`
    - Implement `mapItem(raw: Record<string, unknown>): ItemMappingResult` adapting existing `item-mapper.ts` logic for the raw DDB Stream record format
    - Handle price conversion (cents → CHF), split conversion (0–1 → 0–100), title truncation, tag filtering
    - Pure function — no side effects, idempotent
    - _Requirements: 5.1_

  - [x] 3.3 Implement sale-mapper for stream records
    - Create `projects/shop-api/src/stream/sale-mapper.ts`
    - Implement `mapSale(raw)` adapting existing `sale-mapper.ts` for stream record format
    - Implement `isFinalizedSale(raw)` filter — returns true only if `finalized` is non-null AND `voided` is null
    - Return `null` for non-finalized or voided sales
    - Map line items with discount summation and field extraction
    - Pure function — no side effects, idempotent
    - _Requirements: 6.1, 6.4, 6.5_

- [x] 4. Upsert service
  - [x] 4.1 Implement upsert-service with create-or-update logic
    - Create `projects/shop-api/src/stream/upsert-service.ts`
    - Implement `upsertAccount(mapped)`: query sourceId-index → if exists, update changed fields; if not, generate UUID + next sequence number + conditional PutItem
    - Implement `upsertItem(mapped, accountSourceId)`: query sourceId-index → resolve owning account UUID → resolve/create Employee and Category → if exists, update; if not, create with generated UUID + SKU from sequence counter
    - Implement `upsertSale(mapped, lineItems)`: query sourceId-index → if exists, skip (sales immutable); if not, resolve cashier Employee + resolve line item Item UUIDs → TransactWriteItems with sale + line items
    - Use `attribute_not_exists(PK)` condition on all creates; treat `ConditionalCheckFailedException` as success
    - _Requirements: 4.2, 4.3, 5.2, 5.3, 5.4, 5.5, 6.2, 6.3, 6.5, 6.6, 8.1, 8.2, 8.3_

- [x] 5. Entity router
  - [x] 5.1 Implement entity-router module
    - Create `projects/shop-api/src/stream/entity-router.ts`
    - Implement `parseEntityType(pk: string): EntityType | null` extracting type from PK pattern `IMPORT#CONSIGNCLOUD#<TYPE>#<id>`
    - Implement `routeRecord(record)` that dispatches to the appropriate mapper + upsert based on entity type
    - Log warning and skip for unrecognised entity types (no error thrown)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 6. Stream handler — Lambda entry point
  - [x] 6.1 Implement stream-handler Lambda entry point
    - Create `projects/shop-api/src/stream-handler.ts`
    - Implement `handler(event: DynamoDBStreamEvent): Promise<StreamHandlerResult>` iterating over `event.Records`
    - For each record: extract `eventID`, unmarshall `NewImage`, check for `syncedAt` presence (skip if present), delegate to entity router
    - Catch per-record errors: validation errors → log + skip; transient errors → add `eventID` to `batchItemFailures`
    - After successful route, call `markSynced` for the record
    - Return `{ batchItemFailures: [...] }` for partial batch response
    - _Requirements: 2.2, 2.3, 9.1, 9.2, 9.3_

  - [x] 6.2 Add esbuild configuration for stream-handler
    - Update `projects/shop-api/package.json` or build script to add a second esbuild entry point for `src/stream-handler.ts` producing a separate zip artifact
    - Ensure the output is compatible with the Terraform Lambda resource configuration
    - _Requirements: 11.2_

- [x] 7. Checkpoint — Verify build and infrastructure
  - Ensure all TypeScript compiles without errors, esbuild produces both handler zips, and Terraform validates (`terraform validate`). Ask the user if questions arise.

- [ ] 8. Tests
  - [ ]* 8.1 Write property test for entity routing determinism
    - **Property 1: Entity routing determinism**
    - **Validates: Requirements 3.1, 3.2, 3.3**
    - Use fast-check to generate arbitrary PK strings with valid entity type segments and arbitrary ID suffixes
    - Assert `parseEntityType` always returns the same classification regardless of content or repetition

  - [ ]* 8.2 Write property test for account mapping idempotence
    - **Property 2: Account mapping idempotence**
    - **Validates: Requirements 4.1, 4.4**
    - Use fast-check to generate valid ConsignCloud account records
    - Assert `mapAccount(record)` produces identical output on repeated invocations

  - [ ]* 8.3 Write property test for item mapping idempotence
    - **Property 3: Item mapping idempotence**
    - **Validates: Requirements 5.1**
    - Use fast-check to generate valid ConsignCloud item records with valid prices, splits, titles
    - Assert `mapItem(record)` produces identical output on repeated invocations

  - [ ]* 8.4 Write property test for sale mapping idempotence
    - **Property 4: Sale mapping idempotence**
    - **Validates: Requirements 6.1**
    - Use fast-check to generate valid ConsignCloud sale records
    - Assert `mapSale(record)` produces identical output on repeated invocations

  - [ ]* 8.5 Write property test for sale finalization filter correctness
    - **Property 5: Sale finalization filter correctness**
    - **Validates: Requirements 6.4**
    - Use fast-check to generate all combinations of `finalized` (null/non-null) and `voided` (null/non-null)
    - Assert `isFinalizedSale` returns `true` iff `finalized != null && voided == null`

  - [ ]* 8.6 Write property test for item price conversion correctness
    - **Property 6: Item price conversion correctness**
    - **Validates: Requirements 5.1**
    - Use fast-check to generate integers in range [0, 99_999_999]
    - Assert mapped `tagPrice` equals `input / 100` and is within [0, 999_999.99]

  - [ ]* 8.7 Write unit tests for stream-handler batch processing
    - Test `batchItemFailures` structure for mixed success/failure batches
    - Test that validation errors are skipped (not added to failures)
    - Test that transient errors are included in failures
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 8.8 Write unit tests for upsert-service
    - Test create path with conditional write success
    - Test update path for existing records
    - Test `ConditionalCheckFailedException` treated as no-op
    - Test sale skip logic for existing sales
    - _Requirements: 8.2, 8.3, 6.2_

  - [ ]* 8.9 Write unit tests for timestamp-marker
    - Test success path writes `syncedAt`
    - Test failure path logs error but does not throw
    - _Requirements: 7.1, 7.3_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass (`vitest --run`), ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `field-mapper.ts`, `item-mapper.ts`, and `sale-mapper.ts` provide proven mapping logic to adapt — the stream versions handle the raw DDB Stream `NewImage` format rather than typed API responses
- The stream handler is a separate Lambda from the import handler, with its own esbuild entry point and deployment artifact

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["1.3", "2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["5.1"] },
    { "id": 6, "tasks": ["6.1", "6.2"] },
    { "id": 7, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6"] },
    { "id": 8, "tasks": ["8.7", "8.8", "8.9"] }
  ]
}
```
