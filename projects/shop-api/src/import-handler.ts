import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { fetchFromConsignCloud } from "./import/fetch-from-consigncloud";
import { syncToShopTable } from "./import/sync-to-shop-table";
import {
  handleItemImportStart,
  handleItemImportSync,
  handleItemImportResume,
  handleItemImportStatus,
  handleResumeInternal,
} from "./import/item-import-handler";
import type { ImportPhase } from "./import/self-invoker";

declare const __BUILD_TIMESTAMP__: string;

const BUILD_VERSION: string =
  typeof __BUILD_TIMESTAMP__ !== "undefined" ? __BUILD_TIMESTAMP__ : "dev";

let coldStart = true;

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  // Check for Step Function invocation (resume-internal event)
  const rawEvent = event as unknown as {
    action?: string;
    jobId?: string;
    phase?: ImportPhase;
  };
  if (rawEvent.action === "resume-internal" && rawEvent.jobId) {
    const result = await handleResumeInternal(
      rawEvent.jobId,
      rawEvent.phase ?? "fetch",
    );
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  }

  if (coldStart) {
    console.info("Import handler cold start", { version: BUILD_VERSION });
    coldStart = false;
  }

  const method: string = event.requestContext.http.method;
  const path: string = event.rawPath;

  if (path === "/api/import/fetch") {
    if (method !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ message: "Method Not Allowed" }),
      };
    }
    return fetchFromConsignCloud(event);
  }

  if (path === "/api/import/sync") {
    if (method !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ message: "Method Not Allowed" }),
      };
    }
    return syncToShopTable(event);
  }

  if (path === "/api/import/items/start") {
    if (method !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ message: "Method Not Allowed" }),
      };
    }
    return handleItemImportStart(event);
  }

  if (path === "/api/import/items/sync") {
    if (method !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ message: "Method Not Allowed" }),
      };
    }
    return handleItemImportSync(event);
  }

  if (path === "/api/import/items/resume") {
    if (method !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ message: "Method Not Allowed" }),
      };
    }
    return handleItemImportResume(event);
  }

  if (path === "/api/import/items/status") {
    if (method !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ message: "Method Not Allowed" }),
      };
    }
    return handleItemImportStatus(event);
  }

  return {
    statusCode: 404,
    body: JSON.stringify({ message: "Not Found" }),
  };
}
