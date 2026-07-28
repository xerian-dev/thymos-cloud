import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { encodeCursor, decodeCursor } from "../cursor-utils.js";
import { jsonResponse, errorResponse } from "../response.js";

const ALLOWED_PAGE_SIZES = [20, 50, 100] as const;
type PageSize = (typeof ALLOWED_PAGE_SIZES)[number];

const VALID_DIRECTIONS = ["increase", "decrease"] as const;
type Direction = (typeof VALID_DIRECTIONS)[number];

/** DynamoDB key attributes stripped from returned records. */
const KEY_ATTRIBUTES = ["PK", "SK", "GSI1PK", "GSI1SK"] as const;

interface AdjustmentRecord {
  id: string;
  brand: string;
  category: string;
  categoryId: string;
  previousPrice: number;
  newPrice: number;
  direction: Direction;
  percentageChange: number;
  reason: string;
  metrics: {
    sellThroughRate: number;
    medianDaysOnShelf: number;
    sampleSize: number;
    discountFrequency: number;
    priceRatio: number;
  };
  timestamp: string;
}

function stripKeyAttributes(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!(KEY_ATTRIBUTES as readonly string[]).includes(key)) {
      result[key] = value;
    }
  }
  return result;
}

function isValidIso8601(value: string): boolean {
  const date = new Date(value);
  return !isNaN(date.getTime());
}

export async function listAdjustments(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const raw = event.queryStringParameters ?? {};

  // Validate pageSize
  let pageSize: PageSize = 20;
  if (raw.pageSize !== undefined) {
    const parsed = Number(raw.pageSize);
    if (!ALLOWED_PAGE_SIZES.includes(parsed as PageSize)) {
      return jsonResponse(400, {
        error: "validation_error",
        fields: ["pageSize must be one of 20, 50, 100"],
      });
    }
    pageSize = parsed as PageSize;
  }

  // Validate direction filter
  let directionFilter: Direction | undefined;
  if (raw.direction !== undefined && raw.direction !== "") {
    if (
      !VALID_DIRECTIONS.includes(raw.direction as Direction)
    ) {
      return jsonResponse(400, {
        error: "validation_error",
        fields: ["direction must be 'increase' or 'decrease'"],
      });
    }
    directionFilter = raw.direction as Direction;
  }

  // Validate date filters
  const fromDate = raw.fromDate;
  const toDate = raw.toDate;

  if (fromDate !== undefined && fromDate !== "" && !isValidIso8601(fromDate)) {
    return jsonResponse(400, {
      error: "validation_error",
      fields: ["fromDate must be a valid ISO 8601 date"],
    });
  }

  if (toDate !== undefined && toDate !== "" && !isValidIso8601(toDate)) {
    return jsonResponse(400, {
      error: "validation_error",
      fields: ["toDate must be a valid ISO 8601 date"],
    });
  }

  const brandFilter = raw.brand;
  const categoryFilter = raw.category;

  // Decode cursor if provided
  let exclusiveStartKey: Record<string, unknown> | undefined;
  if (raw.cursor !== undefined && raw.cursor !== "") {
    try {
      exclusiveStartKey = decodeCursor(raw.cursor);
    } catch {
      return jsonResponse(400, { error: "Invalid cursor" });
    }
  }

  try {
    // Build KeyConditionExpression — GSI1PK = ADJUSTMENTS
    // Use date range on GSI1SK if fromDate/toDate provided
    let keyConditionExpression = "GSI1PK = :pk";
    const expressionAttributeValues: Record<string, unknown> = {
      ":pk": "ADJUSTMENTS",
    };

    if (fromDate && toDate) {
      keyConditionExpression +=
        " AND GSI1SK BETWEEN :fromKey AND :toKey";
      expressionAttributeValues[":fromKey"] = `ADJUSTMENT#${fromDate}`;
      expressionAttributeValues[":toKey"] = `ADJUSTMENT#${toDate}`;
    } else if (fromDate) {
      keyConditionExpression += " AND GSI1SK >= :fromKey";
      expressionAttributeValues[":fromKey"] = `ADJUSTMENT#${fromDate}`;
    } else if (toDate) {
      keyConditionExpression += " AND GSI1SK <= :toKey";
      expressionAttributeValues[":toKey"] = `ADJUSTMENT#${toDate}`;
    }

    // Build FilterExpression for brand and category (server-side filtering)
    const filterParts: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};

    if (brandFilter !== undefined && brandFilter !== "") {
      filterParts.push("#brand = :brandVal");
      expressionAttributeNames["#brand"] = "brand";
      expressionAttributeValues[":brandVal"] = brandFilter;
    }

    if (categoryFilter !== undefined && categoryFilter !== "") {
      filterParts.push("#category = :categoryVal");
      expressionAttributeNames["#category"] = "category";
      expressionAttributeValues[":categoryVal"] = categoryFilter;
    }

    if (directionFilter !== undefined) {
      filterParts.push("#direction = :directionVal");
      expressionAttributeNames["#direction"] = "direction";
      expressionAttributeValues[":directionVal"] = directionFilter;
    }

    const filterExpression =
      filterParts.length > 0 ? filterParts.join(" AND ") : undefined;

    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: keyConditionExpression,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames:
          Object.keys(expressionAttributeNames).length > 0
            ? expressionAttributeNames
            : undefined,
        ScanIndexForward: false,
        Limit: pageSize,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const adjustments = (queryResult.Items ?? []).map(
      (item) => stripKeyAttributes(item as Record<string, unknown>) as unknown as AdjustmentRecord,
    );

    const lastEvaluatedKey = queryResult.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;

    const nextCursor = lastEvaluatedKey ? encodeCursor(lastEvaluatedKey) : null;
    const hasMore = lastEvaluatedKey !== undefined;

    return jsonResponse(200, { adjustments, nextCursor, hasMore });
  } catch (error: unknown) {
    console.error("listAdjustments error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : undefined,
    });
    return errorResponse();
  }
}
