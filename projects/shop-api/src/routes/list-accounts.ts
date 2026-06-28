import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { parseAccountPk } from "../pk-utils.js";
import { jsonResponse, errorResponse } from "../response.js";

export async function listAccounts(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const allItems: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const scanResult = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: "SK = :metadata AND begins_with(PK, :prefix)",
          ExpressionAttributeValues: {
            ":metadata": "METADATA",
            ":prefix": "ACCOUNT#",
          },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );

      if (scanResult.Items) {
        allItems.push(...scanResult.Items);
      }

      exclusiveStartKey = scanResult.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);

    const accounts = allItems.map((item) => {
      const pk = item.PK as string;

      return {
        uuid: item.uuid as string,
        shopUid: parseAccountPk(pk),
        name: item.name as string,
        street: (item.street as string) ?? "",
        place: (item.place as string) ?? "",
        postcode: (item.postcode as string) ?? "",
        canton: (item.canton as string) ?? "",
        email: (item.email as string) ?? "",
        telephone: (item.telephone as string) ?? "",
        company: (item.company as string) ?? "",
        commentCount: 0,
        tags: [] as string[],
      };
    });

    return jsonResponse(200, { accounts });
  } catch {
    return errorResponse();
  }
}
