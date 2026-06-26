import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { sanitizeErrorMessage } from "./auth-provider"

/**
 * Feature: force-change-password, Property 5: Error message sanitization
 *
 * For any error message containing AWS request IDs, URLs, or stack traces,
 * the `sanitizeErrorMessage` function SHALL return a string that contains
 * none of those internal details.
 *
 * Validates: Requirements 5.6
 */

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const URL_PATTERN = /https?:\/\/[^\s]+/gi
const STACK_TRACE_PATTERN = /\n?\s*at\s+.*/g

/** Generates a random UUID string matching AWS request ID format */
const uuidArb = fc.uuid()

/** Generates a random URL (http or https followed by non-whitespace) */
const urlArb = fc.webUrl()

/** Generates a stack trace line (starting with "at ...") */
const stackTraceLineArb = fc
  .tuple(
    fc.constantFrom(
      "Object.<anonymous>",
      "Function.call",
      "Module._compile",
      "processTicksAndRejections",
      "AuthService.signIn"
    ),
    fc.constantFrom(
      "(/app/src/auth.ts:42:7)",
      "(internal/modules/cjs/loader.js:1063:30)",
      "(/node_modules/aws-sdk/lib/request.js:31:9)"
    )
  )
  .map(([fn, loc]) => `\n    at ${fn} ${loc}`)

/** Generates a message with embedded UUIDs */
const messageWithUuidArb = fc
  .tuple(fc.lorem({ maxCount: 3 }), uuidArb, fc.lorem({ maxCount: 3 }))
  .map(([prefix, uuid, suffix]) => `${prefix} ${uuid} ${suffix}`)

/** Generates a message with embedded URLs */
const messageWithUrlArb = fc
  .tuple(fc.lorem({ maxCount: 3 }), urlArb, fc.lorem({ maxCount: 3 }))
  .map(([prefix, url, suffix]) => `${prefix} ${url} ${suffix}`)

/** Generates a message with embedded stack traces */
const messageWithStackTraceArb = fc
  .tuple(
    fc.lorem({ maxCount: 3 }),
    fc.array(stackTraceLineArb, { minLength: 1, maxLength: 3 })
  )
  .map(([prefix, traces]) => `${prefix}${traces.join("")}`)

/** Generates a message with a mix of all sensitive patterns */
const messageWithAllPatternsArb = fc
  .tuple(
    fc.lorem({ maxCount: 2 }),
    uuidArb,
    urlArb,
    fc.array(stackTraceLineArb, { minLength: 1, maxLength: 2 })
  )
  .map(
    ([prefix, uuid, url, traces]) =>
      `${prefix} RequestId: ${uuid} Endpoint: ${url}${traces.join("")}`
  )

describe("Feature: force-change-password, Property 5: Error message sanitization", () => {
  it("output contains no UUID patterns for messages with embedded UUIDs", () => {
    fc.assert(
      fc.property(messageWithUuidArb, (message) => {
        const result = sanitizeErrorMessage(message)
        expect(result).not.toMatch(UUID_PATTERN)
        expect(result.length).toBeGreaterThan(0)
      }),
      { numRuns: 500 }
    )
  })

  it("output contains no URL patterns for messages with embedded URLs", () => {
    fc.assert(
      fc.property(messageWithUrlArb, (message) => {
        const result = sanitizeErrorMessage(message)
        expect(result).not.toMatch(URL_PATTERN)
        expect(result.length).toBeGreaterThan(0)
      }),
      { numRuns: 500 }
    )
  })

  it("output contains no stack trace lines for messages with embedded stack traces", () => {
    fc.assert(
      fc.property(messageWithStackTraceArb, (message) => {
        const result = sanitizeErrorMessage(message)
        expect(result).not.toMatch(STACK_TRACE_PATTERN)
        expect(result.length).toBeGreaterThan(0)
      }),
      { numRuns: 500 }
    )
  })

  it("output contains none of UUID, URL, or stack trace patterns when all are present", () => {
    fc.assert(
      fc.property(messageWithAllPatternsArb, (message) => {
        const result = sanitizeErrorMessage(message)
        expect(result).not.toMatch(UUID_PATTERN)
        expect(result).not.toMatch(URL_PATTERN)
        expect(result).not.toMatch(STACK_TRACE_PATTERN)
        expect(result.length).toBeGreaterThan(0)
      }),
      { numRuns: 500 }
    )
  })

  it("output is never empty (falls back to default message)", () => {
    // Generate messages that consist ONLY of sensitive patterns (should fall back)
    const onlySensitiveArb = fc
      .tuple(uuidArb, urlArb)
      .map(([uuid, url]) => `${uuid} ${url}`)

    fc.assert(
      fc.property(onlySensitiveArb, (message) => {
        const result = sanitizeErrorMessage(message)
        expect(result.length).toBeGreaterThan(0)
        // Either it preserved some text or it fell back to the default
        expect(result).toBeTruthy()
      }),
      { numRuns: 200 }
    )
  })
})
