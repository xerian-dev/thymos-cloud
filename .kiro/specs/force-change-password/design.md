# Design Document: Force Change Password

## Overview

This design extends the existing authentication flow to handle Cognito's `NEW_PASSWORD_REQUIRED` challenge. When a user signs in with a temporary password, the login card swaps inline to a password-change form with real-time strength validation. On success, the user is authenticated and navigated to `/inventory`.

The implementation touches two existing files (auth-provider, login-screen) and introduces two new modules (change-password form component and password validation utility).

## Architecture

### Component Hierarchy

```
LoginScreen
├── Sign-In Form (existing, shown when status ≠ newPasswordRequired)
└── ChangePasswordForm (new, shown when status === newPasswordRequired)
    ├── New Password Input
    ├── Confirm Password Input
    ├── PasswordStrengthIndicator
    └── Submit Button
```

### State Machine Extension

The `AuthState` discriminated union gains a new status variant:

```typescript
export interface AuthState {
  status: "loading" | "authenticated" | "unauthenticated" | "error" | "newPasswordRequired"
  user: AuthUser | null
  error: string | null
}
```

The `AuthContextValue` gains a `confirmNewPassword` action:

```typescript
export interface AuthContextValue {
  state: AuthState
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  confirmNewPassword: (newPassword: string) => Promise<void>
}
```

### Data Flow

```
User submits login
  → amplifySignIn()
  → response.nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"
  → setState({ status: "newPasswordRequired" })
  → LoginScreen renders ChangePasswordForm
  → User fills new password + confirm
  → Client-side validation (password policy + match)
  → confirmNewPassword(newPassword)
  → amplifyConfirmSignIn({ challengeResponse: newPassword })
  → fetchAuthSession() → parse ID token
  → setState({ status: "authenticated", user })
  → navigate("/inventory", { replace: true })
```

## Components and Interfaces

### 1. Password Validation Utility

**File:** `projects/shop/apps/web/src/features/auth/password-validation.ts`

A pure function module with no side effects, suitable for property-based testing.

```typescript
export interface PasswordRule {
  id: string
  label: string
  test: (password: string) => boolean
}

export interface PasswordValidationResult {
  rules: Array<{ id: string; label: string; satisfied: boolean }>
  allSatisfied: boolean
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "min-length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "uppercase", label: "At least one uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "lowercase", label: "At least one lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "digit", label: "At least one digit", test: (p) => /\d/.test(p) },
  { id: "special", label: "At least one special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
] as const

export function validatePassword(password: string): PasswordValidationResult {
  const rules = PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    satisfied: rule.test(password),
  }))
  return { rules, allSatisfied: rules.every((r) => r.satisfied) }
}
```

### 2. Password Strength Indicator Component

**File:** `projects/shop/apps/web/src/features/auth/password-strength-indicator.tsx`

```typescript
export interface PasswordStrengthIndicatorProps {
  password: string
}

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps): React.ReactNode
```

Renders a list of 5 rule items. Each item shows a check or X icon with the rule label. Uses `validatePassword()` to derive state from the current password string. Updated on every keystroke via the controlled `password` prop.

### 3. Change Password Form Component

**File:** `projects/shop/apps/web/src/features/auth/change-password-form.tsx`

```typescript
export interface ChangePasswordFormProps {
  onSubmit: (newPassword: string) => void
  isLoading: boolean
  error: string | null
}

export function ChangePasswordForm({ onSubmit, isLoading, error }: ChangePasswordFormProps): React.ReactNode
```

Responsibilities:

- Renders "New password" and "Confirm password" inputs (type=password, autocomplete=new-password, maxLength=128)
- Renders `PasswordStrengthIndicator` between inputs and submit button
- On submit: validates password policy (all rules satisfied) and match; if invalid, shows inline error and does NOT call `onSubmit`
- When `isLoading` is true: disables inputs + button, shows spinner on button
- When `error` is non-null: displays error with `role="alert"`, preserves field values, re-enables form
- Accessibility: label/id pairing, aria-invalid, aria-describedby on errored inputs

### 4. Auth Provider Extension

**File:** `projects/shop/apps/web/src/providers/auth-provider.tsx` (modified)

Changes to `signIn`:

- After `amplifySignIn()`, inspect `result.nextStep.signInStep`
- If `"CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"`, transition state to `{ status: "newPasswordRequired" }`
- Otherwise proceed with existing flow (fetch session, parse token, authenticate)

New `confirmNewPassword` method:

```typescript
const confirmNewPassword = useCallback(async (newPassword: string): Promise<void> => {
  setState((prev) => ({ ...prev, status: "loading", error: null }))
  try {
    await confirmSignIn({ challengeResponse: newPassword })
    const session = await fetchAuthSession()
    const idToken = session.tokens?.idToken
    if (!idToken) {
      setState({ status: "error", user: null, error: "Something went wrong. Please try again." })
      return
    }
    const user = parseUserFromIdToken(idToken)
    setState({ status: "authenticated", user, error: null })
    startRefreshTimer()
  } catch (error: unknown) {
    const message = mapConfirmSignInError(error)
    setState({ status: "error", user: null, error: message })
  }
}, [startRefreshTimer])
```

### 5. Login Screen Extension

**File:** `projects/shop/apps/web/src/features/auth/login-screen.tsx` (modified)

Changes:

- Destructure `confirmNewPassword` from `useAuth()`
- When `state.status === "newPasswordRequired"`, render `<ChangePasswordForm>` instead of the sign-in form
- Pass `confirmNewPassword` as `onSubmit`, derive `isLoading` and `error` from auth state
- On `state.status === "authenticated"` (whether from login or password change), navigate to `/inventory`

## Error Handling

### Error Mapping for confirmSignIn

**Function:** `mapConfirmSignInError` in `auth-provider.tsx`

```typescript
export function mapConfirmSignInError(error: unknown): string {
  if (error instanceof Error) {
    // Policy violation — pass through Cognito's message (e.g., "Password must have uppercase characters")
    if (error.name === "InvalidPasswordException" || error.name === "InvalidParameterException") {
      // Strip any request IDs or URLs before returning
      return sanitizeErrorMessage(error.message)
    }

    if (error.name === "NetworkError" || error.message.includes("network")) {
      return "Unable to connect. Check your internet connection."
    }

    if (
      error.name === "ServiceUnavailableException" ||
      error.name === "InternalErrorException" ||
      error.name === "TooManyRequestsException"
    ) {
      return "Service temporarily unavailable. Please try again."
    }
  }

  return "Something went wrong. Please try again."
}
```

### Error Sanitization

**Function:** `sanitizeErrorMessage` in `auth-provider.tsx`

Strips AWS request IDs (pattern: `/[0-9a-f]{8}-[0-9a-f]{4}-...-[0-9a-f]{12}/`), URLs (pattern: `https?://...`), and anything resembling a stack trace (lines starting with `at`) from error messages before displaying them to users.

```typescript
export function sanitizeErrorMessage(message: string): string {
  let sanitized = message
  // Remove AWS request IDs (UUID pattern)
  sanitized = sanitized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
  // Remove URLs
  sanitized = sanitized.replace(/https?:\/\/[^\s]+/gi, "")
  // Remove stack trace lines
  sanitized = sanitized.replace(/\n?\s*at\s+.*/g, "")
  // Clean up extra whitespace
  sanitized = sanitized.replace(/\s{2,}/g, " ").trim()
  return sanitized || "Something went wrong. Please try again."
}
```

## Data Models

### AuthState (extended)

```typescript
export interface AuthState {
  status: "loading" | "authenticated" | "unauthenticated" | "error" | "newPasswordRequired"
  user: AuthUser | null
  error: string | null
}
```

### PasswordValidationResult

```typescript
export interface PasswordValidationResult {
  rules: Array<{ id: string; label: string; satisfied: boolean }>
  allSatisfied: boolean
}
```

### PasswordRule

```typescript
export interface PasswordRule {
  id: string
  label: string
  test: (password: string) => boolean
}
```

## File Structure

```
projects/shop/apps/web/src/
├── features/auth/
│   ├── login-screen.tsx              (modified)
│   ├── change-password-form.tsx      (new)
│   ├── password-strength-indicator.tsx (new)
│   ├── password-validation.ts        (new)
│   ├── password-validation.property.test.ts (new)
│   └── change-password-form.test.tsx (new)
├── providers/
│   └── auth-provider.tsx             (modified)
```

## Testing Strategy

- **Unit tests**: Verify specific rendering behavior, accessibility attributes, error message mapping, loading states, and navigation after successful auth.
- **Property tests**: Validate universal properties of the password validation function, form submission gating logic, and error sanitization across randomly generated inputs using `fast-check`.
- **Integration tests**: Verify the full sign-in → challenge → change password → authenticated flow with mocked Amplify APIs.

Test files follow existing project conventions:

- `*.test.tsx` for example-based unit tests
- `*.property.test.ts(x)` for property-based tests

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Password rule validation correctness

*For any* arbitrary string, the `validatePassword` function SHALL correctly report each of the five password rules as satisfied if and only if the string contains the corresponding character class (length ≥ 8, has uppercase, has lowercase, has digit, has special character), and `allSatisfied` SHALL be true if and only if all five individual rules are satisfied.

**Validates: Requirements 3.1, 3.2**

### Property 2: Invalid password submission prevention

*For any* string that violates at least one password policy rule, submitting the Change_Password_Form SHALL produce a validation error and SHALL NOT invoke the `confirmSignIn` API.

**Validates: Requirements 3.3**

### Property 3: Password mismatch rejection

*For any* two distinct strings used as "New password" and "Confirm password", submitting the Change_Password_Form SHALL display a "Passwords do not match" error and SHALL NOT invoke the `confirmSignIn` API.

**Validates: Requirements 3.4**

### Property 4: Valid password submission reaches API

*For any* string that satisfies all five password policy rules, when submitted with a matching confirm password, the form SHALL call `confirmSignIn` with that exact password string as the challenge response.

**Validates: Requirements 4.1**

### Property 5: Error message sanitization

*For any* error object whose message contains AWS request IDs, URLs, or stack traces, the `sanitizeErrorMessage` function SHALL return a string that contains none of those internal details.

**Validates: Requirements 5.6**
