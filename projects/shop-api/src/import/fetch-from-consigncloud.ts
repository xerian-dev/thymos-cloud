import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { getConsignCloudApiKey } from "./ssm-client";
import { createRateLimiter } from "./rate-limiter";
import { fetchAllAccounts } from "./consigncloud-client";
import {
  writeImportedAccounts,
  writeSummaryRecord,
} from "./import-table-client";
import type { FetchResult } from "./import-table-client";

export type { FetchResult } from "./import-table-client";

export interface FetchAccountsInternalResult {
  success: boolean;
  report?: {
    added: number;
    skipped: number;
    stored: number;
    timestamp: string;
  };
  error?: string;
}

export async function fetchAccountsInternal(): Promise<FetchAccountsInternalResult> {
  console.info("ConsignCloud import: starting fetch operation");

  const apiKey: string = await getConsignCloudApiKey();

  const rateLimiter = createRateLimiter({ capacity: 100, drainRate: 10 });

  const baseUrl: string = process.env.CONSIGNCLOUD_BASE_URL ?? "";

  const { accounts, skipped } = await fetchAllAccounts({
    apiKey,
    baseUrl,
    rateLimiter,
  });

  const timestamp: string = new Date().toISOString();

  await writeImportedAccounts(accounts, timestamp);

  const result: FetchResult = {
    status: "success",
    totalFetched: accounts.length + skipped,
    skipped,
    stored: accounts.length,
    timestamp,
  };

  await writeSummaryRecord(result);

  console.info("ConsignCloud import: fetch operation completed", {
    totalFetched: result.totalFetched,
    skipped: result.skipped,
    stored: result.stored,
  });

  return {
    success: true,
    report: {
      added: accounts.length,
      skipped,
      stored: accounts.length,
      timestamp,
    },
  };
}

export async function fetchFromConsignCloud(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const internalResult = await fetchAccountsInternal();

    const result: FetchResult = {
      status: "success",
      totalFetched:
        (internalResult.report?.added ?? 0) +
        (internalResult.report?.skipped ?? 0),
      skipped: internalResult.report?.skipped ?? 0,
      stored: internalResult.report?.stored ?? 0,
      timestamp: internalResult.report?.timestamp ?? new Date().toISOString(),
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (error: unknown) {
    const message: string =
      error instanceof Error ? error.message : "Unknown error occurred";

    console.error("ConsignCloud import: fetch operation failed", {
      error: message,
    });

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "error",
        message: `Import fetch failed: ${message}`,
      }),
    };
  }
}
