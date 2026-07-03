import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { TransactWriteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { buildAccountUuidPk, formatAccountNumber } from "../pk-utils.js";
import { validateCreateAccount } from "../validation.js";
import { jsonResponse, textResponse, errorResponse } from "../response.js";

interface TransactionCanceledError extends Error {
  CancellationReasons?: Array<{ Code?: string }>;
}

function isTransactionCanceledException(
  error: unknown,
): error is TransactionCanceledError {
  return (
    error instanceof Error && error.name === "TransactionCanceledException"
  );
}

function isConditionalCheckFailedException(error: unknown): boolean {
  return (
    error instanceof Error && error.name === "ConditionalCheckFailedException"
  );
}

export async function createAccount(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  // 1. Parse JSON body
  let body: unknown;
  try {
    body = JSON.parse(event.body ?? "");
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  // 2. Validate
  const validation = validateCreateAccount(body);
  if (!validation.valid) {
    return jsonResponse(400, {
      error: "validation_error",
      fields: validation.errors,
    });
  }

  const {
    accountNumber,
    name,
    street,
    place,
    postcode,
    canton,
    email,
    telephone,
  } = validation.data;

  // 3. Check max
  if (accountNumber > 9999999) {
    return textResponse(422, "max_reached");
  }

  // 4. Build item
  const uuid = randomUUID();
  const createdAt = new Date().toISOString();
  const paddedAccountNumber = formatAccountNumber(accountNumber);
  const pk = buildAccountUuidPk(uuid);

  const accountItem = {
    PK: pk,
    SK: "METADATA",
    uuid,
    shopUid: paddedAccountNumber,
    GSI1PK: "ACCOUNT",
    GSI1SK: paddedAccountNumber,
    name,
    street,
    place,
    postcode,
    canton,
    email,
    telephone,
    createdAt,
  };

  // 5. Attempt TransactWriteItems: Put account + conditionally update counter
  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: accountItem,
              ConditionExpression: "attribute_not_exists(PK)",
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER" },
              UpdateExpression: "SET #val = :newValue",
              ConditionExpression:
                "attribute_not_exists(#val) OR #val < :accountNum",
              ExpressionAttributeNames: { "#val": "value" },
              ExpressionAttributeValues: {
                ":newValue": accountNumber,
                ":accountNum": accountNumber,
              },
            },
          },
        ],
      }),
    );
  } catch (error: unknown) {
    if (isTransactionCanceledException(error)) {
      const reasons = error.CancellationReasons ?? [];

      // First item condition failed → duplicate account
      if (reasons[0]?.Code === "ConditionalCheckFailed") {
        return textResponse(409, "duplicate");
      }

      // Second item condition failed → counter already higher, retry with just the Put
      if (reasons[1]?.Code === "ConditionalCheckFailed") {
        try {
          await docClient.send(
            new PutCommand({
              TableName: TABLE_NAME,
              Item: accountItem,
              ConditionExpression: "attribute_not_exists(PK)",
            }),
          );
        } catch (retryError: unknown) {
          if (isConditionalCheckFailedException(retryError)) {
            return textResponse(409, "duplicate");
          }
          return errorResponse();
        }
      } else {
        // Unknown transaction failure
        return errorResponse();
      }
    } else {
      return errorResponse();
    }
  }

  // 6. Return success
  return jsonResponse(201, {
    uuid,
    shopUid: accountNumber,
    name,
    street,
    place,
    postcode,
    canton,
    email,
    telephone,
    commentCount: 0,
    tags: [],
  });
}
