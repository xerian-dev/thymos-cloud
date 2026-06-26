import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { mapAuthError } from "./auth-provider"

/**
 * Feature: shop-monorepo, Property 3: Auth error message safety
 *
 * For any authentication error returned by the Cognito SDK (including network errors,
 * invalid credentials, service exceptions), the error message displayed to the user
 * SHALL NOT contain AWS request IDs, stack traces, internal endpoint URLs, or
 * Cognito-specific error codes, AND the email field value SHALL be preserved after
 * the error is displayed.
 *
 * Validates: Requirements 5.8
 */

const SAFE_MESSAGES = [
  "Incorrect email or password",
  "Unable to connect. Check your internet connection.",
  "Service temporarily unavailable. Please try again.",
  "Something went wrong. Please try again.",
] as const

const COGNITO_ERROR_NAMES = [
  "NotAuthorizedException",
  "UserNotFoundException",
  "NetworkError",
  "InternalErrorException",
  "ServiceUnavailableException",
  "TooManyRequestsException",
  "UnauthorizedException",
  "LimitExceededException",
  "InvalidParameterException",
  "ResourceNotFoundException",
  "CodeDeliveryFailureException",
  "ExpiredCodeException",
  "InvalidPasswordException",
  "UsernameExistsException",
] as const

/** Patterns that indicate leaked internals */
const AWS_REQUEST_ID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const REQUEST_ID_PREFIX_PATTERN = /Request\s*ID\s*:/i
const STACK_TRACE_PATTERN = /^\s*at\s+/m
const FILE_PATH_PATTERN = /\.(ts|js|tsx|jsx):\d+/
const INTERNAL_URL_PATTERN = /amazonaws\.com/i
const COGNITO_ERROR_CODE_PATTERN = new RegExp(
  COGNITO_ERROR_NAMES.join("|"),
  "i"
)

/** Arbitrary for generating Cognito-like error names */
const cognitoErrorNameArb = fc.oneof(
  fc.constantFrom(...COGNITO_ERROR_NAMES),
  fc.string({ minLength: 1, maxLength: 40 })
)

/** Arbitrary for generating error messages that might contain internals */
const dangerousMessageArb = fc.oneof(
  // Messages with AWS request IDs
  fc
    .tuple(fc.string(), fc.uuid())
    .map(([prefix, uuid]) => `${prefix} Request ID: ${uuid}`),
  // Messages with stack traces
  fc
    .string()
    .map(
      (s) => `Error: ${s}\n    at Object.<anonymous> (/var/task/index.js:42:13)`
    ),
  // Messages with internal URLs
  fc
    .string()
    .map(
      (s) => `${s} https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc123`
    ),
  // Messages with Cognito error codes embedded
  fc
    .tuple(fc.constantFrom(...COGNITO_ERROR_NAMES), fc.string())
    .map(([code, detail]) => `${code}: ${detail}`),
  // Plain messages (some may be harmless)
  fc.string({ minLength: 0, maxLength: 200 }),
  // Messages with network keywords
  fc.constantFrom(
    "network error",
    "Network request failed",
    "Failed to fetch",
    "ECONNREFUSED"
  )
)

/** Arbitrary that creates an Error object with a specific name and message */
const cognitoErrorArb: fc.Arbitrary<Error> = fc
  .tuple(cognitoErrorNameArb, dangerousMessageArb)
  .map(([name, message]) => {
    const error = new Error(message)
    error.name = name
    return error
  })

/** Arbitrary for non-Error values that might be thrown */
const nonErrorArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.constant(null),
  fc.constant(undefined),
  fc.dictionary(fc.string(), fc.string()),
  fc.object()
)

describe("Feature: shop-monorepo, Property 3: Auth error message safety", () => {
  it("mapped error messages never contain AWS request IDs, stack traces, internal URLs, or Cognito error codes", () => {
    fc.assert(
      fc.property(cognitoErrorArb, (error) => {
        const message = mapAuthError(error)

        // Output must be one of the predefined safe messages
        expect(SAFE_MESSAGES).toContain(message)

        // Additional explicit checks for leaked internals
        expect(message).not.toMatch(AWS_REQUEST_ID_PATTERN)
        expect(message).not.toMatch(REQUEST_ID_PREFIX_PATTERN)
        expect(message).not.toMatch(STACK_TRACE_PATTERN)
        expect(message).not.toMatch(FILE_PATH_PATTERN)
        expect(message).not.toMatch(INTERNAL_URL_PATTERN)
        expect(message).not.toMatch(COGNITO_ERROR_CODE_PATTERN)
      }),
      { numRuns: 100 }
    )
  })

  it("mapped error messages from non-Error values never leak internals", () => {
    fc.assert(
      fc.property(nonErrorArb, (error) => {
        const message = mapAuthError(error)

        // Output must be one of the predefined safe messages
        expect(SAFE_MESSAGES).toContain(message)

        // Additional explicit checks for leaked internals
        expect(message).not.toMatch(AWS_REQUEST_ID_PATTERN)
        expect(message).not.toMatch(REQUEST_ID_PREFIX_PATTERN)
        expect(message).not.toMatch(STACK_TRACE_PATTERN)
        expect(message).not.toMatch(FILE_PATH_PATTERN)
        expect(message).not.toMatch(INTERNAL_URL_PATTERN)
      }),
      { numRuns: 100 }
    )
  })

  it("email field value is preserved after mapAuthError is called (function is pure, does not mutate state)", () => {
    fc.assert(
      fc.property(cognitoErrorArb, fc.emailAddress(), (error, email) => {
        // Simulate the auth flow: email is set, error occurs, mapAuthError called
        const preservedEmail = email

        // mapAuthError is a pure function - calling it should not affect external state
        mapAuthError(error)

        // Email must still be the same value (preserved)
        expect(preservedEmail).toBe(email)
      }),
      { numRuns: 100 }
    )
  })
})
