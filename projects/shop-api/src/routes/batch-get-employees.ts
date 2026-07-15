import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { buildEmployeePk } from "../pk-utils.js";
import { jsonResponse, errorResponse } from "../response.js";

export interface EmployeeResponse {
  uuid: string;
  name: string;
  sourceId: string;
  createdAt: string;
  updatedAt: string;
}

export type BatchValidationResult =
  | { valid: true; uuids: string[] }
  | { valid: false; error: string };

/**
 * Validates the batch request body.
 * Exported for testability (Property 7: Batch request validation).
 */
export function validateBatchRequest(body: unknown): BatchValidationResult {
  if (
    body === null ||
    body === undefined ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return { valid: false, error: "validation_error" };
  }

  const obj = body as Record<string, unknown>;

  if (!("uuids" in obj) || !Array.isArray(obj.uuids)) {
    return { valid: false, error: "validation_error" };
  }

  const uuids = obj.uuids as unknown[];

  if (uuids.length > 100) {
    return { valid: false, error: "too_many_uuids" };
  }

  return { valid: true, uuids: uuids as string[] };
}

/**
 * Maps a DynamoDB employee record to the API response shape.
 * Strips DynamoDB key attributes and returns only the public fields.
 */
export function mapEmployeeRecord(
  item: Record<string, unknown>,
): EmployeeResponse {
  return {
    uuid: item.uuid as string,
    name: item.name as string,
    sourceId: item.sourceId as string,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  };
}

export async function batchGetEmployees(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  // 1. Parse JSON body
  let body: unknown;
  try {
    body = JSON.parse(event.body ?? "");
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  // 2. Validate batch request
  const validation = validateBatchRequest(body);
  if (!validation.valid) {
    return jsonResponse(400, { error: validation.error });
  }

  const { uuids } = validation;

  // 3. Return early for empty array
  if (uuids.length === 0) {
    return jsonResponse(200, { employees: [] });
  }

  // 4. Build keys and execute BatchGetItem
  const keys = uuids.map((uuid) => ({
    PK: buildEmployeePk(uuid),
    SK: "METADATA",
  }));

  try {
    const allItems: Record<string, unknown>[] = [];
    let unprocessedKeys = keys;

    // Handle UnprocessedKeys by making additional requests
    while (unprocessedKeys.length > 0) {
      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [TABLE_NAME]: { Keys: unprocessedKeys },
          },
        }),
      );

      const responses = result.Responses?.[TABLE_NAME] ?? [];
      allItems.push(...(responses as Record<string, unknown>[]));

      // Check for unprocessed keys (DynamoDB may not return all items in one call)
      const remaining = result.UnprocessedKeys?.[TABLE_NAME]?.Keys;
      if (remaining && remaining.length > 0) {
        unprocessedKeys = remaining as Array<{ PK: string; SK: string }>;
      } else {
        break;
      }
    }

    // 5. Map results to response shape (missing records are simply not returned by BatchGetItem)
    const employees = allItems.map(mapEmployeeRecord);

    return jsonResponse(200, { employees });
  } catch (error: unknown) {
    console.error("batchGetEmployees error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : undefined,
    });
    return errorResponse();
  }
}
