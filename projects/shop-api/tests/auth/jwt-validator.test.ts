import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

import { validateJwt } from "../../src/auth/jwt-validator";
import { jwtVerify } from "jose";

const mockedJwtVerify = vi.mocked(jwtVerify);

describe("jwt-validator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns valid with admin group for a valid token", async () => {
    mockedJwtVerify.mockResolvedValue({
      payload: {
        token_use: "access",
        "cognito:groups": ["admin"],
        iss: "https://cognito-idp.us-east-1.amazonaws.com/pool-id",
      },
      protectedHeader: { alg: "RS256" },
    } as never);

    const result = await validateJwt("valid-token");
    expect(result).toEqual({ valid: true, groups: ["admin"] });
  });

  it("returns valid with readonly group for a valid token", async () => {
    mockedJwtVerify.mockResolvedValue({
      payload: {
        token_use: "access",
        "cognito:groups": ["readonly"],
        iss: "https://cognito-idp.us-east-1.amazonaws.com/pool-id",
      },
      protectedHeader: { alg: "RS256" },
    } as never);

    const result = await validateJwt("valid-token");
    expect(result).toEqual({ valid: true, groups: ["readonly"] });
  });

  it("returns invalid when token is expired (jwtVerify throws)", async () => {
    mockedJwtVerify.mockRejectedValue(new Error("token expired"));

    const result = await validateJwt("expired-token");
    expect(result).toEqual({ valid: false });
  });

  it("returns invalid when issuer is incorrect (jwtVerify throws)", async () => {
    mockedJwtVerify.mockRejectedValue(
      new Error('unexpected "iss" claim value'),
    );

    const result = await validateJwt("bad-issuer-token");
    expect(result).toEqual({ valid: false });
  });

  it("returns invalid when token_use is not access", async () => {
    mockedJwtVerify.mockResolvedValue({
      payload: {
        token_use: "id",
        "cognito:groups": ["admin"],
        iss: "https://cognito-idp.us-east-1.amazonaws.com/pool-id",
      },
      protectedHeader: { alg: "RS256" },
    } as never);

    const result = await validateJwt("id-token");
    expect(result).toEqual({ valid: false });
  });

  it("returns valid with empty groups when no groups claim present", async () => {
    mockedJwtVerify.mockResolvedValue({
      payload: {
        token_use: "access",
        iss: "https://cognito-idp.us-east-1.amazonaws.com/pool-id",
      },
      protectedHeader: { alg: "RS256" },
    } as never);

    const result = await validateJwt("no-groups-token");
    expect(result).toEqual({ valid: true, groups: [] });
  });
});
