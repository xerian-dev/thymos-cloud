import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, IMPORT_TABLE_NAME } from "./dynamodb-client";

export async function markSynced(pk: string, sk: string): Promise<void> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: IMPORT_TABLE_NAME,
        Key: { PK: pk, SK: sk },
        UpdateExpression: "SET #syncedAt = :ts",
        ExpressionAttributeNames: { "#syncedAt": "syncedAt" },
        ExpressionAttributeValues: { ":ts": new Date().toISOString() },
      }),
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `Failed to mark record as synced — PK: ${pk}, SK: ${sk}, error: ${message}`,
    );
  }
}
