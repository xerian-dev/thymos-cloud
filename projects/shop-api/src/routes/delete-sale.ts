import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import {
  GetCommand,
  QueryCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { buildSalePk } from "../pk-utils.js";
import { jsonResponse, errorResponse } from "../response.js";

export async function deleteSale(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const uuid = event.pathParameters?.uuid;
  if (!uuid) {
    return jsonResponse(400, { error: "missing_uuid" });
  }

  const pk = buildSalePk(uuid);

  try {
    // 1. Verify sale exists
    const getResult = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk, SK: "METADATA" },
        ProjectionExpression: "PK",
      }),
    );

    if (!getResult.Item) {
      return jsonResponse(404, { error: "not_found" });
    }

    // 2. Query ALL records under this PK (METADATA + LINE_ITEM# records)
    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ProjectionExpression: "PK, SK",
      }),
    );

    const items = queryResult.Items ?? [];

    // 3. BatchWriteItem to delete all records (max 25 per batch)
    const deleteRequests = items.map((item) => ({
      DeleteRequest: {
        Key: { PK: item.PK as string, SK: item.SK as string },
      },
    }));

    for (let i = 0; i < deleteRequests.length; i += 25) {
      const batch = deleteRequests.slice(i, i + 25);
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: batch,
          },
        }),
      );
    }

    // 4. Return 204 empty body
    return { statusCode: 204, body: "" };
  } catch (error: unknown) {
    console.error("deleteSale error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : undefined,
    });
    return errorResponse();
  }
}
