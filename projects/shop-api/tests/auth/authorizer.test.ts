import { describe, it, expect, vi } from "vitest";
import type { APIGatewayRequestAuthorizerEventV2 } from "aws-lambda";

vi.mock("../../src/auth/jwt-validator.js", () => ({
  validateJwt: vi.fn(),
}));

vi.mock("../../src/auth/policy-builder.js", () => ({
  buildPolicy: vi.fn(),
}));

import { handler } from "../../src/authorizer.js";
import { validateJwt } from "../../src/auth/jwt-validator.js";
import { buildPolicy } from "../../src/auth/policy-builder.js";

const mockedValidateJwt = vi.mocked(validateJwt);
const mockedBuildPolicy = vi.mocked(buildPolicy);

function makeEvent(
  headers?: Record<string, string>,
): APIGatewayRequestAuthorizerEventV2 {
  return {
    version: "2.0",
    type: "REQUEST",
    routeArn:
      "arn:aws:execute-api:us-east-1:123456789:api-id/stage/GET/api/accounts",
    identitySource: headers?.authorization ?? "",
    routeKey: "GET /api/accounts",
    rawPath: "/api/accounts",
    rawQueryString: "",
    headers: headers ?? {},
    requestContext: {
      accountId: "123456789",
      apiId: "api-id",
      domainName: "api-id.execute-api.us-east-1.amazonaws.com",
      domainPrefix: "api-id",
      http: {
        method: "GET",
        path: "/api/accounts",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      requestId: "req-id",
      routeKey: "GET /api/accounts",
      stage: "$default",
      time: "01/Jan/2024:00:00:00 +0000",
      timeEpoch: 1704067200000,
    },
  } as APIGatewayRequestAuthorizerEventV2;
}

describe("authorizer handler", () => {
  it("returns deny when Authorization header is missing", async () => {
    const event = makeEvent({});
    const result = await handler(event);
    expect(result).toEqual({ isAuthorized: false });
  });

  it("returns deny when Authorization header does not use Bearer scheme", async () => {
    const event = makeEvent({ authorization: "Basic abc123" });
    const result = await handler(event);
    expect(result).toEqual({ isAuthorized: false });
  });

  it("returns deny when token is invalid", async () => {
    mockedValidateJwt.mockResolvedValue({ valid: false });
    const event = makeEvent({ authorization: "Bearer invalid-token" });
    const result = await handler(event);
    expect(result).toEqual({ isAuthorized: false });
    expect(mockedValidateJwt).toHaveBeenCalledWith("invalid-token");
  });

  it("returns policy from buildPolicy when token is valid", async () => {
    mockedValidateJwt.mockResolvedValue({ valid: true, groups: ["admin"] });
    mockedBuildPolicy.mockReturnValue({
      isAuthorized: true,
      context: { groups: "admin" },
    });

    const event = makeEvent({ authorization: "Bearer valid-token" });
    const result = await handler(event);

    expect(mockedValidateJwt).toHaveBeenCalledWith("valid-token");
    expect(mockedBuildPolicy).toHaveBeenCalledWith(["admin"]);
    expect(result).toEqual({
      isAuthorized: true,
      context: { groups: "admin" },
    });
  });

  it("returns deny when validateJwt throws an error", async () => {
    mockedValidateJwt.mockRejectedValue(new Error("unexpected error"));
    const event = makeEvent({ authorization: "Bearer some-token" });
    const result = await handler(event);
    expect(result).toEqual({ isAuthorized: false });
  });

  it("returns deny when buildPolicy throws an error", async () => {
    mockedValidateJwt.mockResolvedValue({
      valid: true,
      groups: ["readonly"],
    });
    mockedBuildPolicy.mockImplementation(() => {
      throw new Error("policy error");
    });

    const event = makeEvent({ authorization: "Bearer some-token" });
    const result = await handler(event);
    expect(result).toEqual({ isAuthorized: false });
  });

  it("extracts token correctly from Bearer prefix", async () => {
    mockedValidateJwt.mockResolvedValue({ valid: true, groups: [] });
    mockedBuildPolicy.mockReturnValue({ isAuthorized: false });

    const event = makeEvent({ authorization: "Bearer my.jwt.token" });
    await handler(event);

    expect(mockedValidateJwt).toHaveBeenCalledWith("my.jwt.token");
  });
});
