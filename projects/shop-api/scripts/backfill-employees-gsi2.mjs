#!/usr/bin/env node
// Usage: node scripts/backfill-employees-gsi2.mjs [--table thymos-dev-shop] [--dry-run]
//
// Backfills GSI2PK/GSI2SK on employee METADATA records that are missing them.
// Sets GSI2PK = "EMPLOYEES" and GSI2SK = "EMPLOYEE#<uuid>" for each matching record.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
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
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "LIVE UPDATE"}`);
  console.log("---");

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  let totalFound = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  let exclusiveStartKey = undefined;
  let pageCount = 0;

  do {
    pageCount++;
    const scanParams = {
      TableName: table,
      FilterExpression:
        "begins_with(PK, :pkPrefix) AND SK = :sk AND attribute_not_exists(GSI2PK)",
      ExpressionAttributeValues: {
        ":pkPrefix": "EMPLOYEE#",
        ":sk": "METADATA",
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

    for (const item of items) {
      const pk = item.PK;
      const uuid = pk.replace("EMPLOYEE#", "");

      if (dryRun) {
        console.log(`  [dry-run] Would update ${pk}: GSI2PK=EMPLOYEES, GSI2SK=EMPLOYEE#${uuid}`);
        continue;
      }

      try {
        await docClient.send(
          new UpdateCommand({
            TableName: table,
            Key: { PK: pk, SK: "METADATA" },
            UpdateExpression: "SET GSI2PK = :gsi2pk, GSI2SK = :gsi2sk",
            ExpressionAttributeValues: {
              ":gsi2pk": "EMPLOYEES",
              ":gsi2sk": `EMPLOYEE#${uuid}`,
            },
          })
        );
        totalUpdated++;
      } catch (err) {
        totalErrors++;
        console.error(`  Error updating ${pk}:`, err.message);
      }
    }

    if (exclusiveStartKey) {
      await sleep(200);
    }
  } while (exclusiveStartKey);

  // Summary
  console.log("\n---");
  console.log("Summary:");
  console.log(`  Pages scanned: ${pageCount}`);
  console.log(`  Records found (missing GSI2): ${totalFound}`);
  if (dryRun) {
    console.log(`  Mode: DRY RUN — no records were updated`);
    console.log(`  Would update: ${totalFound} records`);
  } else {
    console.log(`  Records updated: ${totalUpdated}`);
    console.log(`  Errors: ${totalErrors}`);
  }
}

main();
