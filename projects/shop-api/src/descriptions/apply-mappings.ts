/**
 * Apply description mappings: diffs draft vs applied in S3, applies delta to DynamoDB.
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

const DRAFT_KEY = "description-mappings/draft.json";
const APPLIED_KEY = "description-mappings/applied.json";
const STATUS_KEY = "description-mappings/apply-status.json";

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
  canonicalDescriptionsSeeded: number;
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
    canonicalDescriptionsSeeded: 0,
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
        canonicalDescriptionsSeeded: 0,
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

    console.log(`[DescApply] Delta: ${delta.length} changed mappings`);

    if (delta.length === 0) {
      await writeStatus({
        status: "complete",
        startedAt,
        completedAt: new Date().toISOString(),
        delta: 0,
        itemsUpdated: 0,
        errors: 0,
        canonicalDescriptionsSeeded: 0,
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

    console.log("[DescApply] Scanning table for matching items...");

    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          ProjectionExpression: "PK, SK, description",
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );

      for (const item of result.Items ?? []) {
        const desc = item.description as string | undefined;
        if (desc && rawValues.has(desc)) {
          const list = itemIndex.get(desc);
          const key = { PK: item.PK as string, SK: item.SK as string };
          if (list) {
            list.push(key);
          } else {
            itemIndex.set(desc, [key]);
          }
        }
      }

      scannedCount += result.Items?.length ?? 0;
      exclusiveStartKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);

    console.log(
      `[DescApply] Scanned ${scannedCount} records, found matches for ${itemIndex.size} distinct descriptions`,
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
                "SET description = :canonical, sourceDescription = if_not_exists(sourceDescription, :raw)",
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
            `[DescApply] Error updating ${key.PK}: ${err instanceof Error ? err.message : "unknown"}`,
          );
        }
      }
    }

    console.log(`[DescApply] Updated ${applied} items, ${errors} errors`);

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
              PK: "CANONICAL#DESCRIPTIONS",
              SK: `DESCRIPTION#${canonical}`,
              name: canonical,
              aliases,
              createdAt,
            },
          }),
        );
        seeded++;
      } catch (err: unknown) {
        console.error(
          `[DescApply] Error seeding canonical ${canonical}: ${err instanceof Error ? err.message : "unknown"}`,
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
      `[DescApply] Complete. ${applied} items, ${seeded} canonical descriptions, ${errors} errors`,
    );

    await writeStatus({
      status: "complete",
      startedAt,
      completedAt,
      delta: delta.length,
      itemsUpdated: applied,
      errors,
      canonicalDescriptionsSeeded: seeded,
    });
  } catch (error: unknown) {
    console.error("[DescApply] Fatal error:", error);
    await writeStatus({
      status: "error",
      startedAt,
      completedAt: new Date().toISOString(),
      delta: 0,
      itemsUpdated: 0,
      errors: 1,
      canonicalDescriptionsSeeded: 0,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
