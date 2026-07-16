#!/usr/bin/env node
// Usage: node scripts/retrigger-import-stream.mjs [--table thymos-dev-import] [--type ACCOUNT|ITEM|SALE|ALL]

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

function parseArgs(argv) {
  const args = { table: "thymos-dev-import", type: "ALL" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--table" && argv[i + 1]) {
      args.table = argv[++i];
    } else if (argv[i] === "--type" && argv[i + 1]) {
      args.type = argv[++i].toUpperCase();
    }
  }
  const validTypes = ["ACCOUNT", "ITEM", "SALE", "ALL"];
  if (!validTypes.includes(args.type)) {
    console.error(`Invalid --type value: ${args.type}. Must be one of: ${validTypes.join(", ")}`);
    process.exit(1);
  }
  return args;
}

function buildPkPrefix(type) {
  const base = "IMPORT#CONSIGNCLOUD#";
  if (type === "ALL") return base;
  return `${base}${type}#`;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { table, type } = parseArgs(process.argv);
  const pkPrefix = buildPkPrefix(type);

  console.log(`Scanning table: ${table}`);
  console.log(`PK prefix filter: ${pkPrefix}`);
  console.log(`Type filter: ${type}`);
  console.log("---");

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client);

  let totalFound = 0;
  let totalTouched = 0;
  let totalErrors = 0;
  let exclusiveStartKey = undefined;
  let pageCount = 0;

  do {
    pageCount++;
    const scanParams = {
      TableName: table,
      FilterExpression: "begins_with(PK, :prefix) AND attribute_not_exists(syncedAt)",
      ExpressionAttributeValues: {
        ":prefix": pkPrefix,
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

    console.log(`Page ${pageCount}: found ${items.length} unsynced records${exclusiveStartKey ? " (more pages)" : " (last page)"}`);

    for (const item of items) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: table,
            Key: { PK: item.PK, SK: item.SK },
            UpdateExpression: "SET #retriggeredAt = :ts",
            ExpressionAttributeNames: { "#retriggeredAt": "_retriggeredAt" },
            ExpressionAttributeValues: { ":ts": new Date().toISOString() },
          })
        );
        totalTouched++;
      } catch (err) {
        totalErrors++;
        console.error(`  Error updating ${item.PK} / ${item.SK}:`, err.message);
      }
    }

    if (exclusiveStartKey) {
      await sleep(100);
    }
  } while (exclusiveStartKey);

  console.log("---");
  console.log(`Done. Found: ${totalFound} | Touched: ${totalTouched} | Errors: ${totalErrors}`);
}

main();
