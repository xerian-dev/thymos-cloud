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

export interface SaleResponse {
  uuid: string;
  number: number;
  status: "open" | "finalized" | "voided";
  cashierId: string;
  subtotal?: number;
  total?: number;
  storePortion?: number;
  consignorPortion?: number;
  change?: number;
  memo?: string;
  finalizedAt?: string;
  voidedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export function mapSaleRecord(item: Record<string, unknown>): SaleResponse {
  const sale: SaleResponse = {
    uuid: item.uuid as string,
    number: item.number as number,
    status: item.status as "open" | "finalized" | "voided",
    cashierId: item.cashierId as string,
    createdAt: item.createdAt as string,
  };

  if (item.subtotal !== undefined) sale.subtotal = item.subtotal as number;
  if (item.total !== undefined) sale.total = item.total as number;
  if (item.storePortion !== undefined) sale.storePortion = item.storePortion as number;
  if (item.consignorPortion !== undefined) sale.consignorPortion = item.consignorPortion as number;
  if (item.change !== undefined) sale.change = item.change as number;
  if (item.memo !== undefined) sale.memo = item.memo as string;
  if (item.finalizedAt !== undefined) sale.finalizedAt = item.finalizedAt as string;
  if (item.voidedAt !== undefined) sale.voidedAt = item.voidedAt as string;
  if (item.updatedAt !== undefined) sale.updatedAt = item.updatedAt as string;

  return sale;
}

export async function listSales(
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
        ExpressionAttributeValues: { ":pk": "SALES" },
        ScanIndexForward: false,
        Limit: pageSize,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const sales = (queryResult.Items ?? []).map(
      (item) => mapSaleRecord(item as Record<string, unknown>),
    );

    const lastEvaluatedKey = queryResult.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;

    const nextCursor = lastEvaluatedKey ? encodeCursor(lastEvaluatedKey) : null;
    const hasMore = lastEvaluatedKey !== undefined;

    return jsonResponse(200, { sales, nextCursor, hasMore });
  } catch (error: unknown) {
    console.error("listSales error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : undefined,
    });
    return errorResponse();
  }
}
