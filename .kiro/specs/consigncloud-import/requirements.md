# Requirements Document

## Introduction

This feature imports customer accounts from ConsignCloud's external API into the shop system. The import follows a two-phase approach: first, raw account data is fetched from ConsignCloud and staged in a dedicated DynamoDB import table; second, the staged data is synced into the main shop DynamoDB table, creating or updating accounts as needed. A report is generated after each sync operation summarizing what was added, updated, skipped, and any errors encountered.

## Glossary

- **Import_Lambda**: The AWS Lambda function responsible for fetching all accounts from the ConsignCloud API and writing them to the Import_Table
- **Import_Table**: A dedicated DynamoDB table used to stage raw account data fetched from ConsignCloud before syncing to the Shop_Table
- **Shop_Table**: The existing DynamoDB table (`thymos-{environment}-shop`) storing production account data
- **Sync_Lambda**: The AWS Lambda function (or API route) responsible for reading staged data from the Import_Table and creating/updating accounts in the Shop_Table
- **ConsignCloud_API**: The external REST API at `https://api.consigncloud.com/api/v1` providing account data
- **Import_Report**: A JSON summary produced after a sync operation detailing counts of added, updated, skipped, and errored records
- **Rate_Limiter**: A mechanism that throttles outbound requests to the ConsignCloud_API to stay within the leaky bucket rate limit (100 capacity, 10 req/sec drain)
- **Cursor**: A pagination token returned by the ConsignCloud_API (`next_cursor` field) used to fetch subsequent pages of results

## Requirements

### Requirement 1: Fetch Accounts from ConsignCloud

**User Story:** As a shop operator, I want to fetch all accounts from ConsignCloud, so that I have a complete copy of the external account data available for import.

#### Acceptance Criteria

1. WHEN the Import_Lambda is invoked, THE Import_Lambda SHALL authenticate with the ConsignCloud_API using a Bearer token retrieved from AWS SSM Parameter Store
2. WHEN fetching accounts, THE Import_Lambda SHALL request pages of up to 100 accounts using the `limit` query parameter
3. WHEN a response contains a non-null `next_cursor` value, THE Import_Lambda SHALL use that cursor to fetch the next page of results
4. WHEN a response contains a null `next_cursor` value, THE Import_Lambda SHALL stop paginating and consider the fetch complete
5. WHEN fetching accounts, THE Rate_Limiter SHALL ensure outbound requests do not exceed 10 requests per second sustained and 100 requests burst capacity
6. IF the ConsignCloud_API returns an HTTP 429 (Too Many Requests) response, THEN THE Import_Lambda SHALL wait for an appropriate backoff period before retrying the request
7. IF the ConsignCloud_API returns an HTTP 5xx response, THEN THE Import_Lambda SHALL retry the request up to 3 times with exponential backoff before recording a failure
8. WHEN a fetched account has a non-null deleted indicator, THE Import_Lambda SHALL skip that record and not write it to the Import_Table

### Requirement 2: Stage Imported Data

**User Story:** As a shop operator, I want fetched ConsignCloud accounts to be stored in a staging table, so that I can review and sync them separately from production data.

#### Acceptance Criteria

1. THE Import_Table SHALL store each account record with PK set to `IMPORT#CONSIGNCLOUD#{id}` and SK set to `METADATA`, where `id` is the ConsignCloud account UUID
2. WHEN writing an account to the Import_Table, THE Import_Lambda SHALL store all raw fields: id, number, first_name, last_name, company, email, balance, email_notifications_enabled, and created timestamp
3. WHEN writing an account to the Import_Table, THE Import_Lambda SHALL include an `importedAt` timestamp recording when the record was fetched
4. WHEN a record with the same ConsignCloud id already exists in the Import_Table, THE Import_Lambda SHALL overwrite the existing record with the latest data (idempotent upsert)
5. WHEN the import operation completes, THE Import_Lambda SHALL write a summary record to the Import_Table with PK `IMPORT#CONSIGNCLOUD#SUMMARY` and SK `LATEST` containing: total fetched count, skipped (deleted) count, stored count, timestamp, and status

### Requirement 3: Sync Staged Data to Shop Table

**User Story:** As a shop operator, I want to sync imported accounts from the staging table into the production shop table, so that ConsignCloud customers become usable accounts in the shop system.

#### Acceptance Criteria

1. WHEN the Sync_Lambda is invoked, THE Sync_Lambda SHALL scan all account records from the Import_Table (excluding the summary record)
2. WHEN processing an imported account that does not exist in the Shop_Table (matched by ConsignCloud id stored as a `sourceId` attribute), THE Sync_Lambda SHALL create a new account in the Shop_Table with the next available account number from the sequence counter
3. WHEN processing an imported account that already exists in the Shop_Table (matched by `sourceId`), THE Sync_Lambda SHALL update the existing account fields (name, address, telephone) if they differ from the imported data
4. WHEN processing an imported account that already exists in the Shop_Table with identical field values, THE Sync_Lambda SHALL skip the record without modification
5. WHEN creating a new account from imported data, THE Sync_Lambda SHALL map ConsignCloud fields to Shop_Table fields: `first_name` + `last_name` concatenated to `name`, `company` stored as `company`, and `email` stored as `telephone` (if no phone available)
6. THE Sync_Lambda SHALL process records sequentially to avoid race conditions on the sequence counter
7. IF writing an account to the Shop_Table fails, THEN THE Sync_Lambda SHALL record the error and continue processing remaining records

### Requirement 4: Generate Import Report

**User Story:** As a shop operator, I want a report after each sync operation, so that I can verify what was imported and identify any issues.

#### Acceptance Criteria

1. WHEN the sync operation completes, THE Sync_Lambda SHALL produce an Import_Report containing: count of accounts added, count of accounts updated, count of accounts skipped (no changes), count of accounts that errored, and a list of error details
2. WHEN an error occurs during sync processing, THE Import_Report SHALL include the ConsignCloud account id and a description of the error for each failed record
3. THE Sync_Lambda SHALL return the Import_Report as the response payload (JSON format) to the invoking caller
4. WHEN the sync operation completes, THE Sync_Lambda SHALL write the Import_Report to the Import_Table with PK `SYNC#REPORT` and SK set to the ISO timestamp of when the sync started

### Requirement 5: Infrastructure and Security

**User Story:** As a system administrator, I want the import infrastructure to follow existing patterns and security best practices, so that the system remains consistent and secure.

#### Acceptance Criteria

1. THE Import_Table SHALL be provisioned as a DynamoDB table with PAY_PER_REQUEST billing mode, PK (hash key) and SK (range key) both of type String
2. THE Import_Lambda SHALL have IAM permissions to read from SSM Parameter Store and read/write to the Import_Table
3. THE Sync_Lambda SHALL have IAM permissions to read from the Import_Table, and read/write to the Shop_Table
4. THE ConsignCloud API key SHALL be stored in AWS SSM Parameter Store as a SecureString parameter at path `/{project_name}/{environment}/consigncloud-api-key`
5. THE Import_Lambda SHALL have a timeout of at least 300 seconds to accommodate paginating through large account sets
6. THE Sync_Lambda SHALL have a timeout of at least 300 seconds to accommodate processing large numbers of accounts
7. WHEN invoking the Import_Lambda or Sync_Lambda, THE system SHALL require the caller to be authenticated via the existing Cognito authorizer

### Requirement 6: Observability and Error Handling

**User Story:** As a system administrator, I want visibility into import operations, so that I can monitor and troubleshoot issues.

#### Acceptance Criteria

1. WHEN the Import_Lambda begins execution, THE Import_Lambda SHALL log the start time and invocation context
2. WHEN the Import_Lambda completes execution, THE Import_Lambda SHALL log the total accounts fetched, accounts skipped, accounts stored, and elapsed time
3. IF a non-retryable error occurs during import, THEN THE Import_Lambda SHALL log the error details and terminate with a descriptive error message
4. WHEN the Sync_Lambda begins execution, THE Sync_Lambda SHALL log the start time and number of records to process
5. WHEN the Sync_Lambda completes execution, THE Sync_Lambda SHALL log the Import_Report summary
6. IF an unexpected error occurs during sync that prevents further processing, THEN THE Sync_Lambda SHALL log the error, produce a partial Import_Report with records processed so far, and return it with an error status
