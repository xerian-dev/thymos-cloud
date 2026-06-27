import { jwtVerify } from "jose";
import { getJwks } from "./jwks-client.js";

const region: string = process.env.AWS_REGION ?? "";
const userPoolId: string = process.env.COGNITO_USER_POOL_ID ?? "";
const issuer: string = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;

export interface JwtValidationResult {
  valid: true;
  groups: string[];
}

export interface JwtValidationError {
  valid: false;
}

export type JwtResult = JwtValidationResult | JwtValidationError;

export async function validateJwt(token: string): Promise<JwtResult> {
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer,
    });

    if (payload.token_use !== "access") {
      return { valid: false };
    }

    const groups: string[] =
      (payload["cognito:groups"] as string[] | undefined) ?? [];

    return { valid: true, groups };
  } catch {
    return { valid: false };
  }
}
