import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { scanImportedAccounts, writeSyncReport } from "./import-table-client";
import type { ImportedAccountRecord } from "./import-table-client";
import { mapConsignCloudToShop, hasFieldChanges } from "./field-mapper";
import type { ConsignCloudAccount } from "./field-mapper";
import { docClient, TABLE_NAME } from "../dynamodb-client";
import {
  QueryCommand,
  GetCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

export type { ImportReport, ImportError } from "./import-table-client";

interface ShopTableAccount {
  PK: string;
  SK: string;
  name: string;
  company?: string;
  telephone: string;
  sourceId?: string;
}

function toConsignCloudAccount(
  record: ImportedAccountRecord,
): ConsignCloudAccount {
  return {
    id: record.id,
    number: record.number,
    first_name: record.firstName,
    last_name: record.lastName,
    company: record.company,
    email: record.email,
    balance: record.balance,
    email_notifications_enabled: record.emailNotificationsEnabled,
    created: record.created,
  };
}

async function findBySourceId(
  sourceId: string,
): Promise<ShopTableAccount | undefined> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "sourceId-index",
      KeyConditionExpression: "sourceId = :sourceId",
      ExpressionAttributeValues: { ":sourceId": sourceId },
      Limit: 1,
    }),
  );

  if (result.Items && result.Items.length > 0) {
    return result.Items[0] as unknown as ShopTableAccount;
  }

  return undefined;
}

async function getSequenceCounter(): Promise<number> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER" },
    }),
  );

  if (!result.Item) {
    return 0;
  }

  return result.Item.value as number;
}

function padAccountNumber(num: number): string {
  return String(num).padStart(7, "0");
}

export async function syncToShopTable(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const startedAt: string = new Date().toISOString();
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let errored = 0;
  const errors: Array<{ consignCloudId: string; message: string }> = [];

  let records: ImportedAccountRecord[];

  try {
    records = await scanImportedAccounts();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Catastrophic failure scanning Import_Table", {
      error: message,
    });

    const completedAt: string = new Date().toISOString();
    const report = {
      added,
      updated,
      skipped,
      errored,
      errors,
      startedAt,
      completedAt,
    };

    try {
      await writeSyncReport(report);
    } catch (reportError: unknown) {
      console.error("Failed to write sync report", {
        error:
          reportError instanceof Error ? reportError.message : "Unknown error",
      });
    }

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...report, error: message }),
    };
  }

  console.info("Sync started", { recordCount: records.length });

  let processed = 0;

  for (const record of records) {
    try {
      const consignCloudAccount: ConsignCloudAccount =
        toConsignCloudAccount(record);
      const mapped = mapConsignCloudToShop(consignCloudAccount);
      const existing = await findBySourceId(record.id);

      if (!existing) {
        const currentCounter: number = await getSequenceCounter();
        const nextCounter: number = currentCounter + 1;
        const paddedNumber: string = padAccountNumber(nextCounter);

        await docClient.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: TABLE_NAME,
                  Item: {
                    PK: `ACCOUNT#${paddedNumber}`,
                    SK: "METADATA",
                    uuid: crypto.randomUUID(),
                    name: mapped.name,
                    address: "",
                    telephone: mapped.telephone,
                    company: mapped.company,
                    sourceId: record.id,
                    createdAt: new Date().toISOString(),
                  },
                },
              },
              {
                Update: {
                  TableName: TABLE_NAME,
                  Key: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER" },
                  UpdateExpression: "SET #val = :newVal",
                  ConditionExpression: "#val = :currentVal",
                  ExpressionAttributeNames: { "#val": "value" },
                  ExpressionAttributeValues: {
                    ":newVal": nextCounter,
                    ":currentVal": currentCounter,
                  },
                },
              },
            ],
          }),
        );

        added++;
      } else if (hasFieldChanges(existing, mapped)) {
        await docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: existing.PK, SK: existing.SK },
            UpdateExpression:
              "SET #name = :name, #company = :company, #telephone = :telephone",
            ExpressionAttributeNames: {
              "#name": "name",
              "#company": "company",
              "#telephone": "telephone",
            },
            ExpressionAttributeValues: {
              ":name": mapped.name,
              ":company": mapped.company,
              ":telephone": mapped.telephone,
            },
          }),
        );

        updated++;
      } else {
        skipped++;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push({ consignCloudId: record.id, message });
      errored++;
      if (errored <= 3) {
        console.error("Record sync failed", {
          consignCloudId: record.id,
          error: message,
        });
      }
    }

    processed++;
    if (processed % 100 === 0) {
      console.info("Sync progress", {
        processed,
        total: records.length,
        added,
        updated,
        skipped,
        errored,
      });
    }
  }

  const completedAt: string = new Date().toISOString();
  const report = {
    added,
    updated,
    skipped,
    errored,
    errors,
    startedAt,
    completedAt,
  };

  try {
    await writeSyncReport(report);
  } catch (reportError: unknown) {
    console.error("Failed to write sync report", {
      error:
        reportError instanceof Error ? reportError.message : "Unknown error",
    });
  }

  console.info("Sync completed", {
    added,
    updated,
    skipped,
    errored,
    totalProcessed: records.length,
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      added,
      updated,
      skipped,
      errored,
      errors: errors.slice(0, 20),
      startedAt,
      completedAt,
    }),
  };
}
