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

export async function listAccounts(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const raw = event.queryStringParameters ?? {};

  // Reject legacy parameters
  const legacyParams = ["pageIndex", "sortColumn", "sortDirection"];
  for (const param of legacyParams) {
    if (raw[param] !== undefined) {
      return jsonResponse(400, {
        error: `Unsupported parameter: ${param}`,
      });
    }
  }

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
        ExpressionAttributeValues: { ":pk": "ACCOUNT" },
        ScanIndexForward: true,
        Limit: pageSize,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const accounts = (queryResult.Items ?? []).map((item) => ({
      uuid: item.uuid as string,
      accountNumber: parseInt(item.accountNumber as string, 10),
      name: (item.name as string) ?? "",
      street: (item.street as string) ?? "",
      place: (item.place as string) ?? "",
      postcode: (item.postcode as string) ?? "",
      canton: (item.canton as string) ?? "",
      email: (item.email as string) ?? "",
      telephone: (item.telephone as string) ?? "",
      company: (item.company as string) ?? "",
      createdBy:
        (item.createdBy as
          | { id: string; name: string; userType: string }
          | undefined) ?? null,
      commentCount: 0,
      tags: [] as string[],
    }));

    const lastEvaluatedKey = queryResult.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;

    const nextCursor = lastEvaluatedKey ? encodeCursor(lastEvaluatedKey) : null;
    const hasMore = lastEvaluatedKey !== undefined;

    return jsonResponse(200, { accounts, nextCursor, hasMore });
  } catch (error: unknown) {
    console.error("listAccounts error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : undefined,
    });
    return errorResponse();
  }
}
