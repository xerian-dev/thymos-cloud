import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { buildAccountPk } from "../pk-utils.js";
import { jsonResponse, errorResponse } from "../response.js";

export async function deleteAccount(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const accountNumberStr = event.pathParameters?.accountNumber;
  if (!accountNumberStr) {
    return jsonResponse(400, { error: "missing_account_number" });
  }

  const accountNumber = parseInt(accountNumberStr, 10);
  if (isNaN(accountNumber) || accountNumber < 1 || accountNumber > 9999999) {
    return jsonResponse(400, { error: "invalid_account_number" });
  }

  const pk = buildAccountPk(accountNumber);

  try {
    // Query all items for this account (METADATA + TAG# items)
    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": pk },
      }),
    );

    const items = queryResult.Items ?? [];

    if (items.length === 0) {
      return jsonResponse(404, { error: "not_found" });
    }

    // Delete all items for this account
    for (const item of items) {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { PK: item.PK as string, SK: item.SK as string },
        }),
      );
    }

    return { statusCode: 204, body: "" };
  } catch {
    return errorResponse();
  }
}
