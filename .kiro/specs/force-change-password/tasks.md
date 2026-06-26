# Implementation Plan: Force Change Password

## Overview

Extend the existing authentication flow to handle Cognito's `NEW_PASSWORD_REQUIRED` challenge. Implementation adds a password validation utility, password strength indicator component, change password form, and modifies the auth provider and login screen to support the new flow. Uses TypeScript with React, tested via Vitest and fast-check.

## Tasks

- [x] 1. Create password validation utility
  - [x] 1.1 Implement password validation module
    - Create `projects/shop/apps/web/src/features/auth/password-validation.ts`
    - Define `PasswordRule` interface and `PasswordValidationResult` interface
    - Export `PASSWORD_RULES` array with five rules: min-length (≥8), uppercase, lowercase, digit, special character
    - Implement `validatePassword(password: string): PasswordValidationResult` pure function
    - _Requirements: 3.1, 3.2_

  - [x] 1.2 Write property test for password rule validation correctness
    - Create `projects/shop/apps/web/src/features/auth/password-validation.property.test.ts`
    - **Property 1: Password rule validation correctness**
    - For any arbitrary string, verify `validatePassword` correctly reports each rule as satisfied iff the string contains the corresponding character class, and `allSatisfied` is true iff all five rules are satisfied
    - Use fast-check `fc.string()` and `fc.stringOf()` with targeted character arbitraries
    - **Validates: Requirements 3.1, 3.2**

- [x] 2. Create password strength indicator component
  - [x] 2.1 Implement PasswordStrengthIndicator component
    - Create `projects/shop/apps/web/src/features/auth/password-strength-indicator.tsx`
    - Accept `password: string` prop
    - Call `validatePassword()` and render a list of five rule items with check/X icons and labels
    - Style satisfied rules with a success indicator and unsatisfied with a neutral/error indicator
    - _Requirements: 3.1, 3.2_

  - [x] 2.2 Write unit tests for PasswordStrengthIndicator
    - Create `projects/shop/apps/web/src/features/auth/password-strength-indicator.test.tsx`
    - Test that all rules show unsatisfied for empty string
    - Test that specific rules show satisfied when corresponding characters are present
    - Test that all rules show satisfied for a fully valid password
    - _Requirements: 3.1, 3.2_

- [x] 3. Create change password form component
  - [x] 3.1 Implement ChangePasswordForm component
    - Create `projects/shop/apps/web/src/features/auth/change-password-form.tsx`
    - Accept props: `onSubmit: (newPassword: string) => void`, `isLoading: boolean`, `error: string | null`
    - Render "New password" input (type=password, autocomplete=new-password, maxLength=128)
    - Render "Confirm password" input (type=password, autocomplete=new-password, maxLength=128)
    - Render PasswordStrengthIndicator between inputs and submit button
    - Render submit button labeled "Change password"
    - On submit: validate all policy rules satisfied and passwords match; show inline errors if not; only call `onSubmit` if valid
    - Display "Passwords do not match" error when confirm ≠ new password
    - When `isLoading`: disable inputs + button, show loading text on button
    - When `error` is non-null: display error with `role="alert"`, preserve field values, re-enable form
    - Accessibility: label/id pairing, aria-invalid, aria-describedby on errored inputs, keyboard navigation support
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.3, 3.4, 4.2, 5.5, 6.1, 6.2, 6.3, 6.4_

  - [x] 3.2 Write unit tests for ChangePasswordForm
    - Create `projects/shop/apps/web/src/features/auth/change-password-form.test.tsx`
    - Test that form renders all required fields and submit button
    - Test that submitting with invalid password shows validation error and does not call onSubmit
    - Test that submitting with mismatched passwords shows "Passwords do not match"
    - Test that submitting with valid matching passwords calls onSubmit with the password
    - Test loading state disables inputs and button
    - Test error prop is displayed with role="alert"
    - Test accessibility attributes (aria-invalid, aria-describedby)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.3, 3.4, 5.5, 6.1, 6.2, 6.3_

  - [x] 3.3 Write property test for invalid password submission prevention
    - **Property 2: Invalid password submission prevention**
    - For any string violating at least one password policy rule, verify submitting the form produces a validation error and does NOT invoke `onSubmit`
    - Use fast-check to generate strings missing at least one character class
    - **Validates: Requirements 3.3**

  - [x] 3.4 Write property test for password mismatch rejection
    - **Property 3: Password mismatch rejection**
    - For any two distinct strings as new password and confirm password, verify submitting displays "Passwords do not match" and does NOT invoke `onSubmit`
    - Use fast-check to generate pairs of distinct strings
    - **Validates: Requirements 3.4**

  - [x] 3.5 Write property test for valid password submission
    - **Property 4: Valid password submission reaches API**
    - For any string satisfying all five password policy rules, when submitted with a matching confirm password, verify the form calls `onSubmit` with that exact string
    - Use fast-check with a custom arbitrary that generates valid passwords
    - **Validates: Requirements 4.1**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Extend auth provider with confirmNewPassword
  - [x] 5.1 Add `newPasswordRequired` status to AuthState and `confirmNewPassword` to AuthContextValue
    - Modify `projects/shop/apps/web/src/providers/auth-provider.tsx`
    - Extend `AuthState.status` union with `"newPasswordRequired"`
    - Add `confirmNewPassword: (newPassword: string) => Promise<void>` to `AuthContextValue`
    - _Requirements: 1.1_

  - [x] 5.2 Update signIn to detect NEW_PASSWORD_REQUIRED challenge
    - In the `signIn` callback, after `amplifySignIn()`, inspect `result.nextStep.signInStep`
    - If `"CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"`, transition state to `{ status: "newPasswordRequired", user: null, error: null }`
    - Otherwise proceed with existing flow (fetch session, parse token, authenticate)
    - _Requirements: 1.1_

  - [x] 5.3 Implement confirmNewPassword method
    - Add `confirmSignIn` to the Amplify imports
    - Implement `confirmNewPassword` using `confirmSignIn({ challengeResponse: newPassword })`
    - On success: fetch session, parse ID token, transition to authenticated, start refresh timer
    - On failure: map error via `mapConfirmSignInError` and transition to error state
    - _Requirements: 4.1, 4.3_

  - [x] 5.4 Implement mapConfirmSignInError and sanitizeErrorMessage functions
    - Add `mapConfirmSignInError(error: unknown): string` — handles InvalidPasswordException, InvalidParameterException, NetworkError, ServiceUnavailableException, InternalErrorException, TooManyRequestsException
    - Add `sanitizeErrorMessage(message: string): string` — strips AWS request IDs (UUID pattern), URLs, and stack trace lines from error messages
    - Fallback to "Something went wrong. Please try again." for unrecognized errors or empty sanitized output
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

  - [x] 5.5 Write property test for error message sanitization
    - Create `projects/shop/apps/web/src/providers/auth-provider.property.test.ts`
    - **Property 5: Error message sanitization**
    - For any error message containing AWS request IDs, URLs, or stack traces, verify `sanitizeErrorMessage` returns a string containing none of those patterns
    - Use fast-check to generate strings with embedded UUIDs, URLs, and "at ..." lines
    - **Validates: Requirements 5.6**

- [x] 6. Extend login screen to render ChangePasswordForm
  - [x] 6.1 Update LoginScreen to handle newPasswordRequired state
    - Modify `projects/shop/apps/web/src/features/auth/login-screen.tsx`
    - Destructure `confirmNewPassword` from `useAuth()`
    - When `state.status === "newPasswordRequired"`, render `<ChangePasswordForm>` instead of the sign-in form within the same card
    - Pass `confirmNewPassword` as `onSubmit` prop
    - Derive `isLoading` from `state.status === "loading"` when submitting password change
    - Pass `state.error` as `error` prop
    - Keep URL unchanged during form swap (no navigation)
    - On `state.status === "authenticated"`, navigate to `/inventory` with history replacement (existing logic covers this)
    - _Requirements: 1.2, 1.3, 4.2, 4.4, 5.5_

  - [x] 6.2 Write integration tests for the full flow
    - Create or extend `projects/shop/apps/web/src/__tests__/force-change-password.integration.test.tsx`
    - Mock Amplify signIn to return NEW_PASSWORD_REQUIRED challenge
    - Mock Amplify confirmSignIn to succeed
    - Test: sign in → challenge detected → change password form shown → submit new password → authenticated → navigate to /inventory
    - Test: sign in → challenge detected → submit → API error → error displayed → form re-enabled
    - _Requirements: 1.1, 1.2, 4.1, 4.3, 4.4, 5.1, 5.5_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation language is TypeScript throughout, matching the existing codebase
- Testing uses Vitest + fast-check + @testing-library/react per project conventions

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "5.2", "5.4"] },
    { "id": 3, "tasks": ["3.1", "5.3"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "3.5", "5.5"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["6.2"] }
  ]
}
```
