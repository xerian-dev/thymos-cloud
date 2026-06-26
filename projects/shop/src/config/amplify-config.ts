/**
 * Amplify configuration loaded from environment variables.
 * Validates that required Cognito values are present and well-formed
 * before the app attempts any authentication operations.
 */

export interface AmplifyAuthConfig {
  Cognito: {
    userPoolId: string
    userPoolClientId: string
  }
}

export type ConfigValidationResult =
  | { success: true; config: AmplifyAuthConfig }
  | { success: false; error: string }

/**
 * Regex pattern for a valid Cognito User Pool ID.
 * Format: {region}_{poolId} where region is like "us-east-1" and poolId is alphanumeric.
 */
const USER_POOL_ID_PATTERN = /^[a-z]{2}-[a-z]+-\d+_[A-Za-z0-9]+$/

/**
 * Validates that a User Pool ID matches the expected region_poolId pattern.
 */
export function isValidUserPoolId(value: string): boolean {
  return USER_POOL_ID_PATTERN.test(value)
}

/**
 * Validates that a Client ID is a non-empty alphanumeric string.
 * Cognito client IDs are typically 26 alphanumeric characters.
 */
export function isValidClientId(value: string): boolean {
  return /^[A-Za-z0-9]+$/.test(value) && value.length > 0
}

/**
 * Reads and validates Amplify configuration from Vite environment variables.
 * Returns a discriminated union indicating success (with config) or failure (with error message).
 */
export function getAmplifyConfig(): ConfigValidationResult {
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as
    | string
    | undefined
  const userPoolClientId = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID as
    | string
    | undefined

  if (!userPoolId || userPoolId.trim() === "") {
    return {
      success: false,
      error: "Application configuration error. Contact support.",
    }
  }

  if (!userPoolClientId || userPoolClientId.trim() === "") {
    return {
      success: false,
      error: "Application configuration error. Contact support.",
    }
  }

  if (!isValidUserPoolId(userPoolId.trim())) {
    return {
      success: false,
      error: "Application configuration error. Contact support.",
    }
  }

  if (!isValidClientId(userPoolClientId.trim())) {
    return {
      success: false,
      error: "Application configuration error. Contact support.",
    }
  }

  return {
    success: true,
    config: {
      Cognito: {
        userPoolId: userPoolId.trim(),
        userPoolClientId: userPoolClientId.trim(),
      },
    },
  }
}

/**
 * Pure validation function for testing purposes.
 * Accepts raw values instead of reading from import.meta.env.
 */
export function validateAmplifyConfig(
  userPoolId: string | undefined | null,
  userPoolClientId: string | undefined | null
): ConfigValidationResult {
  if (!userPoolId || userPoolId.trim() === "") {
    return {
      success: false,
      error: "Application configuration error. Contact support.",
    }
  }

  if (!userPoolClientId || userPoolClientId.trim() === "") {
    return {
      success: false,
      error: "Application configuration error. Contact support.",
    }
  }

  if (!isValidUserPoolId(userPoolId.trim())) {
    return {
      success: false,
      error: "Application configuration error. Contact support.",
    }
  }

  if (!isValidClientId(userPoolClientId.trim())) {
    return {
      success: false,
      error: "Application configuration error. Contact support.",
    }
  }

  return {
    success: true,
    config: {
      Cognito: {
        userPoolId: userPoolId.trim(),
        userPoolClientId: userPoolClientId.trim(),
      },
    },
  }
}
