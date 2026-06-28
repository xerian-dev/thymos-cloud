import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { jsonResponse, errorResponse } from "../response.js";

export async function nextNumber(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER" },
      }),
    );

    const currentValue = (result.Item?.value ?? 0) as number;
    return jsonResponse(200, { nextNumber: currentValue + 1 });
  } catch {
    return errorResponse();
  }
}
