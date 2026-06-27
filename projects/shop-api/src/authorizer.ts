import type {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerResult,
} from "aws-lambda";
import { validateJwt } from "./auth/jwt-validator.js";
import { buildPolicy } from "./auth/policy-builder.js";

export async function handler(
  event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewaySimpleAuthorizerResult> {
  try {
    const authHeader = event.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { isAuthorized: false };
    }

    const token = authHeader.slice(7);
    const result = await validateJwt(token);

    if (!result.valid) {
      return { isAuthorized: false };
    }

    return buildPolicy(result.groups);
  } catch {
    return { isAuthorized: false };
  }
}
