import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { ProgressCounts } from "./job-manager";

export interface FailureEntry {
  itemId: string;
  error: string;
}

export interface ImportReportData {
  jobId: string;
  totalProcessed: number;
  imported: number;
  skipped: number;
  failed: number;
  elapsedSeconds: number;
  failures: FailureEntry[];
  truncated: boolean;
  totalFailures: number;
  completedAt: string;
}

const MAX_FAILURES = 100;
const MAX_ERROR_LENGTH = 200;

const client = new DynamoDBClient({});
const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const IMPORT_TABLE_NAME: string = process.env.IMPORT_TABLE_NAME ?? "";

export function buildImportReport(
  jobId: string,
  progress: ProgressCounts,
  startedAt: string,
  failures: FailureEntry[],
  totalFailures: number,
): ImportReportData {
  const completedAt = new Date().toISOString();
  const elapsedSeconds = Math.round(
    (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000,
  );

  const truncatedFailures = failures.slice(0, MAX_FAILURES).map((entry) => ({
    itemId: entry.itemId,
    error: entry.error.slice(0, MAX_ERROR_LENGTH),
  }));

  return {
    jobId,
    totalProcessed: progress.processed,
    imported: progress.imported,
    skipped: progress.skipped,
    failed: progress.failed,
    elapsedSeconds,
    failures: truncatedFailures,
    truncated: totalFailures > MAX_FAILURES,
    totalFailures,
    completedAt,
  };
}

export async function writeImportReport(
  report: ImportReportData,
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: IMPORT_TABLE_NAME,
      Item: {
        PK: "ITEM_IMPORT#REPORT",
        SK: report.jobId,
        jobId: report.jobId,
        totalProcessed: report.totalProcessed,
        imported: report.imported,
        skipped: report.skipped,
        failed: report.failed,
        elapsedSeconds: report.elapsedSeconds,
        failures: report.failures,
        truncated: report.truncated,
        totalFailures: report.totalFailures,
        completedAt: report.completedAt,
      },
    }),
  );
}
