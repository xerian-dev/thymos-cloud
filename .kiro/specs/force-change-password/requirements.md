# Requirements Document

## Introduction

This feature adds handling for the Cognito `NEW_PASSWORD_REQUIRED` challenge to the shop's sign-in flow. When a user with a temporary password signs in, Cognito returns a challenge requiring the user to set a new password. The login card swaps inline to display a "Change Password" form with password strength validation, and upon successful confirmation the user proceeds to `/inventory`.

## Glossary

- **Auth_Provider**: The React context provider (`auth-provider.tsx`) that manages authentication state and exposes sign-in/sign-out actions to the application.
- **Login_Screen**: The login page component (`login-screen.tsx`) that renders the sign-in form and inline change-password form.
- **Change_Password_Form**: The inline form displayed within the login card when a new password is required, containing new password and confirm password fields with a strength indicator.
- **Cognito**: The AWS Cognito identity service accessed via the AWS Amplify v6 `signIn` and `confirmSignIn` APIs.
- **Password_Policy**: The set of rules enforced by Cognito for password validity: minimum 8 characters, at least one uppercase letter, at least one lowercase letter, at least one digit, and at least one special character.
- **Strength_Indicator**: A visual component that displays which Password_Policy rules are satisfied and which are not.

## Requirements

### Requirement 1: Detect NEW_PASSWORD_REQUIRED Challenge

**User Story:** As a user with a temporary password, I want the system to detect that I need to change my password, so that I am presented with the appropriate form.

#### Acceptance Criteria

1. WHEN Cognito returns `nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED'` after a sign-in attempt, THE Auth_Provider SHALL transition its state to a `newPasswordRequired` status.
2. WHEN the Auth_Provider state transitions to `newPasswordRequired`, THE Login_Screen SHALL hide the sign-in form and display the Change_Password_Form inline within the same login card.
3. THE Login_Screen SHALL remain at the same URL (no navigation) when swapping between the sign-in form and the Change_Password_Form.

### Requirement 2: Change Password Form Layout

**User Story:** As a user required to change my password, I want a clear form with password and confirmation fields, so that I can set my new password correctly.

#### Acceptance Criteria

1. THE Change_Password_Form SHALL display a "New password" input field of type password with autocomplete attribute set to `new-password`.
2. THE Change_Password_Form SHALL display a "Confirm password" input field of type password with autocomplete attribute set to `new-password`.
3. THE Change_Password_Form SHALL display a submit button labeled "Change password".
4. THE Change_Password_Form SHALL display the Strength_Indicator between the password fields and the submit button.
5. THE Change_Password_Form SHALL enforce a maximum input length of 128 characters on both password fields.

### Requirement 3: Client-Side Password Validation

**User Story:** As a user, I want to see which password rules I have satisfied in real time, so that I can create a valid password without trial and error.

#### Acceptance Criteria

1. WHILE the user types in the "New password" field, THE Strength_Indicator SHALL update in real time to show the satisfaction status of each Password_Policy rule individually.
2. THE Strength_Indicator SHALL display a distinct visual indicator for each of the five Password_Policy rules: minimum 8 characters, at least one uppercase letter, at least one lowercase letter, at least one digit, and at least one special character.
3. WHEN the user submits the Change_Password_Form and the "New password" value does not satisfy all Password_Policy rules, THE Change_Password_Form SHALL display a validation error and SHALL NOT call the confirmSignIn API.
4. WHEN the user submits the Change_Password_Form and the "Confirm password" value does not match the "New password" value, THE Change_Password_Form SHALL display a "Passwords do not match" error and SHALL NOT call the confirmSignIn API.

### Requirement 4: Confirm Sign-In with New Password

**User Story:** As a user, I want to submit my new password and be signed in automatically, so that I can access the application without an additional login step.

#### Acceptance Criteria

1. WHEN the user submits the Change_Password_Form with a valid new password that passes all Password_Policy rules and the confirm password matches, THE Auth_Provider SHALL call the Amplify `confirmSignIn` API with the new password as the challenge response.
2. WHILE the confirmSignIn API call is in progress, THE Change_Password_Form SHALL disable both input fields and the submit button and display a loading indicator on the submit button.
3. WHEN the confirmSignIn API call succeeds, THE Auth_Provider SHALL fetch the authenticated session, parse the user from the ID token, and transition state to `authenticated`.
4. WHEN the Auth_Provider state transitions to `authenticated` after a successful password change, THE Login_Screen SHALL navigate to `/inventory` with history replacement.

### Requirement 5: Error Handling for Password Change

**User Story:** As a user, I want clear error messages when my new password is rejected, so that I know exactly what to fix.

#### Acceptance Criteria

1. IF the confirmSignIn API returns an error with a message containing a specific policy violation (e.g., "Password must have uppercase characters"), THEN THE Change_Password_Form SHALL display that specific policy violation message to the user.
2. IF the confirmSignIn API returns a network-related error, THEN THE Change_Password_Form SHALL display "Unable to connect. Check your internet connection."
3. IF the confirmSignIn API returns a service-unavailable or throttling error, THEN THE Change_Password_Form SHALL display "Service temporarily unavailable. Please try again."
4. IF the confirmSignIn API returns an unrecognized error, THEN THE Change_Password_Form SHALL display "Something went wrong. Please try again."
5. WHEN an error is displayed on the Change_Password_Form, THE Change_Password_Form SHALL preserve the values in both password fields and re-enable the form for correction.
6. THE Change_Password_Form SHALL NOT display AWS request IDs, stack traces, or internal endpoint URLs in any error message.

### Requirement 6: Accessibility

**User Story:** As a user relying on assistive technology, I want the change-password form to be fully accessible, so that I can complete the password change flow.

#### Acceptance Criteria

1. THE Change_Password_Form SHALL associate each input field with a visible label element using the `for`/`id` attribute pairing.
2. WHEN a validation error is displayed, THE Change_Password_Form SHALL set `aria-invalid="true"` on the corresponding input and link the error message via `aria-describedby`.
3. WHEN an error message appears, THE Change_Password_Form SHALL mark the error text with `role="alert"` so assistive technologies announce the error.
4. THE Change_Password_Form SHALL support full keyboard navigation: Tab between fields and Enter to submit.
