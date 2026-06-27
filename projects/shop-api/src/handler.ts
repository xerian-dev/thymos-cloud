import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { routeRequest } from "./router.js";
import { errorResponse } from "./response.js";

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    return await routeRequest(event);
  } catch {
    return errorResponse();
  }
}
