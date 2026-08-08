/**
 * Apply color mappings: diffs draft vs applied in S3, applies delta to DynamoDB.
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

const DRAFT_KEY = "color-mappings/draft.json";
const APPLIED_KEY = "color-mappings/applied.json";
const STATUS_KEY = "color-mappings/apply-status.json";

async function processBatch<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<void>,
  onProgress?: (completed: number) => void,
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(fn));

    for (const result of results) {
      if (result.status === "fulfilled") succeeded++;
      else failed++;
    }

    if (onProgress && (i + batchSize) % 1000 < batchSize) {
      onProgress(succeeded + failed);
    }
  }

  return { succeeded, failed };
}

export interface MappingEntry {
  raw: string;
  canonical: string | null;
  pattern: string | null;
}

interface ApplyStatus {
  status: "running" | "complete" | "error";
  startedAt: string;
  completedAt?: string;
  delta: number;
  itemsUpdated: number;
  errors: number;
  canonicalColorsSeeded: number;
  canonicalPatternsSeeded: number;
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

/**
 * Compute the delta between draft and applied mappings.
 * An entry is included in the delta if its canonical or pattern value changed.
 */
export function computeDelta(
  draft: MappingEntry[],
  applied: MappingEntry[],
): MappingEntry[] {
  const appliedMap = new Map(
    applied.map((m) => [m.raw, { canonical: m.canonical, pattern: m.pattern }]),
  );

  const delta: MappingEntry[] = [];
  for (const entry of draft) {
    const prev = appliedMap.get(entry.raw);
    if (
      !prev ||
      prev.canonical !== entry.canonical ||
      prev.pattern !== entry.pattern
    ) {
      delta.push(entry);
    }
  }
  return delta;
}

export async function handler(): Promise<void> {
  const startedAt = new Date().toISOString();

  await writeStatus({
    status: "running",
    startedAt,
    delta: 0,
    itemsUpdated: 0,
    errors: 0,
    canonicalColorsSeeded: 0,
    canonicalPatternsSeeded: 0,
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
        canonicalColorsSeeded: 0,
        canonicalPatternsSeeded: 0,
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
    const delta = computeDelta(draftMappings, appliedMappings);

    console.log(`[ColorApply] Delta: ${delta.length} changed mappings`);

    if (delta.length === 0) {
      await writeStatus({
        status: "complete",
        startedAt,
        completedAt: new Date().toISOString(),
        delta: 0,
        itemsUpdated: 0,
        errors: 0,
        canonicalColorsSeeded: 0,
        canonicalPatternsSeeded: 0,
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

    console.log("[ColorApply] Scanning table for matching items...");

    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          ProjectionExpression: "PK, SK, color",
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );

      for (const item of result.Items ?? []) {
        const color = item.color as string | undefined;
        if (color && rawValues.has(color)) {
          const list = itemIndex.get(color);
          const key = { PK: item.PK as string, SK: item.SK as string };
          if (list) {
            list.push(key);
          } else {
            itemIndex.set(color, [key]);
          }
        }
      }

      scannedCount += result.Items?.length ?? 0;
      exclusiveStartKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);

    console.log(
      `[ColorApply] Scanned ${scannedCount} records, found matches for ${itemIndex.size} distinct colors`,
    );

    // Flatten all updates into work items for parallel batching
    const workItems: Array<{
      key: { PK: string; SK: string };
      mapping: MappingEntry;
    }> = [];
    for (const mapping of delta) {
      const items = itemIndex.get(mapping.raw);
      if (!items || items.length === 0) continue;
      for (const key of items) {
        workItems.push({ key, mapping });
      }
    }

    console.log(
      `[ColorApply] Processing ${workItems.length} item updates in parallel batches of 25...`,
    );

    // Apply updates in parallel batches — three branches based on canonical/pattern presence
    const { succeeded: applied, failed: errors } = await processBatch(
      workItems,
      25,
      async ({ key, mapping }) => {
        if (mapping.canonical !== null && mapping.pattern !== null) {
          // Branch 1: Both color and pattern
          await docClient.send(
            new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { PK: key.PK, SK: key.SK },
              UpdateExpression:
                "SET color = :canonical, pattern = :pattern, sourceColor = if_not_exists(sourceColor, :raw), sourcePattern = if_not_exists(sourcePattern, :raw)",
              ExpressionAttributeValues: {
                ":canonical": mapping.canonical,
                ":pattern": mapping.pattern,
                ":raw": mapping.raw,
              },
            }),
          );
        } else if (mapping.canonical === null && mapping.pattern !== null) {
          // Branch 2: Pure pattern — set pattern, remove color
          await docClient.send(
            new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { PK: key.PK, SK: key.SK },
              UpdateExpression:
                "SET pattern = :pattern, sourcePattern = if_not_exists(sourcePattern, :raw) REMOVE color",
              ExpressionAttributeValues: {
                ":pattern": mapping.pattern,
                ":raw": mapping.raw,
              },
            }),
          );
        } else if (mapping.canonical !== null && mapping.pattern === null) {
          // Branch 3: Color only — existing behavior
          await docClient.send(
            new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { PK: key.PK, SK: key.SK },
              UpdateExpression:
                "SET color = :canonical, sourceColor = if_not_exists(sourceColor, :raw)",
              ExpressionAttributeValues: {
                ":canonical": mapping.canonical,
                ":raw": mapping.raw,
              },
            }),
          );
        }
        // If both canonical and pattern are null, skip (no useful update)
      },
      (completed) => {
        console.log(
          `[ColorApply] Progress: ${completed}/${workItems.length} items processed`,
        );
      },
    );

    console.log(`[ColorApply] Updated ${applied} items, ${errors} errors`);

    // Seed canonical color list entries in parallel batches
    const canonicalColorSet = new Set(
      draftMappings
        .filter((m) => m.canonical !== null)
        .map((m) => m.canonical as string),
    );
    const createdAt = new Date().toISOString();

    const colorWorkItems = [...canonicalColorSet].map((canonical) => ({
      canonical,
      aliases: draftMappings
        .filter((m) => m.canonical === canonical && m.raw !== canonical)
        .map((m) => m.raw),
    }));

    const { succeeded: colorsSeeded } = await processBatch(
      colorWorkItems,
      25,
      async ({ canonical, aliases }) => {
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: "CANONICAL#COLORS",
              SK: `COLOR#${canonical}`,
              name: canonical,
              aliases,
              createdAt,
            },
          }),
        );
      },
    );

    // Seed canonical pattern list entries in parallel batches
    const canonicalPatternSet = new Set(
      draftMappings
        .filter((m) => m.pattern !== null)
        .map((m) => m.pattern as string),
    );

    const patternWorkItems = [...canonicalPatternSet].map((pattern) => ({
      pattern,
      aliases: draftMappings
        .filter((m) => m.pattern === pattern && m.raw !== pattern)
        .map((m) => m.raw),
    }));

    const { succeeded: patternsSeeded } = await processBatch(
      patternWorkItems,
      25,
      async ({ pattern, aliases }) => {
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: "CANONICAL#PATTERNS",
              SK: `PATTERN#${pattern}`,
              name: pattern,
              aliases,
              createdAt,
            },
          }),
        );
      },
    );

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
      `[ColorApply] Complete. ${applied} items, ${colorsSeeded} canonical colors, ${patternsSeeded} canonical patterns, ${errors} errors`,
    );

    await writeStatus({
      status: "complete",
      startedAt,
      completedAt,
      delta: delta.length,
      itemsUpdated: applied,
      errors,
      canonicalColorsSeeded: colorsSeeded,
      canonicalPatternsSeeded: patternsSeeded,
    });
  } catch (error: unknown) {
    console.error("[ColorApply] Fatal error:", error);
    await writeStatus({
      status: "error",
      startedAt,
      completedAt: new Date().toISOString(),
      delta: 0,
      itemsUpdated: 0,
      errors: 1,
      canonicalColorsSeeded: 0,
      canonicalPatternsSeeded: 0,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
