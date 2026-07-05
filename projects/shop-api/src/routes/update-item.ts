import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { buildItemPk } from "../pk-utils.js";
import {
  validateItemInput,
  normalizeItemAttributes,
  type NormalizedItemAttributes,
} from "../item-validation.js";
import { jsonResponse, errorResponse } from "../response.js";

/**
 * Represents the identity fields of an existing item that must remain immutable during updates.
 */
export interface ExistingItemIdentity {
  uuid: string;
  sku: number;
  createdAt: string;
}

/**
 * Pure function that applies a normalized update to an existing item,
 * preserving identity fields (uuid, sku, createdAt) and setting a new updatedAt.
 *
 * This function encapsulates the merge logic used by the updateItem route handler.
 */
export function applyItemUpdate(
  existingItem: ExistingItemIdentity,
  normalizedUpdate: NormalizedItemAttributes,
): ExistingItemIdentity & NormalizedItemAttributes & { updatedAt: string } {
  const now = new Date().toISOString();
  return {
    ...normalizedUpdate,
    uuid: existingItem.uuid,
    sku: existingItem.sku,
    createdAt: existingItem.createdAt,
    updatedAt: now,
  };
}

export async function updateItem(
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

  // 3. Validate request body
  const validation = validateItemInput(body);
  if (!validation.valid) {
    return jsonResponse(400, {
      error: "validation_error",
      fields: validation.errors,
    });
  }

  // 4. Verify item exists
  const pk = buildItemPk(uuid);
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

  // 5. Normalize mutable attributes from the update request
  const normalized = normalizeItemAttributes(validation.data);

  // 6. Preserve immutable identity fields from the existing record
  const preservedFields = {
    PK: existingItem.PK as string,
    SK: existingItem.SK as string,
    GSI1PK: existingItem.GSI1PK as string,
    GSI1SK: existingItem.GSI1SK as string,
    uuid: existingItem.uuid as string,
    sku: existingItem.sku as number,
    createdAt: existingItem.createdAt as string,
  };

  // 7. Build the updated item record (replace all attributes)
  const now = new Date().toISOString();
  const updatedRecord = {
    ...preservedFields,
    ...normalized,
    updatedAt: now,
  };

  // 8. Write back the full item record
  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: updatedRecord,
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
    return errorResponse();
  }

  // 9. Return the full updated item (without DynamoDB key attributes)
  const responseItem: Record<string, unknown> = {
    uuid: preservedFields.uuid,
    sku: preservedFields.sku,
    createdAt: preservedFields.createdAt,
    updatedAt: now,
    ...normalized,
  };

  return jsonResponse(200, responseItem);
}
