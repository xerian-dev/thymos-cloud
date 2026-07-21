import { UpdateCommand } from "@aws-sdk/lib-dynamodb";

import { docClient, TABLE_NAME } from "./dynamodb-client";

export type EntityType = "ACCOUNT" | "ITEM" | "SALE";

export async function getNextSequenceNumber(
  entityType: EntityType,
): Promise<number> {
  const result = await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `SEQUENCE#${entityType}`, SK: "COUNTER" },
      UpdateExpression: "ADD #val :inc",
      ExpressionAttributeNames: { "#val": "value" },
      ExpressionAttributeValues: { ":inc": 1 },
      ReturnValues: "UPDATED_NEW",
    }),
  );

  if (!result.Attributes) {
    throw new Error(
      `Unexpected DynamoDB response: no Attributes returned for SEQUENCE#${entityType}`,
    );
  }

  return result.Attributes.value as number;
}

export async function seedSequenceCounter(
  entityType: EntityType,
  value: number,
): Promise<void> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `SEQUENCE#${entityType}`, SK: "COUNTER" },
        UpdateExpression: "SET #val = :newVal",
        ConditionExpression: "attribute_not_exists(#val) OR #val < :newVal",
        ExpressionAttributeNames: { "#val": "value" },
        ExpressionAttributeValues: { ":newVal": value },
      }),
    );
  } catch (error: unknown) {
    // ConditionalCheckFailedException means counter is already higher — that's fine
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return;
    }
    throw error;
  }
}
