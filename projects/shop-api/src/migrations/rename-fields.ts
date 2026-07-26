/**
 * One-shot migration script: renames DynamoDB attributes to match the new naming convention.
 *
 * - ACCOUNT records: `shopUid` → `accountNumber`
 * - SALE records: `number` → `saleNumber`
 *
 * Usage:
 *   TABLE_NAME=thymos-dev-shop npx tsx src/migrations/rename-fields.ts
 *
 * Safe to run multiple times (idempotent) — skips records already migrated.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? "eu-central-1" });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE_NAME = process.env.TABLE_NAME;
if (!TABLE_NAME) {
  console.error("ERROR: TABLE_NAME environment variable is required");
  process.exit(1);
}

interface MigrationStats {
  scanned: number;
  accountsMigrated: number;
  accountsSkipped: number;
  salesMigrated: number;
  salesSkipped: number;
  errors: number;
}

async function migrateAccounts(stats: MigrationStats): Promise<void> {
  console.log("\n--- Migrating ACCOUNT records: shopUid → accountNumber ---");

  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "begins_with(PK, :prefix) AND SK = :sk",
        ExpressionAttributeValues: {
          ":prefix": "ACCOUNT#",
          ":sk": "METADATA",
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = result.Items ?? [];
    stats.scanned += items.length;

    for (const item of items) {
      const pk = item.PK as string;
      const sk = item.SK as string;
      const shopUid = item.shopUid;
      const accountNumber = item.accountNumber;

      // Already migrated
      if (accountNumber !== undefined && shopUid === undefined) {
        stats.accountsSkipped++;
        continue;
      }

      // Needs migration: has shopUid but no accountNumber
      if (shopUid !== undefined) {
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { PK: pk, SK: sk },
              UpdateExpression: "SET accountNumber = :val REMOVE shopUid",
              ExpressionAttributeValues: { ":val": shopUid },
              ConditionExpression: "attribute_exists(PK)",
            }),
          );
          stats.accountsMigrated++;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Unknown error";
          console.error(`  ERROR migrating account ${pk}: ${message}`);
          stats.errors++;
        }
      } else {
        // No shopUid and no accountNumber — unexpected state
        console.warn(`  WARN: Account ${pk} has neither shopUid nor accountNumber`);
        stats.accountsSkipped++;
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);
}

async function migrateSales(stats: MigrationStats): Promise<void> {
  console.log("\n--- Migrating SALE records: number → saleNumber ---");

  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "begins_with(PK, :prefix) AND SK = :sk",
        ExpressionAttributeValues: {
          ":prefix": "SALE#",
          ":sk": "METADATA",
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = result.Items ?? [];
    stats.scanned += items.length;

    for (const item of items) {
      const pk = item.PK as string;
      const sk = item.SK as string;
      const numberField = item.number;
      const saleNumber = item.saleNumber;

      // Already migrated
      if (saleNumber !== undefined && numberField === undefined) {
        stats.salesSkipped++;
        continue;
      }

      // Needs migration: has `number` but no `saleNumber`
      if (numberField !== undefined) {
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { PK: pk, SK: sk },
              UpdateExpression: "SET saleNumber = :val REMOVE #num",
              ExpressionAttributeNames: { "#num": "number" },
              ExpressionAttributeValues: { ":val": numberField },
              ConditionExpression: "attribute_exists(PK)",
            }),
          );
          stats.salesMigrated++;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Unknown error";
          console.error(`  ERROR migrating sale ${pk}: ${message}`);
          stats.errors++;
        }
      } else {
        // No number and no saleNumber — unexpected state
        console.warn(`  WARN: Sale ${pk} has neither number nor saleNumber`);
        stats.salesSkipped++;
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);
}

async function main(): Promise<void> {
  console.log(`Migration: rename-fields`);
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Region: ${process.env.AWS_REGION ?? "eu-central-1"}`);

  const stats: MigrationStats = {
    scanned: 0,
    accountsMigrated: 0,
    accountsSkipped: 0,
    salesMigrated: 0,
    salesSkipped: 0,
    errors: 0,
  };

  await migrateAccounts(stats);
  await migrateSales(stats);

  console.log("\n--- Migration complete ---");
  console.log(`  Records scanned:     ${stats.scanned}`);
  console.log(`  Accounts migrated:   ${stats.accountsMigrated}`);
  console.log(`  Accounts skipped:    ${stats.accountsSkipped}`);
  console.log(`  Sales migrated:      ${stats.salesMigrated}`);
  console.log(`  Sales skipped:       ${stats.salesSkipped}`);
  console.log(`  Errors:              ${stats.errors}`);

  if (stats.errors > 0) {
    console.error("\nMigration completed with errors. Review output above.");
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
