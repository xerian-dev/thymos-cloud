import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";
import { buildEmployeePk } from "../pk-utils.js";
import { jsonResponse, errorResponse } from "../response.js";

export function mapEmployeeRecord(item: Record<string, unknown>): {
  uuid: string;
  name: string;
  sourceId: string;
  createdAt: string;
  updatedAt: string;
} {
  return {
    uuid: item.uuid as string,
    name: item.name as string,
    sourceId: item.sourceId as string,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  };
}

export async function getEmployee(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const uuid = event.pathParameters?.uuid;
  if (!uuid) {
    return jsonResponse(400, { error: "missing_uuid" });
  }

  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: buildEmployeePk(uuid), SK: "METADATA" },
      }),
    );

    if (!result.Item) {
      return jsonResponse(404, { error: "not_found" });
    }

    return jsonResponse(200, mapEmployeeRecord(result.Item as Record<string, unknown>));
  } catch (error: unknown) {
    console.error("getEmployee error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : undefined,
    });
    return errorResponse();
  }
}
