import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { jsonResponse, errorResponse } from "../response.js";

export function computeNextSaleNumber(currentValue: number): number {
  return currentValue + 1;
}

export async function nextSaleNumber(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: "SEQUENCE#SALE", SK: "COUNTER" },
      }),
    );

    const currentValue = (result.Item?.value ?? 0) as number;
    return jsonResponse(200, { nextNumber: computeNextSaleNumber(currentValue) });
  } catch {
    return errorResponse();
  }
}
