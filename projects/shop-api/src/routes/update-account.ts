import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { formatAccountNumber } from "../pk-utils.js";
import { jsonResponse, errorResponse } from "../response.js";

export async function updateAccount(
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

  let body: unknown;
  try {
    body = JSON.parse(event.body ?? "");
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  if (body === null || typeof body !== "object") {
    return jsonResponse(400, { error: "invalid_body" });
  }

  const input = body as Record<string, unknown>;

  const fields: Record<string, string> = {
    name: (input.name as string) ?? "",
    street: (input.street as string) ?? "",
    place: (input.place as string) ?? "",
    postcode: (input.postcode as string) ?? "",
    canton: (input.canton as string) ?? "",
    email: (input.email as string) ?? "",
    telephone: (input.telephone as string) ?? "",
  };

  if (!fields.name || fields.name.trim().length === 0) {
    return jsonResponse(400, {
      error: "validation_error",
      fields: [{ field: "name", message: "name is required" }],
    });
  }

  try {
    // Look up account by account number via GSI1
    const paddedAccountNumber = formatAccountNumber(accountNumber);
    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :gsi1pk AND GSI1SK = :gsi1sk",
        ExpressionAttributeValues: {
          ":gsi1pk": "ACCOUNT",
          ":gsi1sk": paddedAccountNumber,
        },
        Limit: 1,
      }),
    );

    const items = queryResult.Items ?? [];
    if (items.length === 0) {
      return jsonResponse(404, { error: "not_found" });
    }

    const pk = items[0].PK as string;

    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk, SK: "METADATA" },
        UpdateExpression:
          "SET #name = :name, #street = :street, #place = :place, #postcode = :postcode, #canton = :canton, #email = :email, #telephone = :telephone",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeNames: {
          "#name": "name",
          "#street": "street",
          "#place": "place",
          "#postcode": "postcode",
          "#canton": "canton",
          "#email": "email",
          "#telephone": "telephone",
        },
        ExpressionAttributeValues: {
          ":name": fields.name,
          ":street": fields.street,
          ":place": fields.place,
          ":postcode": fields.postcode,
          ":canton": fields.canton,
          ":email": fields.email,
          ":telephone": fields.telephone,
        },
        ReturnValues: "ALL_NEW",
      }),
    );

    const item = result.Attributes!;
    return jsonResponse(200, {
      uuid: item.uuid as string,
      shopUid: accountNumber,
      name: item.name as string,
      street: (item.street as string) ?? "",
      place: (item.place as string) ?? "",
      postcode: (item.postcode as string) ?? "",
      canton: (item.canton as string) ?? "",
      email: (item.email as string) ?? "",
      telephone: (item.telephone as string) ?? "",
      commentCount: 0,
      tags: [],
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return jsonResponse(404, { error: "not_found" });
    }
    return errorResponse();
  }
}
