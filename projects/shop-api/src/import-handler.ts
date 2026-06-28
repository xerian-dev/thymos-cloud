import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { fetchFromConsignCloud } from "./import/fetch-from-consigncloud";
import { syncToShopTable } from "./import/sync-to-shop-table";

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
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

  return {
    statusCode: 404,
    body: JSON.stringify({ message: "Not Found" }),
  };
}
