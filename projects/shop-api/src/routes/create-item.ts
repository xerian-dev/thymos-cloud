import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { TransactWriteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { buildItemPk, formatSkuGsi1sk } from "../pk-utils.js";
import {
  validateItemInput,
  normalizeItemAttributes,
} from "../item-validation.js";
import { jsonResponse, errorResponse } from "../response.js";

const MAX_RETRIES = 3;

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

/**
 * Computes the next SKU value from the current counter.
 * Exported for testability (Property 2: Sequence counter monotonicity).
 */
export function computeNextSku(current: number): number {
  return current + 1;
}

export async function createItem(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  // 1. Parse JSON body
  let body: unknown;
  try {
    body = JSON.parse(event.body ?? "");
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  // 2. Validate request body
  const validation = validateItemInput(body);
  if (!validation.valid) {
    return jsonResponse(400, {
      error: "validation_error",
      fields: validation.errors,
    });
  }

  // 3. Verify accountId exists in Shop_Table
  const { accountId } = validation.data;
  try {
    const accountResult = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `ACCOUNT#${accountId}`, SK: "METADATA" },
        ProjectionExpression: "PK",
      }),
    );

    if (!accountResult.Item) {
      return jsonResponse(422, { error: "account_not_found" });
    }
  } catch {
    return errorResponse();
  }

  // 4. Normalize item attributes
  const normalized = normalizeItemAttributes(validation.data);

  // 5. Attempt item creation with retry on UUID collision or counter conflict
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const uuid = randomUUID();
    const now = new Date().toISOString();
    const pk = buildItemPk(uuid);

    // Read current counter value
    let currentCounter: number;
    try {
      const counterResult = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: "SEQUENCE#ITEM", SK: "COUNTER" },
          ProjectionExpression: "#val",
          ExpressionAttributeNames: { "#val": "value" },
        }),
      );
      currentCounter = (counterResult.Item?.value as number) ?? 0;
    } catch {
      return errorResponse();
    }

    const nextSku = computeNextSku(currentCounter);
    const gsi1sk = formatSkuGsi1sk(nextSku);

    // Build the item record for DynamoDB
    const itemRecord = {
      PK: pk,
      SK: "METADATA",
      GSI1PK: "ITEMS",
      GSI1SK: gsi1sk,
      uuid,
      sku: nextSku,
      ...normalized,
      createdAt: now,
      updatedAt: now,
    };

    // Build the counter update — handles initialization (no record exists → start at 1)
    const counterUpdate =
      currentCounter === 0
        ? {
            // Counter doesn't exist yet — initialize it
            Put: {
              TableName: TABLE_NAME,
              Item: {
                PK: "SEQUENCE#ITEM",
                SK: "COUNTER",
                value: 1,
              },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          }
        : {
            // Counter exists — increment conditionally
            Update: {
              TableName: TABLE_NAME,
              Key: { PK: "SEQUENCE#ITEM", SK: "COUNTER" },
              UpdateExpression: "SET #val = :newVal",
              ConditionExpression: "#val = :currentVal",
              ExpressionAttributeNames: { "#val": "value" },
              ExpressionAttributeValues: {
                ":newVal": nextSku,
                ":currentVal": currentCounter,
              },
            },
          };

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            counterUpdate,
            {
              Put: {
                TableName: TABLE_NAME,
                Item: itemRecord,
                ConditionExpression: "attribute_not_exists(PK)",
              },
            },
          ],
        }),
      );

      // Success — return the created item
      const responseItem: Record<string, unknown> = {
        uuid,
        sku: nextSku,
        createdAt: now,
        updatedAt: now,
        ...normalized,
      };

      return jsonResponse(201, responseItem);
    } catch (error: unknown) {
      if (isTransactionCanceledException(error)) {
        const reasons = error.CancellationReasons ?? [];

        // Second item (Put) condition failed → UUID collision, retry with new UUID
        if (reasons[1]?.Code === "ConditionalCheckFailed") {
          continue;
        }

        // First item (counter) condition failed → concurrent creation, retry
        if (reasons[0]?.Code === "ConditionalCheckFailed") {
          continue;
        }

        // Unknown cancellation reason
        return errorResponse();
      }

      return errorResponse();
    }
  }

  // Exhausted all retries
  return errorResponse();
}
