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
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

export type { ImportReport, ImportError } from "./import-table-client";

export interface SyncAccountsInternalResult {
  success: boolean;
  report?: { added: number; updated: number; skipped: number; errored: number };
  error?: string;
}

interface ShopTableAccount {
  PK: string;
  SK: string;
  name: string;
  company?: string;
  street?: string;
  place?: string;
  postcode?: string;
  canton?: string;
  email?: string;
  telephone?: string;
  sourceId?: string;
}

function toConsignCloudAccount(
  record: ImportedAccountRecord,
): ConsignCloudAccount {
  return {
    id: record.id,
    number: record.number,
    first_name: record.first_name,
    last_name: record.last_name,
    company: record.company,
    email: record.email,
    phone_number: record.phone_number,
    address_line_1: record.address_line_1,
    address_line_2: record.address_line_2,
    city: record.city,
    state: record.state,
    postal_code: record.postal_code,
    balance: record.balance,
    email_notifications_enabled: record.email_notifications_enabled,
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

export async function syncAccountsInternal(): Promise<SyncAccountsInternalResult> {
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

    return { success: false, error: message };
  }

  console.info("Sync started", { recordCount: records.length });

  let processed = 0;

  for (const record of records) {
    try {
      const consignCloudAccount: ConsignCloudAccount =
        toConsignCloudAccount(record);
      const mapped = mapConsignCloudToShop(consignCloudAccount);
      const existing = await findBySourceId(record.id);

      // Query existing tags for change detection
      let existingTags: string[] = [];
      if (existing) {
        const tagResult = await docClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :tagPrefix)",
            ExpressionAttributeValues: {
              ":pk": existing.PK,
              ":tagPrefix": "TAG#",
            },
          }),
        );
        existingTags = (tagResult.Items ?? []).map(
          (item) => item.tag as string,
        );
      }

      if (!existing) {
        const accountUuid = crypto.randomUUID();
        const paddedNumber = padAccountNumber(parseInt(record.number, 10));

        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: `ACCOUNT#${accountUuid}`,
              SK: "METADATA",
              uuid: accountUuid,
              shopUid: paddedNumber,
              GSI1PK: "ACCOUNT",
              GSI1SK: `ACCOUNT#${paddedNumber}`,
              name: mapped.name,
              street: mapped.street,
              place: mapped.place,
              postcode: mapped.postcode,
              canton: mapped.canton,
              email: mapped.email,
              telephone: mapped.telephone,
              company: mapped.company,
              sourceId: record.id,
              createdAt: new Date().toISOString(),
            },
          }),
        );

        for (const tag of mapped.tags) {
          await docClient.send(
            new PutCommand({
              TableName: TABLE_NAME,
              Item: {
                PK: `ACCOUNT#${accountUuid}`,
                SK: `TAG#${tag}`,
                tag,
                createdAt: new Date().toISOString(),
              },
            }),
          );
        }

        added++;
      } else if (hasFieldChanges({ ...existing, tags: existingTags }, mapped)) {
        await docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: existing.PK, SK: existing.SK },
            UpdateExpression:
              "SET #name = :name, #company = :company, #street = :street, #place = :place, #postcode = :postcode, #canton = :canton, #email = :email, #telephone = :telephone",
            ExpressionAttributeNames: {
              "#name": "name",
              "#company": "company",
              "#street": "street",
              "#place": "place",
              "#postcode": "postcode",
              "#canton": "canton",
              "#email": "email",
              "#telephone": "telephone",
            },
            ExpressionAttributeValues: {
              ":name": mapped.name,
              ":company": mapped.company,
              ":street": mapped.street,
              ":place": mapped.place,
              ":postcode": mapped.postcode,
              ":canton": mapped.canton,
              ":email": mapped.email,
              ":telephone": mapped.telephone,
            },
          }),
        );

        // Delete existing TAG# items
        const existingTagItems = await docClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :tagPrefix)",
            ExpressionAttributeValues: {
              ":pk": existing.PK,
              ":tagPrefix": "TAG#",
            },
          }),
        );

        for (const tagItem of existingTagItems.Items ?? []) {
          await docClient.send(
            new DeleteCommand({
              TableName: TABLE_NAME,
              Key: { PK: tagItem.PK as string, SK: tagItem.SK as string },
            }),
          );
        }

        // Write new TAG# items
        for (const tag of mapped.tags) {
          await docClient.send(
            new PutCommand({
              TableName: TABLE_NAME,
              Item: {
                PK: existing.PK,
                SK: `TAG#${tag}`,
                tag,
                createdAt: new Date().toISOString(),
              },
            }),
          );
        }

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

  // Update sequence counter to max imported number (if higher)
  if (records.length > 0) {
    const maxImportedNumber = Math.max(
      ...records.map((r) => parseInt(r.number, 10)),
    );
    const currentCounter = await getSequenceCounter();
    if (maxImportedNumber > currentCounter) {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER" },
          UpdateExpression: "SET #val = :newVal",
          ExpressionAttributeNames: { "#val": "value" },
          ExpressionAttributeValues: { ":newVal": maxImportedNumber },
        }),
      );
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

  return { success: true, report: { added, updated, skipped, errored } };
}

export async function syncToShopTable(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const result = await syncAccountsInternal();

    if (!result.success) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: result.error }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        added: result.report?.added ?? 0,
        updated: result.report?.updated ?? 0,
        skipped: result.report?.skipped ?? 0,
        errored: result.report?.errored ?? 0,
      }),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("syncToShopTable: unexpected error", { error: message });

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: message }),
    };
  }
}
