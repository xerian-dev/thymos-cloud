import type {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerWithContextResult,
} from "aws-lambda";
import { validateJwt } from "./auth/jwt-validator.js";
import { buildPolicy } from "./auth/policy-builder.js";

interface AuthContext {
  groups: string;
}

export async function handler(
  event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewaySimpleAuthorizerWithContextResult<AuthContext>> {
  try {
    const authHeader = event.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { isAuthorized: false, context: { groups: "" } };
    }

    const token = authHeader.slice(7);
    const result = await validateJwt(token);

    if (!result.valid) {
      return { isAuthorized: false, context: { groups: "" } };
    }

    return buildPolicy(result.groups);
  } catch {
    return { isAuthorized: false, context: { groups: "" } };
  }
}
