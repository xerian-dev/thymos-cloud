# Design Document: Import Job Query Optimization

## Overview

Replace full DynamoDB table scans in the import job system with efficient Query operations by introducing "fat pointer" records under a well-known `JOBS` partition key. The pointer sort key pattern `<PREFIX>#<lastUpdatedAt>#<jobId>` enables time-sorted listing per import type without a GSI. Pointer records duplicate essential job fields so that queries can serve API responses directly without follow-up GetItem calls.

## Architecture

### Data Layer: Pointer Records

A new record type stored alongside existing job data in the same DynamoDB table (`IMPORT_TABLE_NAME`):

| Field | Source |
|-------|--------|
| PK | `JOBS` (fixed partition key for all pointer records) |
| SK | `<PREFIX>#<lastUpdatedAt>#<jobId>` |
| jobId | From job metadata |
| state | From job metadata |
| phase | From job metadata |
| progress | From job metadata (full progress object) |
| startedAt | From job metadata |
| lastUpdatedAt | From job metadata |
| error | From job metadata (optional) |
| prefix | Import type identifier (e.g., `ITEM_IMPORT`) |

The SK is naturally sorted by time because ISO 8601 timestamps sort lexicographically. The `begins_with(SK, '<PREFIX>#')` condition isolates records by import type.

### Key Insight: SK Immutability

DynamoDB keys are immutable — you cannot update a sort key. When `lastUpdatedAt` changes (on every state transition or phase update), the pointer must be replaced: delete the old record, write the new one. This maintains correct sort order.

## Components

### 1. Pointer Manager Module

A new internal module (or extension to `generic-job-manager.ts`) handling pointer CRUD:

```typescript
interface PointerRecord {
  jobId: string;
  state: JobState;
  phase: ImportPhase;
  progress: ProgressCounts;
  startedAt: string;
  lastUpdatedAt: string;
  error?: string;
  prefix: string;
}

interface PointerManager {
  createPointer(job: ImportJob, prefix: string): Promise<void>;
  updatePointer(
    jobId: string,
    prefix: string,
    oldLastUpdatedAt: string,
    updates: Partial<PointerRecord>,
  ): Promise<void>;
  queryActiveJob(prefix: string): Promise<PointerRecord | null>;
  queryMostRecent(prefix: string): Promise<PointerRecord | null>;
  queryHistory(
    prefix: string,
    pageSize: number,
    exclusiveStartKey?: Record<string, unknown>,
  ): Promise<{ items: PointerRecord[]; lastEvaluatedKey?: Record<string, unknown> }>;
}
```

### 2. Modified `createJobManager` Return

The existing `createJob` function will be extended to write the pointer record atomically alongside the metadata record using `TransactWriteCommand`:

```typescript
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";

async function createJob(filterParams: { createdAfter?: string }): Promise<ImportJob> {
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();

  const job: ImportJob = {
    jobId,
    state: "running",
    phase: "fetch",
    startedAt: now,
    lastUpdatedAt: now,
    filterParams,
    progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
  };

  const pointerSK = buildPointerSK(prefix, now, jobId);

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: IMPORT_TABLE_NAME,
            Item: { PK: `${prefix}#${jobId}`, SK: "METADATA", ...job },
          },
        },
        {
          Put: {
            TableName: IMPORT_TABLE_NAME,
            Item: {
              PK: "JOBS",
              SK: pointerSK,
              jobId,
              state: "running",
              phase: "fetch",
              progress: job.progress,
              startedAt: now,
              lastUpdatedAt: now,
              prefix,
            },
          },
        },
      ],
    }),
  );

  return job;
}
```

### 3. Modified `transitionJob`

After updating the metadata record, delete the old pointer and write the new one:

```typescript
async function transitionJob(
  jobId: string,
  state: JobState,
  progress: ProgressCounts,
  error?: string,
): Promise<void> {
  const currentJob = await getJob(jobId);
  if (!currentJob) {
    throw new Error(`${entityLabel} ${jobId} not found`);
  }

  const validTargets = VALID_TRANSITIONS[currentJob.state];
  if (!validTargets.includes(state)) {
    throw new Error(
      `Invalid state transition: cannot transition from '${currentJob.state}' to '${state}'`,
    );
  }

  const now = new Date().toISOString();
  const oldPointerSK = buildPointerSK(prefix, currentJob.lastUpdatedAt, jobId);
  const newPointerSK = buildPointerSK(prefix, now, jobId);
  const truncatedError = error ? error.slice(0, 500) : undefined;

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: IMPORT_TABLE_NAME,
            Key: { PK: `${prefix}#${jobId}`, SK: "METADATA" },
            UpdateExpression:
              "SET #state = :state, progress = :progress, lastUpdatedAt = :now" +
              (truncatedError !== undefined ? ", #error = :error" : ""),
            ExpressionAttributeNames: {
              "#state": "state",
              ...(truncatedError !== undefined ? { "#error": "error" } : {}),
            },
            ExpressionAttributeValues: {
              ":state": state,
              ":progress": progress,
              ":now": now,
              ...(truncatedError !== undefined ? { ":error": truncatedError } : {}),
            },
          },
        },
        { Delete: { TableName: IMPORT_TABLE_NAME, Key: { PK: "JOBS", SK: oldPointerSK } } },
        {
          Put: {
            TableName: IMPORT_TABLE_NAME,
            Item: {
              PK: "JOBS",
              SK: newPointerSK,
              jobId,
              state,
              phase: currentJob.phase,
              progress,
              startedAt: currentJob.startedAt,
              lastUpdatedAt: now,
              prefix,
              ...(truncatedError !== undefined ? { error: truncatedError } : {}),
            },
          },
        },
      ],
    }),
  );
}
```

### 4. Modified `updateJobPhase`

Same delete-old/write-new pattern:

```typescript
async function updateJobPhase(jobId: string, phase: ImportPhase): Promise<void> {
  const currentJob = await getJob(jobId);
  if (!currentJob) {
    throw new Error(`${entityLabel} ${jobId} not found`);
  }

  const now = new Date().toISOString();
  const oldPointerSK = buildPointerSK(prefix, currentJob.lastUpdatedAt, jobId);
  const newPointerSK = buildPointerSK(prefix, now, jobId);

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: IMPORT_TABLE_NAME,
            Key: { PK: `${prefix}#${jobId}`, SK: "METADATA" },
            UpdateExpression: "SET #phase = :phase, lastUpdatedAt = :now",
            ExpressionAttributeNames: { "#phase": "phase" },
            ExpressionAttributeValues: { ":phase": phase, ":now": now },
          },
        },
        { Delete: { TableName: IMPORT_TABLE_NAME, Key: { PK: "JOBS", SK: oldPointerSK } } },
        {
          Put: {
            TableName: IMPORT_TABLE_NAME,
            Item: {
              PK: "JOBS",
              SK: newPointerSK,
              jobId,
              state: currentJob.state,
              phase,
              progress: currentJob.progress,
              startedAt: currentJob.startedAt,
              lastUpdatedAt: now,
              prefix,
              ...(currentJob.error ? { error: currentJob.error } : {}),
            },
          },
        },
      ],
    }),
  );
}
```

### 5. Replacement Query: `getRunningOrPausedJob`

```typescript
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

async function getRunningOrPausedJob(): Promise<ImportJob | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: IMPORT_TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      FilterExpression: "#state = :running OR #state = :paused",
      ExpressionAttributeNames: { "#state": "state" },
      ExpressionAttributeValues: {
        ":pk": "JOBS",
        ":skPrefix": `${prefix}#`,
        ":running": "running",
        ":paused": "paused",
      },
      ScanIndexForward: false,
    }),
  );

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  return mapPointerToImportJob(result.Items[0]);
}
```

### 6. Replacement Query: `getMostRecentJob`

```typescript
async function getMostRecentJob(prefix: string): Promise<ImportJob | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: IMPORT_TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": "JOBS",
        ":skPrefix": `${prefix}#`,
      },
      ScanIndexForward: false,
      Limit: 1,
    }),
  );

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  return mapPointerToImportJob(result.Items[0]);
}
```

### 7. Replacement Query: `getHistoryJobs`

```typescript
async function getHistoryJobs(
  prefix: string,
  pageSize: number,
  nextToken: string | undefined,
): Promise<ImportHistoryResponse> {
  let exclusiveStartKey: Record<string, unknown> | undefined;

  if (nextToken) {
    try {
      const decoded = Buffer.from(nextToken, "base64").toString("utf-8");
      exclusiveStartKey = JSON.parse(decoded) as Record<string, unknown>;
    } catch {
      exclusiveStartKey = undefined;
    }
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: IMPORT_TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": "JOBS",
        ":skPrefix": `${prefix}#`,
      },
      ScanIndexForward: false,
      Limit: pageSize,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );

  const jobs: HistoryJobSummary[] = (result.Items ?? []).map((item) => ({
    jobId: item.jobId as string,
    state: item.state as string,
    phase: (item.phase as string) ?? "fetch",
    startedAt: item.startedAt as string,
    lastUpdatedAt: item.lastUpdatedAt as string,
    progress: item.progress as ProgressCounts,
    ...(item.error ? { error: item.error as string } : {}),
  }));

  const response: ImportHistoryResponse = { jobs };

  if (result.LastEvaluatedKey) {
    response.nextToken = Buffer.from(
      JSON.stringify(result.LastEvaluatedKey),
    ).toString("base64");
  }

  return response;
}
```

### 8. Cancel Handler Changes

Instead of deleting the metadata record, cancel now transitions the job to `cancelled` state and updates the pointer:

```typescript
async function cancelJob(jobId: string): Promise<void> {
  const currentJob = await getJob(jobId);
  if (!currentJob) {
    throw new Error(`Job ${jobId} not found`);
  }

  // Validate cancellable states
  if (
    currentJob.state !== "running" &&
    currentJob.state !== "paused" &&
    currentJob.state !== "failed"
  ) {
    throw new Error(
      `Cannot cancel job in '${currentJob.state}' state.`,
    );
  }

  const now = new Date().toISOString();
  const oldPointerSK = buildPointerSK(prefix, currentJob.lastUpdatedAt, jobId);
  const newPointerSK = buildPointerSK(prefix, now, jobId);

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: IMPORT_TABLE_NAME,
            Key: { PK: `${prefix}#${jobId}`, SK: "METADATA" },
            UpdateExpression: "SET #state = :state, lastUpdatedAt = :now",
            ExpressionAttributeNames: { "#state": "state" },
            ExpressionAttributeValues: { ":state": "cancelled", ":now": now },
          },
        },
        { Delete: { TableName: IMPORT_TABLE_NAME, Key: { PK: "JOBS", SK: oldPointerSK } } },
        {
          Put: {
            TableName: IMPORT_TABLE_NAME,
            Item: {
              PK: "JOBS",
              SK: newPointerSK,
              jobId,
              state: "cancelled",
              phase: currentJob.phase,
              progress: currentJob.progress,
              startedAt: currentJob.startedAt,
              lastUpdatedAt: now,
              prefix,
              ...(currentJob.error ? { error: currentJob.error } : {}),
            },
          },
        },
      ],
    }),
  );
}
```

### 9. Migration Script

A standalone script (`projects/shop-api/src/import/scripts/migrate-job-pointers.ts`) that:

1. Scans all `METADATA` records for each prefix (`ITEM_IMPORT`, `SALE_IMPORT`, `ACCOUNT_IMPORT`)
2. For each record, attempts a conditional PutItem (condition: `attribute_not_exists(PK)`) for the pointer
3. The condition expression makes it idempotent — if the pointer already exists, the put is skipped

```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const PREFIXES = ["ITEM_IMPORT", "SALE_IMPORT", "ACCOUNT_IMPORT"] as const;

async function migrate(): Promise<void> {
  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });

  const tableName = process.env.IMPORT_TABLE_NAME;
  if (!tableName) {
    throw new Error("IMPORT_TABLE_NAME environment variable is required");
  }

  let totalFound = 0;
  let totalCreated = 0;
  let totalSkipped = 0;

  for (const prefix of PREFIXES) {
    console.log(`Processing ${prefix}...`);
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: "begins_with(PK, :pkPrefix) AND SK = :sk",
          ExpressionAttributeValues: {
            ":pkPrefix": `${prefix}#`,
            ":sk": "METADATA",
          },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );

      for (const item of result.Items ?? []) {
        totalFound++;
        const jobId = item.jobId as string;
        const lastUpdatedAt = item.lastUpdatedAt as string;
        const pointerSK = `${prefix}#${lastUpdatedAt}#${jobId}`;

        try {
          await docClient.send(
            new PutCommand({
              TableName: tableName,
              Item: {
                PK: "JOBS",
                SK: pointerSK,
                jobId,
                state: item.state,
                phase: item.phase ?? "fetch",
                progress: item.progress,
                startedAt: item.startedAt,
                lastUpdatedAt,
                prefix,
                ...(item.error ? { error: item.error } : {}),
              },
              ConditionExpression: "attribute_not_exists(PK)",
            }),
          );
          totalCreated++;
        } catch (err: unknown) {
          if (
            err instanceof Error &&
            err.name === "ConditionalCheckFailedException"
          ) {
            totalSkipped++;
          } else {
            throw err;
          }
        }
      }

      exclusiveStartKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);
  }

  console.log(`Migration complete. Found: ${totalFound}, Created: ${totalCreated}, Skipped: ${totalSkipped}`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

## Interfaces

### Helper Function: `buildPointerSK`

```typescript
function buildPointerSK(prefix: string, lastUpdatedAt: string, jobId: string): string {
  return `${prefix}#${lastUpdatedAt}#${jobId}`;
}
```

### Helper Function: `mapPointerToImportJob`

```typescript
function mapPointerToImportJob(item: Record<string, unknown>): ImportJob {
  return {
    jobId: item.jobId as string,
    state: item.state as JobState,
    phase: (item.phase as ImportPhase) ?? "fetch",
    startedAt: item.startedAt as string,
    lastUpdatedAt: item.lastUpdatedAt as string,
    filterParams: {},  // Not stored on pointer — not needed for status/history responses
    error: item.error as string | undefined,
    progress: item.progress as ProgressCounts,
  };
}
```

### Updated `JobState` Type

```typescript
export type JobState = "running" | "paused" | "failed" | "complete" | "cancelled";

const VALID_TRANSITIONS: Record<JobState, JobState[]> = {
  running: ["complete", "paused", "failed"],
  paused: ["running"],
  failed: ["running"],
  complete: [],
  cancelled: [],  // Terminal state — no outbound transitions
};
```

## Data Model

### Pointer Record in DynamoDB Table

| PK | SK | Fields |
|----|-----|--------|
| `JOBS` | `ITEM_IMPORT#2024-01-15T10:30:00.000Z#abc-123` | jobId, state, phase, progress, startedAt, lastUpdatedAt, error, prefix |
| `JOBS` | `SALE_IMPORT#2024-01-15T11:00:00.000Z#def-456` | jobId, state, phase, progress, startedAt, lastUpdatedAt, error, prefix |
| `JOBS` | `ACCOUNT_IMPORT#2024-01-15T12:00:00.000Z#ghi-789` | jobId, state, phase, progress, startedAt, lastUpdatedAt, error, prefix |

### Access Patterns

| Pattern | Operation | Key Condition |
|---------|-----------|---------------|
| Get active job for type | Query | `PK = JOBS AND begins_with(SK, <PREFIX>#)` + filter `state IN (running, paused)` |
| Get most recent job for type | Query | `PK = JOBS AND begins_with(SK, <PREFIX>#)`, `ScanIndexForward: false`, `Limit: 1` |
| Get history page for type | Query | `PK = JOBS AND begins_with(SK, <PREFIX>#)`, `ScanIndexForward: false`, `Limit: pageSize` |

### Why No GSI

The `JOBS` partition key is a single well-known value. All pointer records live under it. The `begins_with` condition on the sort key filters by import type. Since the SK contains the ISO 8601 timestamp, DynamoDB naturally sorts records chronologically. With `ScanIndexForward: false`, we get reverse chronological order. This design avoids adding a GSI (and its associated cost/provisioning) while achieving O(1) partition access + O(page_size) sort key traversal.

## Error Handling

- **TransactWriteCommand failure**: If the transaction fails (e.g., conditional check on metadata already gone), the entire transaction rolls back. No partial pointer state.
- **Stale pointer on race condition**: If two concurrent operations both try to update the same pointer (both read the same `lastUpdatedAt` to build the old SK), one transaction will fail because the Delete targets a non-existent SK. The retry logic should re-read the current job state.
- **Migration ConditionalCheckFailedException**: Handled gracefully — the pointer already exists, increment skip counter.
- **Missing metadata on transition**: Throws error, no pointer modification (existing behavior preserved).

## Performance Considerations

- **Before (Scan)**: O(n) where n = total items in table. Full table scan with filter. Multiple pages possible.
- **After (Query)**: O(k) where k = items matching the prefix. Single partition read. For most-recent-job, exactly 1 item read.
- **Write overhead**: Each state transition/phase change now requires 3 DynamoDB operations in a transaction (update metadata + delete old pointer + put new pointer) vs 1 operation before. This is acceptable because transitions are infrequent (a few per job lifecycle) and the read path is called on every page load.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Pointer creation completeness

For any newly created import job with a valid prefix and timestamp, the resulting pointer record SHALL have SK matching the pattern `<PREFIX>#<startedAt>#<jobId>` and contain all required fields (jobId, state, phase, progress, startedAt, lastUpdatedAt, prefix) with values identical to the job metadata record.

**Validates: Requirements 1.1, 1.2**

### Property 2: State transition pointer consistency

For any valid state transition (from a non-terminal state to a valid target state), the old pointer record (keyed by the previous lastUpdatedAt) SHALL be deleted and a new pointer record SHALL exist with updated SK containing the new lastUpdatedAt, and the pointer's state, progress, and error fields SHALL match the transition parameters.

**Validates: Requirements 2.1, 2.2**

### Property 3: Phase change pointer consistency

For any phase change operation on an existing job, the old pointer record SHALL be deleted and a new pointer record SHALL exist with updated SK containing the new lastUpdatedAt, and the pointer's phase field SHALL match the new phase.

**Validates: Requirements 3.1, 3.2**

### Property 4: Active job filter correctness

For any set of pointer records with varying states under a given prefix, querying for active jobs SHALL return only records where state equals `running` or `paused`, and SHALL never return records with state `complete`, `failed`, or `cancelled`.

**Validates: Requirements 4.2, 9.3**

### Property 5: Most recent job ordering

For any set of pointer records under a given prefix with distinct lastUpdatedAt values, querying for the most recent job SHALL return the record whose lastUpdatedAt is lexicographically greatest (i.e., the latest timestamp).

**Validates: Requirements 5.1**

### Property 6: History pagination completeness

For any set of N pointer records under a given prefix and any valid page size P, iterating through all pages using nextToken SHALL yield exactly N records total, in reverse chronological order by lastUpdatedAt, with no duplicates and no gaps.

**Validates: Requirements 6.1, 6.2, 6.3**

### Property 7: Cancel preserves history visibility

For any job in a cancellable state (running, paused, or failed), after cancellation the pointer record SHALL have state `cancelled` and SHALL be returned by history queries for that prefix.

**Validates: Requirements 7.1, 7.2, 7.3**

### Property 8: Migration idempotence

For any set of existing job metadata records, running the migration function twice SHALL produce the same set of pointer records as running it once — no duplicates, no missing records.

**Validates: Requirements 8.2, 8.3, 8.5**

### Property 9: Cancelled is a terminal state

For any job in `cancelled` state and any target state, attempting a state transition SHALL be rejected (throw an error), leaving the pointer record unchanged.

**Validates: Requirements 9.2**
