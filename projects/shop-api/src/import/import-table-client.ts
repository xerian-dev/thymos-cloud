import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ConsignCloudAccount } from "./field-mapper";

export interface FetchResult {
  status: "success" | "partial_failure";
  totalFetched: number;
  skipped: number;
  stored: number;
  timestamp: string;
  error?: string;
}

export interface ImportReport {
  added: number;
  updated: number;
  skipped: number;
  errored: number;
  errors: ImportError[];
  startedAt: string;
  completedAt: string;
}

export interface ImportError {
  consignCloudId: string;
  message: string;
}

export interface ImportedAccountRecord {
  PK: string;
  SK: string;
  id: string;
  number: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  balance: number;
  emailNotificationsEnabled: boolean;
  created: string;
  importedAt: string;
}

const client = new DynamoDBClient({});
const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";

export async function writeImportedAccounts(
  accounts: ConsignCloudAccount[],
  importedAt: string,
): Promise<void> {
  const BATCH_SIZE = 25;

  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE);

    const putRequests = batch.map((account) => ({
      PutRequest: {
        Item: {
          PK: `IMPORT#CONSIGNCLOUD#${account.id}`,
          SK: "METADATA",
          id: account.id,
          number: account.number,
          firstName: account.first_name,
          lastName: account.last_name,
          company: account.company,
          email: account.email,
          balance: account.balance,
          emailNotificationsEnabled: account.email_notifications_enabled,
          created: account.created,
          importedAt,
        },
      },
    }));

    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [IMPORT_TABLE_NAME]: putRequests,
        },
      }),
    );
  }
}

export async function writeSummaryRecord(summary: FetchResult): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: IMPORT_TABLE_NAME,
      Item: {
        PK: "IMPORT#CONSIGNCLOUD#SUMMARY",
        SK: "LATEST",
        totalFetched: summary.totalFetched,
        skipped: summary.skipped,
        stored: summary.stored,
        timestamp: summary.timestamp,
        status: summary.status,
        error: summary.error,
      },
    }),
  );
}

export async function scanImportedAccounts(): Promise<ImportedAccountRecord[]> {
  const records: ImportedAccountRecord[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: IMPORT_TABLE_NAME,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    if (result.Items) {
      for (const item of result.Items) {
        const pk = item.PK as string;
        if (
          pk.startsWith("IMPORT#CONSIGNCLOUD#SUMMARY") ||
          pk.startsWith("SYNC#REPORT")
        ) {
          continue;
        }
        records.push(item as unknown as ImportedAccountRecord);
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  return records;
}

export async function writeSyncReport(report: ImportReport): Promise<void> {
  // Truncate errors to first 100 to stay under DynamoDB's 400KB item size limit
  const truncatedErrors = report.errors.slice(0, 100);

  await docClient.send(
    new PutCommand({
      TableName: IMPORT_TABLE_NAME,
      Item: {
        PK: "SYNC#REPORT",
        SK: report.startedAt,
        added: report.added,
        updated: report.updated,
        skipped: report.skipped,
        errored: report.errored,
        errors: truncatedErrors,
        errorsTruncated: report.errors.length > 100,
        startedAt: report.startedAt,
        completedAt: report.completedAt,
      },
    }),
  );
}
