import { createElement } from "react"
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMemoryRouter, RouterProvider, Navigate } from "react-router"
import { AuthProvider } from "@/providers/auth-provider"
import { AuthGuard } from "@/components/auth-guard"
import { AdminLayout } from "@/components/layout/admin-layout"
import { LoginScreen } from "@/features/auth/login-screen"
import { InventoryPage } from "@/features/inventory/inventory-page"

vi.mock("aws-amplify/auth", () => ({
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
  getCurrentUser: vi.fn(),
}))

vi.mock("aws-amplify", () => ({
  Amplify: {
    configure: vi.fn(),
  },
}))

import {
  signIn as amplifySignIn,
  confirmSignIn as amplifyConfirmSignIn,
  signOut as amplifySignOut,
  fetchAuthSession,
  getCurrentUser,
} from "aws-amplify/auth"

const mockSignIn = vi.mocked(amplifySignIn)
const mockConfirmSignIn = vi.mocked(amplifyConfirmSignIn)
const mockSignOut = vi.mocked(amplifySignOut)
const mockFetchAuthSession = vi.mocked(fetchAuthSession)
const mockGetCurrentUser = vi.mocked(getCurrentUser)

function createMockSession(overrides?: {
  email?: string
  name?: string
  groups?: string[]
}) {
  return {
    tokens: {
      idToken: {
        payload: {
          email: overrides?.email ?? "user@example.com",
          name: overrides?.name,
          "cognito:groups": overrides?.groups ?? [],
          sub: "abc-123",
          email_verified: true,
          "cognito:username": "user-123",
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        toString: () => "mock-id-token",
      },
      accessToken: {
        payload: {},
        toString: () => "mock-access-token",
      },
    },
  }
}

function createTestRouter(initialEntries: string[] = ["/login"]) {
  return createMemoryRouter(
    [
      {
        path: "/login",
        Component: LoginScreen,
      },
      {
        Component: AuthGuard,
        children: [
          {
            Component: AdminLayout,
            children: [
              {
                index: true,
                element: createElement(Navigate, {
                  to: "/inventory",
                  replace: true,
                }),
              },
              {
                path: "inventory",
                Component: InventoryPage,
              },
            ],
          },
        ],
      },
    ],
    { initialEntries }
  )
}

function renderApp(initialEntries: string[] = ["/login"]) {
  const router = createTestRouter(initialEntries)
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}

describe("Force Change Password Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: user is not authenticated (on login page)
    mockGetCurrentUser.mockRejectedValue(new Error("No user"))
  })

  it("sign in → NEW_PASSWORD_REQUIRED challenge → change password form → submit → authenticated → navigate to /inventory", async () => {
    renderApp(["/login"])

    // Wait for login screen to render
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /sign in/i })
      ).toBeInTheDocument()
    })

    // Mock signIn to return NEW_PASSWORD_REQUIRED challenge
    mockSignIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: {
        signInStep: "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED",
      },
    } as Awaited<ReturnType<typeof amplifySignIn>>)

    // Fill in login credentials
    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)

    fireEvent.change(emailInput, { target: { value: "user@example.com" } })
    fireEvent.change(passwordInput, { target: { value: "TempPass123!" } })

    // Submit login form
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /sign in/i }))
    })

    // Change password form should now be visible with "Change your password" title
    await waitFor(() => {
      expect(screen.getByText(/change your password/i)).toBeInTheDocument()
    })

    // Verify the change password form fields are present
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /change password/i })
    ).toBeInTheDocument()

    // Mock confirmSignIn to succeed
    mockConfirmSignIn.mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: "DONE" },
    } as Awaited<ReturnType<typeof amplifyConfirmSignIn>>)

    // Mock fetchAuthSession to return a valid session
    mockFetchAuthSession.mockResolvedValue(
      createMockSession({
        email: "user@example.com",
        name: "Test User",
        groups: ["admin"],
      }) as Awaited<ReturnType<typeof fetchAuthSession>>
    )

    // Fill in the new password form with a valid password
    const newPasswordInput = screen.getByLabelText(/new password/i)
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

    fireEvent.change(newPasswordInput, {
      target: { value: "NewSecure1!" },
    })
    fireEvent.change(confirmPasswordInput, {
      target: { value: "NewSecure1!" },
    })

    // Submit the change password form
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /change password/i }))
    })

    // After successful password change, user should be navigated to /inventory
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /inventory/i })
      ).toBeInTheDocument()
    })

    // Verify confirmSignIn was called with the new password
    expect(mockConfirmSignIn).toHaveBeenCalledWith({
      challengeResponse: "NewSecure1!",
    })
  })

  it("sign in → NEW_PASSWORD_REQUIRED challenge → submit → API error → error displayed → form re-enabled", async () => {
    renderApp(["/login"])

    // Wait for login screen to render
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /sign in/i })
      ).toBeInTheDocument()
    })

    // Mock signIn to return NEW_PASSWORD_REQUIRED challenge
    mockSignIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: {
        signInStep: "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED",
      },
    } as Awaited<ReturnType<typeof amplifySignIn>>)

    // Fill in login credentials and submit
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "TempPass123!" },
    })

    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /sign in/i }))
    })

    // Wait for change password form
    await waitFor(() => {
      expect(screen.getByText(/change your password/i)).toBeInTheDocument()
    })

    // Mock confirmSignIn to throw an InvalidPasswordException
    const invalidPasswordError = new Error(
      "Password must have uppercase characters"
    )
    invalidPasswordError.name = "InvalidPasswordException"
    mockConfirmSignIn.mockRejectedValue(invalidPasswordError)

    // Fill in a valid password (passes client-side validation)
    const newPasswordInput = screen.getByLabelText(/new password/i)
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

    fireEvent.change(newPasswordInput, {
      target: { value: "NewSecure1!" },
    })
    fireEvent.change(confirmPasswordInput, {
      target: { value: "NewSecure1!" },
    })

    // Submit the change password form
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /change password/i }))
    })

    // Error message should be displayed with role="alert"
    await waitFor(() => {
      const alert = screen.getByRole("alert")
      expect(alert).toHaveTextContent("Password must have uppercase characters")
    })

    // Form should remain enabled for correction
    expect(screen.getByLabelText(/new password/i)).not.toBeDisabled()
    expect(screen.getByLabelText(/confirm password/i)).not.toBeDisabled()
    expect(
      screen.getByRole("button", { name: /change password/i })
    ).not.toBeDisabled()
  })
})
