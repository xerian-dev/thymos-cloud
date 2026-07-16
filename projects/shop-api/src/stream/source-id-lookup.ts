import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "./dynamodb-client";

export interface ExistingRecord {
  PK: string;
  SK: string;
  [key: string]: unknown;
}

export async function findBySourceId(
  sourceId: string,
): Promise<ExistingRecord | undefined> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "sourceId-index",
      KeyConditionExpression: "sourceId = :id",
      ExpressionAttributeValues: { ":id": sourceId },
      Limit: 1,
    }),
  );

  if (result.Items && result.Items.length > 0) {
    return result.Items[0] as ExistingRecord;
  }

  return undefined;
}
