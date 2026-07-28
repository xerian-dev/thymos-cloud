import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { jsonResponse, errorResponse } from "../response.js";

/** Cache TTL in milliseconds (5 minutes). */
const CACHE_TTL_MS = 5 * 60 * 1000;

interface Category {
  id: string;
  name: string;
}

interface CacheEntry {
  data: Category[];
  fetchedAt: number;
}

let categoriesCache: CacheEntry | null = null;

/** Reset cache — exposed for testing only. */
export function _resetCache(): void {
  categoriesCache = null;
}

function isFresh(entry: CacheEntry | null): entry is CacheEntry {
  if (entry === null) return false;
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

async function scanCategories(): Promise<Category[]> {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "begins_with(PK, :prefix) AND SK = :sk",
        ExpressionAttributeValues: {
          ":prefix": "CATEGORY#",
          ":sk": "METADATA",
        },
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

  return items
    .map((item) => ({
      id: (item.PK as string).replace("CATEGORY#", ""),
      name: item.name as string,
    }))
    .filter((cat) => typeof cat.name === "string")
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listCategories(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    if (isFresh(categoriesCache)) {
      return jsonResponse(200, { categories: categoriesCache.data });
    }

    const categories = await scanCategories();
    categoriesCache = { data: categories, fetchedAt: Date.now() };

    return jsonResponse(200, { categories });
  } catch (error: unknown) {
    console.error("listCategories error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : undefined,
    });
    return errorResponse();
  }
}
