import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { encodeCursor, decodeCursor } from "../cursor-utils.js";
import { jsonResponse, errorResponse } from "../response.js";

export const ALLOWED_PAGE_SIZES = [20, 50, 100] as const;

export type PageSize = (typeof ALLOWED_PAGE_SIZES)[number];

/** DynamoDB key attributes that should be stripped from returned items. */
const KEY_ATTRIBUTES = ["PK", "SK", "GSI1PK", "GSI1SK"] as const;

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

export async function listItems(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const raw = event.queryStringParameters ?? {};

  // Validate pageSize
  let pageSize: PageSize = 20;
  if (raw.pageSize !== undefined) {
    const parsed = Number(raw.pageSize);
    if (!ALLOWED_PAGE_SIZES.includes(parsed as PageSize)) {
      return jsonResponse(400, {
        error: "pageSize must be one of 20, 50, 100",
      });
    }
    pageSize = parsed as PageSize;
  }

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
    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": "ITEMS" },
        ScanIndexForward: true,
        Limit: pageSize,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = (queryResult.Items ?? []).map((item) =>
      stripKeyAttributes(item as Record<string, unknown>),
    );

    const lastEvaluatedKey = queryResult.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;

    const nextCursor = lastEvaluatedKey ? encodeCursor(lastEvaluatedKey) : null;
    const hasMore = lastEvaluatedKey !== undefined;

    return jsonResponse(200, { items, nextCursor, hasMore });
  } catch (error: unknown) {
    console.error("listItems error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : undefined,
    });
    return errorResponse();
  }
}
