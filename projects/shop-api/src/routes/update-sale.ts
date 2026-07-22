import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { buildSalePk } from "../pk-utils.js";
import {
  validateSaleUpdate,
  type ValidatedSaleUpdate,
} from "../sale-update-validation.js";
import { jsonResponse, errorResponse } from "../response.js";
import { mapSaleRecord } from "./list-sales.js";

/**
 * Represents the identity fields of an existing sale that must remain immutable during updates.
 */
export interface ExistingSaleIdentity {
  uuid: string;
  saleNumber: number;
  createdAt: string;
}

/**
 * Applies a partial update to an existing sale, preserving identity fields.
 * Exported for testability (Property 5: Update merge preserves identity).
 */
export function applySaleUpdate(
  existingItem: Record<string, unknown>,
  update: ValidatedSaleUpdate,
): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    ...existingItem,
    ...update,
    updatedAt: now,
  };
}

export async function updateSale(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  // 1. Extract UUID from path parameters
  const uuid = event.pathParameters?.uuid;
  if (!uuid) {
    return jsonResponse(400, { error: "missing_uuid" });
  }

  // 2. Parse JSON body
  let body: unknown;
  try {
    body = JSON.parse(event.body ?? "");
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  // 3. Validate with validateSaleUpdate
  const validation = validateSaleUpdate(body);
  if (!validation.valid) {
    return jsonResponse(400, {
      error: "validation_error",
      fields: validation.errors,
    });
  }

  // 4. GetItem to verify sale exists
  const pk = buildSalePk(uuid);
  let existingItem: Record<string, unknown>;
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: pk, SK: "METADATA" },
      }),
    );

    if (!result.Item) {
      return jsonResponse(404, { error: "not_found" });
    }

    existingItem = result.Item as Record<string, unknown>;
  } catch {
    return errorResponse();
  }

  // 5. Merge provided fields into existing record, set updatedAt
  const mergedRecord = applySaleUpdate(existingItem, validation.data);

  // 6. PutItem with condition expression attribute_exists(PK)
  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: mergedRecord,
        ConditionExpression: "attribute_exists(PK)",
      }),
    );
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return jsonResponse(404, { error: "not_found" });
    }
    console.error("updateSale error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : undefined,
    });
    return errorResponse();
  }

  // 7. Return 200 with updated sale record (stripped of DynamoDB keys)
  return jsonResponse(200, mapSaleRecord(mergedRecord));
}
