/**
 * Temporary migration Lambda.
 *
 * Copies PRICING_REF, ADJUSTMENT, and EMPLOYEE_PRICING records from the
 * shop table to the new dedicated pricing table. Idempotent — safe to run
 * multiple times (overwrites with same data).
 *
 * Invoke manually via AWS CLI:
 *   aws lambda invoke --function-name thymos-dev-migrate-pricing \
 *     --region eu-central-1 /dev/stdout
 *
 * Delete this Lambda and its Terraform resource after confirming migration.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const SOURCE_TABLE = process.env.TABLE_NAME ?? "";
const TARGET_TABLE = process.env.PRICING_TABLE_NAME ?? "";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

interface MigrationResult {
  pricingRefs: number;
  adjustments: number;
  employeePricing: number;
  errors: number;
}

async function scanPricingRecords(
  prefix: string,
): Promise<Record<string, unknown>[]> {
  const records: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: SOURCE_TABLE,
        FilterExpression: "begins_with(PK, :prefix)",
        ExpressionAttributeValues: {
          ":prefix": prefix,
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    if (result.Items) {
      records.push(...(result.Items as Record<string, unknown>[]));
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  return records;
}

async function writeRecord(record: Record<string, unknown>): Promise<boolean> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: TARGET_TABLE,
        Item: record,
      }),
    );
    return true;
  } catch (error) {
    console.error(
      `Failed to write record PK=${record.PK}, SK=${record.SK}:`,
      error,
    );
    return false;
  }
}

export async function handler(): Promise<MigrationResult> {
  console.log(
    `[Migration] Starting pricing data migration: ${SOURCE_TABLE} → ${TARGET_TABLE}`,
  );

  const result: MigrationResult = {
    pricingRefs: 0,
    adjustments: 0,
    employeePricing: 0,
    errors: 0,
  };

  // Migrate PRICING_REF records
  console.log("[Migration] Scanning PRICING_REF records...");
  const pricingRefs = await scanPricingRecords("PRICING_REF#");
  console.log(`[Migration] Found ${pricingRefs.length} PRICING_REF records`);

  for (const record of pricingRefs) {
    const success = await writeRecord(record);
    if (success) {
      result.pricingRefs++;
    } else {
      result.errors++;
    }
  }

  // Migrate ADJUSTMENT records
  console.log("[Migration] Scanning ADJUSTMENT records...");
  const adjustments = await scanPricingRecords("ADJUSTMENT#");
  console.log(`[Migration] Found ${adjustments.length} ADJUSTMENT records`);

  for (const record of adjustments) {
    const success = await writeRecord(record);
    if (success) {
      result.adjustments++;
    } else {
      result.errors++;
    }
  }

  // Migrate EMPLOYEE_PRICING records
  console.log("[Migration] Scanning EMPLOYEE_PRICING records...");
  const employeePricing = await scanPricingRecords("EMPLOYEE_PRICING#");
  console.log(
    `[Migration] Found ${employeePricing.length} EMPLOYEE_PRICING records`,
  );

  for (const record of employeePricing) {
    const success = await writeRecord(record);
    if (success) {
      result.employeePricing++;
    } else {
      result.errors++;
    }
  }

  const total =
    result.pricingRefs + result.adjustments + result.employeePricing;
  console.log(`[Migration] Complete. Migrated ${total} records, ${result.errors} errors.`);
  console.log(`[Migration] Breakdown:`, result);

  return result;
}
