# Implementation Plan: Shop Monorepo

## Overview

This plan implements a monorepo containing a Terraform infrastructure project (AWS Cognito) and a React shop frontend that authenticates against the deployed User Pool. Tasks are ordered so that foundational infrastructure and project setup come first, followed by auth integration, UI components, and finally wiring everything together.

## Tasks

- [x] 1. Set up Terraform infrastructure project
  - [x] 1.1 Create Terraform project structure with Cognito resources
    - Create `infrastructure/` directory with `main.tf`, `variables.tf`, and `outputs.tf`
    - Define `aws_cognito_user_pool` with email alias, self-signup disabled
    - Define `aws_cognito_user_pool_client` with no secret and USER_SRP_AUTH flow
    - Define `aws_cognito_user_pool_group` for "admin" group
    - Define variables for `environment` and `project_name`
    - Define outputs for `cognito_user_pool_id`, `cognito_user_pool_client_id`, and `aws_region`
    - Add required provider version constraints
    - _Requirements: 1.1, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

  - [x] 1.2 Validate Terraform configuration
    - Run `terraform fmt` and `terraform validate` to ensure correctness
    - Verify outputs match expected names and descriptions
    - _Requirements: 1.4, 2.4_

- [x] 2. Initialize shop project with shadcn/ui
  - [x] 2.1 Initialize the shop project using shadcn preset
    - Run `npx shadcn@latest init --preset b2BVUGgwC --template vite --monorepo` in `projects/shop/`
    - Verify `vite.config.ts` and `components.json` are created
    - Ensure TypeScript strict mode is enabled in `tsconfig.json`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 2.2 Install and configure project dependencies
    - Add `aws-amplify` (exact version) for Cognito integration
    - Add `react-router` (exact version, v7) for routing
    - Add dev dependencies: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `fast-check`, `msw`
    - Configure Vitest in `vite.config.ts` with jsdom environment
    - Run `npm audit` and resolve any high/critical vulnerabilities
    - _Requirements: 9.1, 9.2_

- [x] 3. Implement authentication module
  - [x] 3.1 Create Amplify configuration and validation
    - Create `src/config/amplify-config.ts` that reads `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_USER_POOL_CLIENT_ID`, and `VITE_AWS_REGION` from environment
    - Implement validation that checks for missing/empty/malformed values (pool ID must match region_poolId pattern)
    - Display configuration error screen when validation fails
    - Create `.env.example` documenting required variables
    - _Requirements: 9.1, 9.5_

  - [x] 3.2 Write property test for configuration validation (Property 6)
    - **Property 6: Configuration validation**
    - Generate empty, malformed, and missing pool IDs and client IDs
    - Verify error screen shown and no auth operations attempted for all invalid configs
    - **Validates: Requirements 9.5**

  - [x] 3.3 Implement AuthProvider context
    - Create `src/providers/auth-provider.tsx` with `AuthState`, `AuthUser`, and `AuthContextValue` interfaces
    - Implement `signIn` using Amplify `signIn` API with USER_SRP_AUTH
    - Implement `signOut` using Amplify `signOut` API, clearing local tokens on failure
    - Parse `cognito:groups` from ID token to populate `AuthUser.groups`
    - Handle token refresh (Amplify handles this automatically; configure 5-minute pre-expiry refresh)
    - Redirect to login on token refresh failure
    - _Requirements: 5.5, 8.6, 8.7, 9.2, 9.3, 9.4, 9.6_

  - [x] 3.4 Write property test for auth error message safety (Property 3)
    - **Property 3: Auth error message safety**
    - Generate various Cognito error types (NotAuthorizedException, NetworkError, InternalErrorException, etc.)
    - Verify displayed messages never contain AWS request IDs, stack traces, internal URLs, or Cognito error codes
    - Verify email field is preserved after error
    - **Validates: Requirements 5.8**

  - [x] 3.5 Implement AuthGuard route component
    - Create `src/components/auth-guard.tsx` that checks auth status
    - Redirect unauthenticated users to `/login`
    - Show loading state while auth status resolves
    - Render child routes when authenticated
    - _Requirements: 5.1, 6.1, 6.6_

- [x] 4. Checkpoint - Ensure auth module tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement login screen
  - [x] 5.1 Create LoginScreen component
    - Create `src/features/auth/login-screen.tsx` with email and password fields
    - Enforce max length: email 254 chars, password 128 chars
    - Mask password input
    - Add submit button
    - Do NOT include signup link or registration option
    - Use shadcn/ui form components for accessible, styled inputs
    - _Requirements: 5.2, 5.3, 5.9_

  - [x] 5.2 Implement login form validation and submission
    - Validate empty/whitespace-only fields on submit — show per-field error messages
    - Call `AuthProvider.signIn` on valid submission
    - Disable submit button and show loading indicator while auth in progress
    - On success, redirect to `/inventory`
    - On failure, display user-friendly error message, preserve email, clear password
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 5.3 Write property test for input length validation (Property 1)
    - **Property 1: Input length validation**
    - Generate random strings of length 0–500 for email and password
    - Verify fields enforce max length (254 for email, 128 for password)
    - **Validates: Requirements 5.2**

  - [x] 5.4 Write property test for empty field submission prevention (Property 2)
    - **Property 2: Empty field submission prevention**
    - Generate combinations of empty/whitespace-only strings for email and password
    - Verify validation error displayed for each empty field and no auth request triggered
    - **Validates: Requirements 5.4**

  - [x] 5.5 Write unit tests for LoginScreen
    - Test submit button exists and is accessible
    - Test loading state disables button
    - Test no signup link is rendered
    - Test error message displays on failed auth
    - Test email preserved after error
    - _Requirements: 5.3, 5.6, 5.8, 5.9_

- [x] 6. Implement admin console layout
  - [x] 6.1 Create AdminLayout shell component
    - Create `src/components/layout/admin-layout.tsx` with sidebar, header, and content outlet areas
    - Use CSS grid or flexbox for layout structure
    - Ensure responsive behavior: no horizontal overflow at any breakpoint
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 6.2 Implement NavigationMenu component
    - Create `src/components/layout/navigation-menu.tsx`
    - Display "Inventory" and "Help" entries with icons
    - Expanded sidebar at ≥1024px viewport
    - Collapsed/hidden below 1024px with toggle button
    - Highlight active navigation entry
    - Create `src/config/navigation.ts` with navigation item configuration
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 6.3 Implement ProfileMenu component
    - Create `src/components/layout/profile-menu.tsx`
    - Position in top-right of header
    - Display user name (or email fallback) as trigger
    - Show roles from `cognito:groups` when opened
    - Show "no roles assigned" when groups array is empty
    - Include logout button that calls `AuthProvider.signOut`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 6.4 Write property test for profile display name resolution (Property 4)
    - **Property 4: Profile display name resolution**
    - Generate users with and without name attribute (empty, whitespace, valid names)
    - Verify name displayed when present and non-empty, email displayed otherwise, never empty
    - **Validates: Requirements 8.2**

  - [x] 6.5 Write property test for roles display completeness (Property 5)
    - **Property 5: Roles display completeness**
    - Generate arrays of 0–10 random group name strings
    - Verify all group names rendered when present, "no roles assigned" shown when empty
    - **Validates: Requirements 8.3, 8.4**

  - [x] 6.6 Write unit tests for layout components
    - Test AdminLayout renders sidebar, header, and content area
    - Test NavigationMenu renders Inventory and Help entries
    - Test NavigationMenu toggle behavior at narrow viewport
    - Test ProfileMenu renders logout button
    - Test AuthGuard redirects unauthenticated users
    - _Requirements: 6.2, 6.3, 7.1, 7.2, 7.4, 8.5_

- [x] 7. Checkpoint - Ensure all component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Wire routing and integrate all components
  - [x] 8.1 Set up React Router with route configuration
    - Create `src/config/routes.ts` defining public (`/login`) and protected (`/inventory`, `/help`) routes
    - Configure `RouterProvider` in `src/app.tsx`
    - Wire `AuthGuard` as layout route for protected paths
    - Wire `LoginScreen` for `/login` route
    - Set default redirect from `/` to `/inventory`
    - _Requirements: 5.1, 5.7, 6.1, 6.6, 7.5_

  - [x] 8.2 Create App root component with Amplify initialization
    - Create `src/app.tsx` that calls `Amplify.configure()` with validated config
    - Wrap app in `AuthProvider`
    - Add top-level `ErrorBoundary`
    - Render `RouterProvider`
    - _Requirements: 9.1, 9.2, 9.5_

  - [x] 8.3 Create placeholder pages for Inventory and Help
    - Create `src/features/inventory/inventory-page.tsx` with placeholder content
    - Create `src/features/help/help-page.tsx` with placeholder content
    - Register in route configuration
    - _Requirements: 7.1, 7.2, 7.5_

  - [x] 8.4 Write integration tests for auth flow
    - Test unauthenticated user sees login screen
    - Test successful login redirects to admin layout
    - Test logout redirects back to login
    - Test token refresh failure redirects to login
    - Use MSW to mock Cognito API responses
    - _Requirements: 5.1, 5.7, 8.6, 9.3_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- MSW is used to mock Cognito APIs so tests run without real AWS resources
- All dependencies must use exact versions per dependency-management steering
- Run `npm audit` after installing dependencies

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2"] },
    { "id": 2, "tasks": ["3.1", "3.3"] },
    { "id": 3, "tasks": ["3.2", "3.4", "3.5"] },
    { "id": 4, "tasks": ["5.1", "6.1"] },
    { "id": 5, "tasks": ["5.2", "6.2", "6.3"] },
    { "id": 6, "tasks": ["5.3", "5.4", "5.5", "6.4", "6.5", "6.6"] },
    { "id": 7, "tasks": ["8.1", "8.2", "8.3"] },
    { "id": 8, "tasks": ["8.4"] }
  ]
}
```
