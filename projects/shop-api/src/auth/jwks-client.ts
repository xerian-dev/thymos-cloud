import { createRemoteJWKSet } from "jose";
import type { JWTVerifyGetKey } from "jose";

const region: string = process.env.AWS_REGION ?? "";
const userPoolId: string = process.env.COGNITO_USER_POOL_ID ?? "";

const jwksUrl: URL = new URL(
  `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
);

// Cached at module level — persists across warm Lambda invocations
const jwks: JWTVerifyGetKey = createRemoteJWKSet(jwksUrl);

export function getJwks(): JWTVerifyGetKey {
  return jwks;
}
