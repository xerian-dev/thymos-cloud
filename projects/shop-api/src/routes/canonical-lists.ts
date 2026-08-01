import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { jsonResponse, errorResponse } from "../response.js";

/** Cache TTL in milliseconds (5 minutes). */
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  data: string[];
  fetchedAt: number;
}

let brandsCache: CacheEntry | null = null;
let colorsCache: CacheEntry | null = null;
let descriptionsCache: CacheEntry | null = null;

/** Reset caches — exposed for testing only. */
export function _resetCaches(): void {
  brandsCache = null;
  colorsCache = null;
  descriptionsCache = null;
}

function isFresh(entry: CacheEntry | null): entry is CacheEntry {
  if (entry === null) return false;
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

async function queryCanonicalNames(pk: string): Promise<string[]> {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    if (result.Items) {
      items.push(...(result.Items as Record<string, unknown>[]));
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey !== undefined);

  const names = items
    .map((item) => item.name as string)
    .filter((name): name is string => typeof name === "string");

  return names.sort((a, b) => a.localeCompare(b));
}

export async function listCanonicalBrands(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    if (isFresh(brandsCache)) {
      return jsonResponse(200, { brands: brandsCache.data });
    }

    const brands = await queryCanonicalNames("CANONICAL#BRANDS");
    brandsCache = { data: brands, fetchedAt: Date.now() };

    return jsonResponse(200, { brands });
  } catch (error: unknown) {
    console.error("listCanonicalBrands error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : undefined,
    });
    return errorResponse();
  }
}

export async function listCanonicalColors(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    if (isFresh(colorsCache)) {
      return jsonResponse(200, { colors: colorsCache.data });
    }

    const colors = await queryCanonicalNames("CANONICAL#COLORS");
    colorsCache = { data: colors, fetchedAt: Date.now() };

    return jsonResponse(200, { colors });
  } catch (error: unknown) {
    console.error("listCanonicalColors error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : undefined,
    });
    return errorResponse();
  }
}

export async function listCanonicalDescriptions(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    if (isFresh(descriptionsCache)) {
      return jsonResponse(200, { descriptions: descriptionsCache.data });
    }

    const descriptions = await queryCanonicalNames("CANONICAL#DESCRIPTIONS");
    descriptionsCache = { data: descriptions, fetchedAt: Date.now() };

    return jsonResponse(200, { descriptions });
  } catch (error: unknown) {
    console.error("listCanonicalDescriptions error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : undefined,
    });
    return errorResponse();
  }
}
