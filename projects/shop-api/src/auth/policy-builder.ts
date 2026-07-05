import type { APIGatewaySimpleAuthorizerWithContextResult } from "aws-lambda";

interface AuthContext {
  groups: string;
}

type AuthorizerResult =
  APIGatewaySimpleAuthorizerWithContextResult<AuthContext>;

export function buildPolicy(groups: string[]): AuthorizerResult {
  if (groups.includes("admin")) {
    return {
      isAuthorized: true,
      context: { groups: "admin" },
    };
  }

  if (groups.includes("readonly")) {
    return {
      isAuthorized: true,
      context: { groups: "readonly" },
    };
  }

  return { isAuthorized: false, context: { groups: "" } };
}
