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

export async function fetchFromConsignCloud(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  console.info("ConsignCloud import: starting fetch operation");

  try {
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
