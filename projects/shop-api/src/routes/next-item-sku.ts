import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { jsonResponse, errorResponse } from "../response.js";

/**
 * Computes the next SKU from the current counter value.
 * Exported for testability (Property 9: Next-SKU computation).
 */
export function computeNextSkuFromCounter(currentValue: number): number {
  return currentValue + 1;
}

export async function nextItemSku(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: "SEQUENCE#ITEM", SK: "COUNTER" },
        ProjectionExpression: "#val",
        ExpressionAttributeNames: { "#val": "value" },
      }),
    );

    const currentValue = (result.Item?.value as number) ?? 0;
    const nextSku = computeNextSkuFromCounter(currentValue);

    return jsonResponse(200, { nextSku });
  } catch {
    return errorResponse();
  }
}
