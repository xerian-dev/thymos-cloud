import type { APIGatewayProxyResultV2 } from "aws-lambda";

export function jsonResponse(
  statusCode: number,
  body: unknown,
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function textResponse(
  statusCode: number,
  body: string,
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "text/plain" },
    body,
  };
}

export function errorResponse(): APIGatewayProxyResultV2 {
  return jsonResponse(500, { error: "internal_error" });
}
