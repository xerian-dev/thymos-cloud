#!/usr/bin/env node
// Usage: node scripts/delete-shop-accounts.mjs [--table thymos-dev-shop] [--dry-run]
//
// Deletes all ACCOUNT# records and the SEQUENCE#ACCOUNT counter from the Shop table.
// This allows the stream sync to recreate accounts with correct GSI format.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

function parseArgs(argv) {
  const args = { table: "thymos-dev-shop", dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--table" && argv[i + 1]) {
      args.table = argv[++i];
    } else if (argv[i] === "--dry-run") {
      args.dryRun = true;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { table, dryRun } = parseArgs(process.argv);

  console.log(`Table: ${table}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no deletes)" : "LIVE DELETE"}`);
  console.log("---");

  if (!dryRun) {
    console.warn(
      `⚠️  This will DELETE all account records from "${table}". Press Ctrl+C to abort.`
    );
    console.log("Waiting 3 seconds...");
    await sleep(3000);
  }

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  let totalFound = 0;
  let totalDeleted = 0;
  let totalErrors = 0;
  let exclusiveStartKey = undefined;
  let pageCount = 0;

  // Phase 1: Scan and delete all ACCOUNT# records
  console.log("\n[Phase 1] Scanning for ACCOUNT# records...");

  do {
    pageCount++;
    const scanParams = {
      TableName: table,
      FilterExpression: "begins_with(PK, :prefix)",
      ExpressionAttributeValues: {
        ":prefix": "ACCOUNT#",
      },
      ExclusiveStartKey: exclusiveStartKey,
    };

    let scanResult;
    try {
      scanResult = await docClient.send(new ScanCommand(scanParams));
    } catch (err) {
      console.error(`Error scanning table (page ${pageCount}):`, err.message);
      process.exit(1);
    }

    const items = scanResult.Items || [];
    totalFound += items.length;
    exclusiveStartKey = scanResult.LastEvaluatedKey;

    console.log(
      `  Page ${pageCount}: found ${items.length} records${exclusiveStartKey ? " (more pages)" : " (last page)"}`
    );

    if (dryRun || items.length === 0) {
      if (exclusiveStartKey) await sleep(100);
      continue;
    }

    // Batch delete in chunks of 25
    for (let i = 0; i < items.length; i += 25) {
      const batch = items.slice(i, i + 25);
      const deleteRequests = batch.map((item) => ({
        DeleteRequest: {
          Key: { PK: item.PK, SK: item.SK },
        },
      }));

      try {
        const result = await docClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [table]: deleteRequests,
            },
          })
        );

        const unprocessed = result.UnprocessedItems?.[table]?.length || 0;
        const deleted = batch.length - unprocessed;
        totalDeleted += deleted;
        totalErrors += unprocessed;

        if (unprocessed > 0) {
          console.warn(`  ⚠️  ${unprocessed} unprocessed items in batch`);
        }
      } catch (err) {
        totalErrors += batch.length;
        console.error(`  Error deleting batch:`, err.message);
      }

      await sleep(100);
    }
  } while (exclusiveStartKey);

  // Phase 2: Delete the sequence counter record
  console.log("\n[Phase 2] Deleting SEQUENCE#ACCOUNT counter...");

  const sequenceKey = { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER" };

  if (dryRun) {
    console.log("  Would delete:", JSON.stringify(sequenceKey));
  } else {
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: table,
          Key: sequenceKey,
        })
      );
      totalDeleted++;
      console.log("  ✓ Sequence counter deleted.");
    } catch (err) {
      totalErrors++;
      console.error("  Error deleting sequence counter:", err.message);
    }
  }

  // Summary
  console.log("\n---");
  console.log("Summary:");
  console.log(`  Pages scanned: ${pageCount}`);
  console.log(`  Account records found: ${totalFound}`);
  if (dryRun) {
    console.log(`  Mode: DRY RUN — no records were deleted`);
    console.log(`  Would delete: ${totalFound} account records + 1 sequence counter`);
  } else {
    console.log(`  Records deleted: ${totalDeleted} (includes sequence counter)`);
    console.log(`  Errors: ${totalErrors}`);
    console.log(`  ✓ Sequence counter (SEQUENCE#ACCOUNT / COUNTER) was deleted.`);
  }
}

main();
