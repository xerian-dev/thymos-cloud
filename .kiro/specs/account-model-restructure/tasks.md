# Implementation Plan: Account Model Restructure

## Overview

Replace the monolithic `address` field with structured address components (`street`, `place`, `postcode`, `canton`), add dedicated `email` and `telephone` fields, expand the ConsignCloud import interface with address/phone fields, implement phone normalization (Swiss prefix stripping), street concatenation, conditional tag derivation, and tag writing (TAG# items) in the sync process. The sync process preserves original ConsignCloud account numbers as the Shop_Table PK (e.g., ConsignCloud number "001893" → PK `ACCOUNT#001893`) using simple PutItem calls, and updates the sequence counter to the maximum imported number at the end. Touches API validation, route handlers, import pipeline (field-mapper, import-table-client, sync-to-shop-table), frontend types, form, and table. No infrastructure or data migration — accounts will be re-imported.

## Tasks

- [x] 1. Update import pipeline — field mapper
  - [x] 1.1 Expand `ConsignCloudAccount` interface and add helper functions in `field-mapper.ts`
    - Add `phone_number`, `address_line_1`, `address_line_2`, `city`, `state`, `postal_code` as optional string properties on `ConsignCloudAccount`
    - Implement `normalizeSwissPhone(phone: string | undefined | null): string` — strips `+41` or `0041` prefix and prepends `0`; returns `""` for null/undefined
    - Implement `buildStreet(addressLine1, addressLine2): string` — concatenates with `", "` when both present; returns the one that is present; returns `""` when both null
    - Implement `deriveImportTags(emailNotificationsEnabled: boolean, normalizedPhone: string): string[]` — pushes `email_notification` when enabled is true; pushes `text_notification` when phone starts with `079`/`078`/`077`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4_

  - [x] 1.2 Update `mapConsignCloudToShop` and `hasFieldChanges` in `field-mapper.ts`
    - Add `street`, `place`, `postcode`, `canton`, `email`, `telephone`, `tags` to `MappedAccountFields`
    - Call `buildStreet(source.address_line_1, source.address_line_2)` → `street`
    - Map `city` → `place`, `postal_code` → `postcode`, `state` → `canton` (null defaults to `""`)
    - Map `source.email` → `email`
    - Call `normalizeSwissPhone(source.phone_number)` → `telephone`
    - Call `deriveImportTags(source.email_notifications_enabled, telephone)` → `tags`
    - Update `ExistingAccountFields` to include `street`, `place`, `postcode`, `canton`, `email`, `telephone`, `tags`
    - Update `hasFieldChanges` to compare all new fields and do sorted array comparison for tags
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 7.5, 9.6_

  - [x] 1.3 Write property test for `normalizeSwissPhone`
    - **Property 4: Swiss phone normalization**
    - For any string starting with `+41`, verify result is `"0" + remainder`; for `0041` prefix likewise; for other strings unchanged; for null/undefined returns `""`
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

  - [x] 1.4 Write property test for `buildStreet`
    - **Property 2: Street construction from address lines**
    - For any pair of optional strings, verify concatenation/fallback/empty logic
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [x] 1.5 Write property test for `deriveImportTags` — email notification
    - **Property 5: Email notification tag assignment**
    - For any boolean `emailNotificationsEnabled` and any normalized phone, verify `email_notification` is in tags iff enabled is true
    - **Validates: Requirements 8.1, 8.2**

  - [x] 1.6 Write property test for `deriveImportTags` — text notification
    - **Property 6: Text notification tag assignment**
    - For any normalized phone string, verify `text_notification` is in tags iff phone starts with `079`/`078`/`077`
    - **Validates: Requirements 8.3, 8.4**

  - [x] 1.7 Write property test for direct field mapping with null defaults
    - **Property 3: Direct field mapping with null defaults**
    - For any `ConsignCloudAccount`, verify `place === city ?? ""`, `postcode === postal_code ?? ""`, `canton === state ?? ""`, `email === source.email`
    - **Validates: Requirements 5.5, 5.6, 5.7, 6.1**

  - [x] 1.8 Write property test for change detection
    - **Property 7: Change detection covers all fields and tags**
    - For any pair of existing/mapped fields, verify `hasFieldChanges` returns true when any single field or tags differ, and false when all equal
    - **Validates: Requirements 9.6**

- [x] 2. Update import pipeline — table client and sync process
  - [x] 2.1 Update `import-table-client.ts` to store expanded fields
    - Add `phoneNumber`, `addressLine1`, `addressLine2`, `city`, `state`, `postalCode` to `ImportedAccountRecord` interface
    - Update `writeImportedAccounts` to persist the new fields from `ConsignCloudAccount` source data
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 2.2 Update `sync-to-shop-table.ts` — new account creation using ConsignCloud number
    - Update `ShopTableAccount` interface to include `street`, `place`, `postcode`, `canton`, `email`, `telephone`
    - In the create branch, use the ConsignCloud `number` field directly as the account number in the PK (e.g., ConsignCloud number `"001893"` → PK `ACCOUNT#001893`) — do NOT use the sequence counter
    - Use a simple `PutItem` call (not TransactWriteItems) to write the new account with `street`, `place`, `postcode`, `canton`, `email`, `telephone` from mapped fields (no `address`)
    - After the METADATA PutItem, write TAG# items for each tag: `PK=ACCOUNT#{number}`, `SK=TAG#{tag}`, with `tag` and `createdAt` attributes
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 2.3 Update `sync-to-shop-table.ts` — existing account update and final sequence counter update
    - UpdateExpression includes `street`, `place`, `postcode`, `canton`, `email`, `telephone` in SET clause
    - On update, query existing TAG# items for the account and delete them, then write new TAG# items from `mapped.tags`
    - Use `hasFieldChanges` (which now includes all new fields and tags) to detect changes
    - After ALL records are processed (end of the sync function), read the current sequence counter value, parse the maximum imported account number as an integer, and update the counter to that maximum — but only if it exceeds the current counter value
    - The sequence counter stores the "last used number" so that `create-account.ts` (which uses counter+1) continues to work correctly for manually-created accounts
    - _Requirements: 9.4, 9.5, 9.6_

  - [x] 2.4 Write unit tests for sync-to-shop-table create and update paths
    - Verify new account PutItem uses ConsignCloud `number` as the PK (e.g., `ACCOUNT#001893`) and does NOT call the sequence counter
    - Verify PutItem includes `street`, `place`, `postcode`, `canton`, `email`, `telephone` and excludes `address`
    - Verify TAG# items are written for each derived tag on create
    - Verify TAG# items are replaced on update
    - Verify update expression includes all new fields
    - Verify sequence counter is updated to max imported number at end of sync (only if higher than current)
    - Verify sequence counter is NOT updated if current value is already higher
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 3. Checkpoint - Import pipeline verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update API validation and route handlers
  - [x] 4.1 Update `validation.ts` to remove `address` and add new optional fields
    - Remove `address` validation (string, max 500)
    - Add optional field validation: `street` (max 200), `place` (max 100), `postcode` (max 20), `canton` (max 50), `email` (max 254)
    - Keep `telephone` validation (optional, max 30)
    - Update `CreateAccountInput` interface to include `street`, `place`, `postcode`, `canton`, `email` and remove `address`
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 2.2, 3.2_

  - [x] 4.2 Update `create-account.ts` to write new fields to DynamoDB
    - Destructure `street`, `place`, `postcode`, `canton`, `email`, `telephone` from validated data
    - Remove `address` from DynamoDB item
    - Write new fields defaulting to `""` when undefined
    - Return new fields in 201 response
    - Note: `create-account.ts` still uses the sequence counter for manually-created accounts — this is unchanged
    - _Requirements: 1.1, 1.2, 2.1, 3.1_

  - [x] 4.3 Update `list-accounts.ts` to return new fields
    - Map `street`, `place`, `postcode`, `canton`, `email` from DynamoDB items (no `address`)
    - Query TAG# items for each account to populate `tags` array
    - _Requirements: 1.7, 2.3, 3.3_

  - [x] 4.4 Write property test for API validator length enforcement
    - **Property 1: Validator enforces optional field length limits**
    - For each optional field (`street`, `place`, `postcode`, `canton`, `email`, `telephone`), generate random strings within and exceeding max length; verify accept/reject behavior
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 2.2, 3.2**

  - [x] 4.5 Write unit tests for create-account and list-accounts response shapes
    - Verify create-account returns `street`, `place`, `postcode`, `canton`, `email`, `telephone` and does not return `address`
    - Verify list-accounts response objects include new fields, `canton`, and exclude `address`
    - _Requirements: 1.1, 1.2, 1.7, 2.1, 2.3, 3.3_

- [x] 5. Checkpoint - API layer verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update frontend types and validation
  - [x] 6.1 Update `accounts-types.ts` with new field structure
    - Add `street`, `place`, `postcode`, `canton`, `email`, `telephone` as optional string properties on `Account` interface
    - Remove `address` property from `Account` interface
    - Update `CreateAccountRequest` to include `street`, `place`, `postcode`, `canton`, `email`, `telephone` and remove `address`
    - _Requirements: 1.8, 1.9, 2.4, 3.4, 10.1, 10.2_

  - [x] 6.2 Update `accounts-validation.ts` with new field schemas
    - Remove `address` schema
    - Add `street` (max 200), `place` (max 100), `postcode` (max 20), `canton` (max 50), `email` (max 254), `telephone` (max 30) schemas with `.default("")`
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 2.2, 3.2_

  - [x] 6.3 Write unit tests for frontend validation schema
    - Verify each new field (including `canton`) validates max length correctly
    - Verify `address` field is not accepted
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 2.2_

- [x] 7. Update frontend components
  - [x] 7.1 Update `account-form.tsx` with new input fields
    - Remove `address` input field
    - Add input fields for `street`, `place`, `postcode`, `canton`, `email`, `telephone`
    - Wire form state and error handling for new fields
    - _Requirements: 10.3, 10.4_

  - [x] 7.2 Update `accounts-columns.tsx` with new table columns
    - Remove `address` column
    - Add columns for `street`, `place`, `postcode`, `canton`, `email`, `telephone`
    - Enable sorting with `caseInsensitive` sorting function for all new columns
    - _Requirements: 10.5_

  - [x] 7.3 Write unit tests for account form rendering
    - Verify form renders inputs for `street`, `place`, `postcode`, `canton`, `email`, `telephone`
    - Verify form does not render an `address` input
    - _Requirements: 10.3, 10.4_

  - [x] 7.4 Write unit tests for accounts table columns
    - Verify column definitions include `street`, `place`, `postcode`, `canton`, `email`, `telephone`
    - Verify column definitions do not include `address`
    - _Requirements: 10.5_

- [x] 8. Final checkpoint - Full verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- No data migration task is needed — the user will re-run the import after code changes
- No infrastructure changes are needed — DynamoDB is schemaless
- Property tests validate the 7 correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses Vitest with fast-check for property-based testing
- `canton` field is included in all layers (API, import, frontend) per the updated design
- TAG# items use DynamoDB single-table pattern: `PK=ACCOUNT#{number}`, `SK=TAG#{tag_name}`
- Tags are fully replaced on update (delete all existing TAG# items, write new set)
- **Sync process uses ConsignCloud `number` directly as account PK** — no sequence counter allocation for imported accounts
- **Sequence counter is updated once at end of sync** to the max imported number (only if higher than current), so `create-account.ts` (which uses counter+1) continues to work for manual account creation
- The existing `create-account.ts` route is unchanged in its use of the sequence counter for manually-created accounts

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.3"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "2.4"] },
    { "id": 3, "tasks": ["4.1", "6.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "6.2"] },
    { "id": 5, "tasks": ["4.4", "4.5", "6.3"] },
    { "id": 6, "tasks": ["7.1", "7.2"] },
    { "id": 7, "tasks": ["7.3", "7.4"] }
  ]
}
```
