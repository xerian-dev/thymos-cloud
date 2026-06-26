/**
 * Property-based tests for Amplify configuration validation.
 *
 * Feature: shop-monorepo, Property 6: Configuration validation
 * Validates: Requirements 9.5
 *
 * For any Amplify configuration where the User Pool ID or Client ID is missing,
 * empty, or does not match the expected format (region_poolId pattern for pool ID),
 * the application SHALL display a configuration error message and SHALL NOT attempt
 * any authentication operations.
 */
import { describe, it, expect } from "vitest"
import fc from "fast-check"
import {
  validateAmplifyConfig,
  isValidUserPoolId,
  isValidClientId,
} from "./amplify-config"

const NUM_RUNS = 100

/**
 * Generates valid Cognito User Pool IDs matching: /^[a-z]{2}-[a-z]+-\d+_[A-Za-z0-9]+$/
 */
const validUserPoolIdArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringMatching(/^[a-z]{2}$/),
    fc.stringMatching(/^[a-z]{3,10}$/),
    fc.integer({ min: 1, max: 9 }),
    fc.stringMatching(/^[A-Za-z0-9]{1,20}$/)
  )
  .map(([prefix, name, num, suffix]) => `${prefix}-${name}-${num}_${suffix}`)

/**
 * Generates valid Cognito Client IDs (alphanumeric, non-empty).
 */
const validClientIdArb: fc.Arbitrary<string> =
  fc.stringMatching(/^[A-Za-z0-9]{1,30}$/)

/**
 * Generates missing/empty/null values for pool ID or client ID.
 */
const missingOrEmptyArb: fc.Arbitrary<string | undefined | null> = fc.oneof(
  fc.constant(undefined as string | undefined | null),
  fc.constant(null as string | undefined | null),
  fc.constant("" as string | undefined | null),
  fc.stringMatching(/^ {1,10}$/).map((s) => s as string | undefined | null)
)

/**
 * Generates strings that do NOT match the valid user pool ID pattern.
 * Includes: no underscore separator, invalid region format, special characters.
 */
const malformedUserPoolIdArb: fc.Arbitrary<string> = fc.oneof(
  // Plain alphanumeric without underscore or dashes
  fc.stringMatching(/^[a-z0-9]{1,20}$/).filter((s) => !isValidUserPoolId(s)),
  // Has underscore but bad region format (e.g., uppercase, numbers in region)
  fc
    .tuple(
      fc.stringMatching(/^[A-Z0-9]{2,8}$/),
      fc.stringMatching(/^[A-Za-z0-9]{1,10}$/)
    )
    .map(([prefix, suffix]) => `${prefix}_${suffix}`)
    .filter((s) => !isValidUserPoolId(s)),
  // Valid-looking region but special chars in suffix
  fc
    .tuple(
      fc.stringMatching(/^[a-z]{2}-[a-z]{3,6}-\d$/),
      fc.stringMatching(/^[^A-Za-z0-9]{1,5}$/)
    )
    .map(([region, suffix]) => `${region}_${suffix}`)
    .filter((s) => !isValidUserPoolId(s))
)

/**
 * Generates strings that are NOT valid client IDs (contain non-alphanumeric chars).
 * Filters out strings that would become valid after trimming, since the implementation
 * intentionally trims whitespace from inputs before validation.
 */
const invalidClientIdArb: fc.Arbitrary<string> = fc
  .stringMatching(/^.{1,30}$/)
  .filter((s) => !isValidClientId(s) && !isValidClientId(s.trim()))

describe("Feature: shop-monorepo, Property 6: Configuration validation", () => {
  it("rejects any missing, empty, or whitespace-only user pool ID", () => {
    fc.assert(
      fc.property(missingOrEmptyArb, validClientIdArb, (poolId, clientId) => {
        const result = validateAmplifyConfig(poolId, clientId)
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error).toBeTruthy()
          expect(result.error.length).toBeGreaterThan(0)
        }
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it("rejects any missing, empty, or whitespace-only client ID", () => {
    fc.assert(
      fc.property(validUserPoolIdArb, missingOrEmptyArb, (poolId, clientId) => {
        const result = validateAmplifyConfig(poolId, clientId)
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error).toBeTruthy()
          expect(result.error.length).toBeGreaterThan(0)
        }
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it("rejects any malformed user pool ID that does not match region_poolId pattern", () => {
    fc.assert(
      fc.property(
        malformedUserPoolIdArb,
        validClientIdArb,
        (poolId, clientId) => {
          const result = validateAmplifyConfig(poolId, clientId)
          expect(result.success).toBe(false)
          if (!result.success) {
            expect(result.error).toBeTruthy()
            expect(result.error.length).toBeGreaterThan(0)
          }
        }
      ),
      { numRuns: NUM_RUNS }
    )
  })

  it("rejects any client ID containing non-alphanumeric characters", () => {
    fc.assert(
      fc.property(
        validUserPoolIdArb,
        invalidClientIdArb,
        (poolId, clientId) => {
          const result = validateAmplifyConfig(poolId, clientId)
          expect(result.success).toBe(false)
          if (!result.success) {
            expect(result.error).toBeTruthy()
            expect(result.error.length).toBeGreaterThan(0)
          }
        }
      ),
      { numRuns: NUM_RUNS }
    )
  })

  it("accepts any valid user pool ID and client ID combination", () => {
    fc.assert(
      fc.property(validUserPoolIdArb, validClientIdArb, (poolId, clientId) => {
        const result = validateAmplifyConfig(poolId, clientId)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.config.Cognito.userPoolId).toBe(poolId)
          expect(result.config.Cognito.userPoolClientId).toBe(clientId)
        }
      }),
      { numRuns: NUM_RUNS }
    )
  })
})
