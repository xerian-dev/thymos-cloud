import type { APIGatewaySimpleAuthorizerResult } from "aws-lambda";

export function buildPolicy(
  groups: string[],
): APIGatewaySimpleAuthorizerResult {
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

  return { isAuthorized: false };
}
