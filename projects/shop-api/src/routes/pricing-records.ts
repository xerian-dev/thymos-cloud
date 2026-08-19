import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { jsonResponse, errorResponse } from "../response.js";

const s3Client = new S3Client({});
const BUCKET = process.env.BUCKET_NAME ?? "";

interface MappingEntry {
  raw: string;
  canonical: string;
}

interface PricingRecordDTO {
  id: string;
  brand: string;
  categoryId: string;
  categoryName: string;
  description: string;
  color: string;
  pattern: string;
  size: string;
  tagPrice: number;
  soldPrice: number | null;
  daysOnShelf: number | null;
  soldAt: string | null;
  createdAt: string;
}

// Caches
let categoryCache: Map<string, string> | null = null;
let brandMapCache: Map<string, string> | null = null;
let colorMapCache: Map<string, string> | null = null;
let descMapCache: Map<string, string> | null = null;
let cachesFetchedAt = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function loadMappingsFromS3(key: string): Promise<Map<string, string>> {
  try {
    const result = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    const body = await result.Body?.transformToString();
    if (!body) return new Map();
    const entries: MappingEntry[] = JSON.parse(body);
    const map = new Map<string, string>();
    for (const entry of entries) {
      map.set(entry.raw, entry.canonical);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function getCategoryNames(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "begins_with(PK, :prefix) AND SK = :sk",
        ExpressionAttributeValues: { ":prefix": "CATEGORY#", ":sk": "METADATA" },
        ProjectionExpression: "PK, #n",
        ExpressionAttributeNames: { "#n": "name" },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    for (const item of result.Items ?? []) {
      const id = (item.PK as string).replace("CATEGORY#", "");
      map.set(id, item.name as string);
    }

    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return map;
}

async function ensureCaches(): Promise<void> {
  if (cachesFetchedAt && Date.now() - cachesFetchedAt < CACHE_TTL) {
    return;
  }

  const [categories, brands, colors, descriptions] = await Promise.all([
    getCategoryNames(),
    loadMappingsFromS3("brand-mappings/draft.json"),
    loadMappingsFromS3("color-mappings/draft.json"),
    loadMappingsFromS3("description-mappings/draft.json"),
  ]);

  categoryCache = categories;
  brandMapCache = brands;
  colorMapCache = colors;
  descMapCache = descriptions;
  cachesFetchedAt = Date.now();
}

function resolveCanonical(value: string, map: Map<string, string>): string {
  if (!value) return "";
  // Try exact match first
  const canonical = map.get(value);
  if (canonical) return canonical;
  // Try case-insensitive match
  const lower = value.toLowerCase();
  for (const [raw, canon] of map) {
    if (raw.toLowerCase() === lower) return canon;
  }
  // Return original if no mapping found
  return value;
}

export async function listPricingRecords(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const params = event.queryStringParameters ?? {};
    const limit = Math.min(parseInt(params.limit ?? "100", 10), 500);
    const cursor = params.cursor;

    let exclusiveStartKey: Record<string, unknown> | undefined;
    if (cursor) {
      try {
        exclusiveStartKey = JSON.parse(
          Buffer.from(cursor, "base64url").toString("utf-8"),
        );
      } catch {
        return jsonResponse(400, { error: "Invalid cursor" });
      }
    }

    await ensureCaches();

    // Scan for sold items (items with lastSold attribute)
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression:
          "begins_with(PK, :prefix) AND SK = :sk AND attribute_exists(lastSold) AND attribute_exists(tagPrice)",
        ExpressionAttributeValues: {
          ":prefix": "ITEM#",
          ":sk": "METADATA",
        },
        ProjectionExpression:
          "PK, brand, sourceBrand, categoryId, description, color, sourceColor, pattern, size, tagPrice, lastSold, daysOnShelf, createdAt",
        Limit: limit * 3, // Over-fetch since filter reduces results
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const records: PricingRecordDTO[] = (result.Items ?? []).map((item) => {
      const id = (item.PK as string).replace("ITEM#", "");
      const categoryId = (item.categoryId as string) ?? "";

      // Resolve to canonical values using mappings
      const rawBrand = (item.sourceBrand as string | undefined) ?? (item.brand as string | undefined) ?? "";
      const rawColor = (item.sourceColor as string | undefined) ?? (item.color as string | undefined) ?? "";
      const rawDesc = (item.description as string | undefined) ?? "";

      return {
        id,
        brand: resolveCanonical(rawBrand, brandMapCache!) || "",
        categoryId,
        categoryName: categoryCache!.get(categoryId) ?? "",
        description: resolveCanonical(rawDesc, descMapCache!) || "",
        color: resolveCanonical(rawColor, colorMapCache!) || "",
        pattern: (item.pattern as string | undefined) ?? "",
        size: (item.size as string | undefined) ?? "",
        tagPrice: (item.tagPrice as number) ?? 0,
        soldPrice: null,
        daysOnShelf: (item.daysOnShelf as number) ?? null,
        soldAt: (item.lastSold as string) ?? null,
        createdAt: (item.createdAt as string) ?? new Date().toISOString(),
      };
    });

    const nextCursor = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64url")
      : null;

    return jsonResponse(200, {
      records,
      nextCursor,
      hasMore: nextCursor !== null,
    });
  } catch (error: unknown) {
    console.error("listPricingRecords error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}
