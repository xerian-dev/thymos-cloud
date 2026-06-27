import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { listAccounts } from "./routes/list-accounts.js";
import { nextNumber } from "./routes/next-number.js";
import { createAccount } from "./routes/create-account.js";
import { jsonResponse } from "./response.js";

type RouteHandler = (
  event: APIGatewayProxyEventV2,
) => Promise<APIGatewayProxyResultV2>;

const routes: Record<string, RouteHandler> = {
  "GET /api/accounts": listAccounts,
  "GET /api/accounts/next-number": nextNumber,
  "POST /api/accounts": createAccount,
};

export function routeRequest(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const handler = routes[event.routeKey];
  if (!handler) {
    return Promise.resolve(jsonResponse(404, { error: "not_found" }));
  }
  return handler(event);
}
