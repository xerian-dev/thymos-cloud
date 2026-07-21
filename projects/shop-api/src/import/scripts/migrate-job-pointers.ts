import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

export const PREFIXES = [
  "ITEM_IMPORT",
  "SALE_IMPORT",
  "ACCOUNT_IMPORT",
] as const;

export async function migrate(): Promise<void> {
  const tableName = process.env.IMPORT_TABLE_NAME;
  if (!tableName) {
    throw new Error("IMPORT_TABLE_NAME environment variable is required");
  }

  const client = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });

  let totalFound = 0;
  let totalCreated = 0;
  let totalSkipped = 0;

  for (const prefix of PREFIXES) {
    console.log(`Processing ${prefix}...`);
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: "begins_with(PK, :pkPrefix) AND SK = :sk",
          ExpressionAttributeValues: {
            ":pkPrefix": `${prefix}#`,
            ":sk": "METADATA",
          },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );

      for (const item of result.Items ?? []) {
        totalFound++;
        const jobId = item.jobId as string;
        const lastUpdatedAt = item.lastUpdatedAt as string;
        const pointerSK = `${prefix}#${lastUpdatedAt}#${jobId}`;

        try {
          await docClient.send(
            new PutCommand({
              TableName: tableName,
              Item: {
                PK: "JOBS",
                SK: pointerSK,
                jobId,
                state: item.state,
                phase: item.phase ?? "fetch",
                progress: item.progress,
                startedAt: item.startedAt,
                lastUpdatedAt,
                prefix,
                ...(item.error ? { error: item.error } : {}),
              },
              ConditionExpression: "attribute_not_exists(PK)",
            }),
          );
          totalCreated++;
        } catch (err: unknown) {
          if (
            err instanceof Error &&
            err.name === "ConditionalCheckFailedException"
          ) {
            totalSkipped++;
          } else {
            throw err;
          }
        }
      }

      exclusiveStartKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);
  }

  console.log(
    `Migration complete. Found: ${totalFound}, Created: ${totalCreated}, Skipped: ${totalSkipped}`,
  );
}

if (process.env.NODE_ENV !== "test") {
  migrate().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
