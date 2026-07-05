import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { buildItemPk } from "../pk-utils.js";
import { jsonResponse, errorResponse } from "../response.js";

export async function deleteItem(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const uuid = event.pathParameters?.uuid;
  if (!uuid) {
    return jsonResponse(400, { error: "missing_uuid" });
  }

  const pk = buildItemPk(uuid);

  try {
    // Verify item exists
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

    // Delete the item
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk, SK: "METADATA" },
      }),
    );

    return jsonResponse(200, { success: true });
  } catch {
    return errorResponse();
  }
}
