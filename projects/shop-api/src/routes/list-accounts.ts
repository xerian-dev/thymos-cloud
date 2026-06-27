import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { parseAccountPk } from "../pk-utils.js";
import { jsonResponse, errorResponse } from "../response.js";

export async function listAccounts(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "SK = :metadata",
        ExpressionAttributeValues: { ":metadata": "METADATA" },
      }),
    );

    const items = scanResult.Items ?? [];

    const accounts = await Promise.all(
      items.map(async (item) => {
        const pk = item.PK as string;

        const commentsResult = await docClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
            ExpressionAttributeValues: {
              ":pk": pk,
              ":prefix": "COMMENT#",
            },
            Select: "COUNT",
          }),
        );

        const tagsResult = await docClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
            ExpressionAttributeValues: {
              ":pk": pk,
              ":prefix": "TAG#",
            },
          }),
        );

        const tags = (tagsResult.Items ?? []).map((t) => t.label as string);

        return {
          uuid: item.uuid as string,
          shopUid: parseAccountPk(pk),
          name: item.name as string,
          address: item.address as string,
          telephone: item.telephone as string,
          commentCount: commentsResult.Count ?? 0,
          tags,
        };
      }),
    );

    return jsonResponse(200, { accounts });
  } catch {
    return errorResponse();
  }
}
