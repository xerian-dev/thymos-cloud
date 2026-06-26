import { describe, it, expect } from "vitest"
import {
  isValidUserPoolId,
  isValidClientId,
  validateAmplifyConfig,
} from "./amplify-config"

describe("isValidUserPoolId", () => {
  it("accepts a valid user pool ID with standard region", () => {
    expect(isValidUserPoolId("us-east-1_aBcDeFgHi")).toBe(true)
  })

  it("accepts a valid user pool ID with ap region", () => {
    expect(isValidUserPoolId("ap-southeast-2_Xyz123")).toBe(true)
  })

  it("rejects an empty string", () => {
    expect(isValidUserPoolId("")).toBe(false)
  })

  it("rejects a pool ID without region prefix", () => {
    expect(isValidUserPoolId("aBcDeFgHi")).toBe(false)
  })

  it("rejects a pool ID missing the underscore separator", () => {
    expect(isValidUserPoolId("us-east-1aBcDeFgHi")).toBe(false)
  })

  it("rejects a pool ID with special characters in the pool portion", () => {
    expect(isValidUserPoolId("us-east-1_abc!def")).toBe(false)
  })
})

describe("isValidClientId", () => {
  it("accepts a valid alphanumeric client ID", () => {
    expect(isValidClientId("1a2b3c4d5e6f7g8h9i0j1k2l3m")).toBe(true)
  })

  it("rejects an empty string", () => {
    expect(isValidClientId("")).toBe(false)
  })

  it("rejects a client ID with special characters", () => {
    expect(isValidClientId("abc-def-123")).toBe(false)
  })

  it("rejects a client ID with spaces", () => {
    expect(isValidClientId("abc def")).toBe(false)
  })
})

describe("validateAmplifyConfig", () => {
  const validPoolId = "us-east-1_TestPool123"
  const validClientId = "abc123def456"

  it("returns success with valid configuration", () => {
    const result = validateAmplifyConfig(validPoolId, validClientId)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.config.Cognito.userPoolId).toBe(validPoolId)
      expect(result.config.Cognito.userPoolClientId).toBe(validClientId)
    }
  })

  it("returns error when user pool ID is undefined", () => {
    const result = validateAmplifyConfig(undefined, validClientId)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe(
        "Application configuration error. Contact support."
      )
    }
  })

  it("returns error when user pool ID is null", () => {
    const result = validateAmplifyConfig(null, validClientId)
    expect(result.success).toBe(false)
  })

  it("returns error when user pool ID is empty string", () => {
    const result = validateAmplifyConfig("", validClientId)
    expect(result.success).toBe(false)
  })

  it("returns error when user pool ID is whitespace only", () => {
    const result = validateAmplifyConfig("   ", validClientId)
    expect(result.success).toBe(false)
  })

  it("returns error when client ID is undefined", () => {
    const result = validateAmplifyConfig(validPoolId, undefined)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe(
        "Application configuration error. Contact support."
      )
    }
  })

  it("returns error when client ID is null", () => {
    const result = validateAmplifyConfig(validPoolId, null)
    expect(result.success).toBe(false)
  })

  it("returns error when client ID is empty string", () => {
    const result = validateAmplifyConfig(validPoolId, "")
    expect(result.success).toBe(false)
  })

  it("returns error when user pool ID has invalid format", () => {
    const result = validateAmplifyConfig("invalid-pool-id", validClientId)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe(
        "Application configuration error. Contact support."
      )
    }
  })

  it("returns error when client ID has invalid characters", () => {
    const result = validateAmplifyConfig(validPoolId, "invalid-client!id")
    expect(result.success).toBe(false)
  })

  it("trims whitespace from valid values", () => {
    const result = validateAmplifyConfig(
      `  ${validPoolId}  `,
      `  ${validClientId}  `
    )
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.config.Cognito.userPoolId).toBe(validPoolId)
      expect(result.config.Cognito.userPoolClientId).toBe(validClientId)
    }
  })
})
