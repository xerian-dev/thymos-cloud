/**
 * Apply brand mappings: diffs draft vs applied in S3, applies delta to DynamoDB.
 * Runs as a separate Lambda invocation due to long execution time (full table scan).
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const TABLE_NAME = process.env.TABLE_NAME ?? "";
const BUCKET_NAME = process.env.BUCKET_NAME ?? "";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});
const s3Client = new S3Client({});

const DRAFT_KEY = "brand-mappings/draft.json";
const APPLIED_KEY = "brand-mappings/applied.json";
const STATUS_KEY = "brand-mappings/apply-status.json";

interface MappingEntry {
  raw: string;
  canonical: string;
}

interface ApplyStatus {
  status: "running" | "complete" | "error";
  startedAt: string;
  completedAt?: string;
  delta: number;
  itemsUpdated: number;
  errors: number;
  canonicalBrandsSeeded: number;
  message?: string;
}

async function writeStatus(status: ApplyStatus): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: STATUS_KEY,
      Body: JSON.stringify(status),
      ContentType: "application/json",
    }),
  );
}

export async function handler(): Promise<void> {
  const startedAt = new Date().toISOString();

  await writeStatus({
    status: "running",
    startedAt,
    delta: 0,
    itemsUpdated: 0,
    errors: 0,
    canonicalBrandsSeeded: 0,
  });

  try {
    // Load draft
    const draftResult = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: DRAFT_KEY }),
    );
    const draftBody = await draftResult.Body?.transformToString();
    if (!draftBody) {
      await writeStatus({
        status: "error",
        startedAt,
        completedAt: new Date().toISOString(),
        delta: 0,
        itemsUpdated: 0,
        errors: 0,
        canonicalBrandsSeeded: 0,
        message: "No draft mappings found",
      });
      return;
    }
    const draftMappings: MappingEntry[] = JSON.parse(draftBody);

    // Load applied (may not exist)
    let appliedMappings: MappingEntry[] = [];
    try {
      const appliedResult = await s3Client.send(
        new GetObjectCommand({ Bucket: BUCKET_NAME, Key: APPLIED_KEY }),
      );
      const appliedBody = await appliedResult.Body?.transformToString();
      if (appliedBody) {
        appliedMappings = JSON.parse(appliedBody);
      }
    } catch (error: unknown) {
      if (!(error instanceof Error && error.name === "NoSuchKey")) {
        throw error;
      }
    }

    // Compute delta
    const appliedMap = new Map(
      appliedMappings.map((m) => [m.raw, m.canonical]),
    );
    const delta: MappingEntry[] = [];
    for (const entry of draftMappings) {
      if (appliedMap.get(entry.raw) !== entry.canonical) {
        delta.push(entry);
      }
    }

    console.log(`[BrandApply] Delta: ${delta.length} changed mappings`);

    if (delta.length === 0) {
      await writeStatus({
        status: "complete",
        startedAt,
        completedAt: new Date().toISOString(),
        delta: 0,
        itemsUpdated: 0,
        errors: 0,
        canonicalBrandsSeeded: 0,
        message: "No changes to apply",
      });
      return;
    }

    // Build set of raw values to find
    const rawValues = new Set(delta.map((m) => m.raw));

    // Scan for items matching the raw values
    const itemIndex = new Map<string, Array<{ PK: string; SK: string }>>();
    let exclusiveStartKey: Record<string, unknown> | undefined;
    let scannedCount = 0;

    console.log("[BrandApply] Scanning table for matching items...");

    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          ProjectionExpression: "PK, SK, brand",
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );

      for (const item of result.Items ?? []) {
        const brand = item.brand as string | undefined;
        if (brand && rawValues.has(brand)) {
          const list = itemIndex.get(brand);
          const key = { PK: item.PK as string, SK: item.SK as string };
          if (list) {
            list.push(key);
          } else {
            itemIndex.set(brand, [key]);
          }
        }
      }

      scannedCount += result.Items?.length ?? 0;
      exclusiveStartKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);

    console.log(
      `[BrandApply] Scanned ${scannedCount} records, found matches for ${itemIndex.size} distinct brands`,
    );

    // Apply updates
    let applied = 0;
    let errors = 0;

    for (const mapping of delta) {
      const items = itemIndex.get(mapping.raw);
      if (!items || items.length === 0) continue;

      for (const key of items) {
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { PK: key.PK, SK: key.SK },
              UpdateExpression:
                "SET brand = :canonical, sourceBrand = if_not_exists(sourceBrand, :raw)",
              ExpressionAttributeValues: {
                ":canonical": mapping.canonical,
                ":raw": mapping.raw,
              },
            }),
          );
          applied++;
        } catch (err: unknown) {
          errors++;
          console.error(
            `[BrandApply] Error updating ${key.PK}: ${err instanceof Error ? err.message : "unknown"}`,
          );
        }
      }
    }

    console.log(`[BrandApply] Updated ${applied} items, ${errors} errors`);

    // Seed canonical list entries
    const canonicalSet = new Set(draftMappings.map((m) => m.canonical));
    const createdAt = new Date().toISOString();
    let seeded = 0;

    for (const canonical of canonicalSet) {
      const aliases = draftMappings
        .filter((m) => m.canonical === canonical && m.raw !== canonical)
        .map((m) => m.raw);

      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: "CANONICAL#BRANDS",
              SK: `BRAND#${canonical}`,
              name: canonical,
              aliases,
              createdAt,
            },
          }),
        );
        seeded++;
      } catch (err: unknown) {
        console.error(
          `[BrandApply] Error seeding canonical ${canonical}: ${err instanceof Error ? err.message : "unknown"}`,
        );
      }
    }

    // Snapshot applied.json
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: APPLIED_KEY,
        Body: JSON.stringify(draftMappings, null, 2),
        ContentType: "application/json",
      }),
    );

    const completedAt = new Date().toISOString();
    console.log(
      `[BrandApply] Complete. ${applied} items, ${seeded} canonical brands, ${errors} errors`,
    );

    await writeStatus({
      status: "complete",
      startedAt,
      completedAt,
      delta: delta.length,
      itemsUpdated: applied,
      errors,
      canonicalBrandsSeeded: seeded,
    });
  } catch (error: unknown) {
    console.error("[BrandApply] Fatal error:", error);
    await writeStatus({
      status: "error",
      startedAt,
      completedAt: new Date().toISOString(),
      delta: 0,
      itemsUpdated: 0,
      errors: 1,
      canonicalBrandsSeeded: 0,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
