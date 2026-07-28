/**
 * Brand management API routes.
 *
 * POST /api/brands/scan-cluster  — triggers async scan & cluster Lambda
 * GET  /api/brands/mappings      — loads draft.json from S3
 * PUT  /api/brands/mappings      — saves edited draft.json to S3
 * POST /api/brands/apply         — diffs draft vs applied, applies delta to DynamoDB
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { jsonResponse, errorResponse } from "../response.js";

const TABLE_NAME = process.env.TABLE_NAME ?? "";
const BUCKET_NAME = process.env.BUCKET_NAME ?? "";
const BRAND_CLUSTER_FUNCTION_NAME =
  process.env.BRAND_CLUSTER_FUNCTION_NAME ?? "";

const lambdaClient = new LambdaClient({});
const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const DRAFT_KEY = "brand-mappings/draft.json";
const APPLIED_KEY = "brand-mappings/applied.json";

interface MappingEntry {
  raw: string;
  canonical: string;
}

// --- POST /api/brands/scan-cluster ---

export async function scanClusterBrands(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: BRAND_CLUSTER_FUNCTION_NAME,
        InvocationType: "Event",
      }),
    );

    return jsonResponse(202, {
      message: "Scan & cluster started. Poll GET /api/brands/mappings for results.",
    });
  } catch (error: unknown) {
    console.error("scanClusterBrands error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}

// --- GET /api/brands/mappings ---

export async function getMappings(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: DRAFT_KEY,
      }),
    );

    const body = await result.Body?.transformToString();
    if (!body) {
      return jsonResponse(200, { mappings: [], lastModified: null });
    }

    const mappings: MappingEntry[] = JSON.parse(body);
    const lastModified = result.LastModified?.toISOString() ?? null;

    return jsonResponse(200, { mappings, lastModified });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "NoSuchKey") {
      return jsonResponse(200, { mappings: [], lastModified: null });
    }
    console.error("getMappings error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}

// --- PUT /api/brands/mappings ---

export async function saveMappings(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const body = event.body;
    if (!body) {
      return jsonResponse(400, { error: "Request body is required" });
    }

    const parsed = JSON.parse(body);
    const mappings: MappingEntry[] = parsed.mappings;

    if (!Array.isArray(mappings)) {
      return jsonResponse(400, { error: "mappings must be an array" });
    }

    // Validate each entry
    for (const entry of mappings) {
      if (typeof entry.raw !== "string" || typeof entry.canonical !== "string") {
        return jsonResponse(400, {
          error: "Each mapping must have string 'raw' and 'canonical' fields",
        });
      }
    }

    const content = JSON.stringify(mappings, null, 2);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: DRAFT_KEY,
        Body: content,
        ContentType: "application/json",
      }),
    );

    return jsonResponse(200, {
      message: "Draft saved",
      count: mappings.length,
    });
  } catch (error: unknown) {
    console.error("saveMappings error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}

// --- POST /api/brands/apply ---

export async function applyMappings(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    // Load draft
    const draftResult = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: DRAFT_KEY }),
    );
    const draftBody = await draftResult.Body?.transformToString();
    if (!draftBody) {
      return jsonResponse(400, { error: "No draft mappings found. Run scan & cluster first." });
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
      // No applied file yet — everything in draft is new
    }

    // Compute delta
    const appliedMap = new Map(appliedMappings.map((m) => [m.raw, m.canonical]));
    const delta: MappingEntry[] = [];
    for (const entry of draftMappings) {
      if (appliedMap.get(entry.raw) !== entry.canonical) {
        delta.push(entry);
      }
    }

    if (delta.length === 0) {
      return jsonResponse(200, {
        message: "No changes to apply",
        applied: 0,
        errors: 0,
      });
    }

    console.log(`[BrandApply] Applying ${delta.length} changed mappings`);

    // Build set of raw values to find
    const rawValues = new Set(delta.map((m) => m.raw));

    // Scan for items matching the raw values
    const itemIndex = new Map<string, Array<{ PK: string; SK: string }>>();
    let exclusiveStartKey: Record<string, unknown> | undefined;

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

      exclusiveStartKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);

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
              UpdateExpression: "SET brand = :canonical, sourceBrand = if_not_exists(sourceBrand, :raw)",
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

    // Seed canonical list entries for new canonical brands
    const canonicalSet = new Set(draftMappings.map((m) => m.canonical));
    const createdAt = new Date().toISOString();
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

    console.log(
      `[BrandApply] Complete. ${applied} items updated, ${errors} errors, ${canonicalSet.size} canonical brands seeded`,
    );

    return jsonResponse(200, {
      message: "Mappings applied",
      delta: delta.length,
      itemsUpdated: applied,
      errors,
      canonicalBrandsSeeded: canonicalSet.size,
    });
  } catch (error: unknown) {
    console.error("applyMappings error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}
