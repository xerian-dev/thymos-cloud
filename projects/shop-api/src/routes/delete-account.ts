import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { formatAccountNumber } from "../pk-utils.js";
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

  try {
    // Look up account by account number via GSI1 to get the UUID-based PK
    const paddedAccountNumber = formatAccountNumber(accountNumber);
    const gsiResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :gsi1pk AND GSI1SK = :gsi1sk",
        ExpressionAttributeValues: {
          ":gsi1pk": "ACCOUNT",
          ":gsi1sk": `ACCOUNT#${paddedAccountNumber}`,
        },
        Limit: 1,
      }),
    );

    const gsiItems = gsiResult.Items ?? [];
    if (gsiItems.length === 0) {
      return jsonResponse(404, { error: "not_found" });
    }

    const pk = gsiItems[0].PK as string;

    // Query all items for this account (METADATA + TAG# items) using the resolved PK
    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": pk },
      }),
    );

    const items = queryResult.Items ?? [];

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
