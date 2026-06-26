import { createElement } from "react"
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMemoryRouter, RouterProvider, Navigate } from "react-router"
import { AuthProvider } from "@/providers/auth-provider"
import { AuthGuard } from "@/components/auth-guard"
import { AdminLayout } from "@/components/layout/admin-layout"
import { LoginScreen } from "@/features/auth/login-screen"
import { InventoryPage } from "@/features/inventory/inventory-page"
import { HelpPage } from "@/features/help/help-page"

vi.mock("aws-amplify/auth", () => ({
  signIn: vi.fn(),
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
  signOut as amplifySignOut,
  fetchAuthSession,
  getCurrentUser,
} from "aws-amplify/auth"

const mockSignIn = vi.mocked(amplifySignIn)
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

function createTestRouter(initialEntries: string[] = ["/inventory"]) {
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
              {
                path: "help",
                Component: HelpPage,
              },
            ],
          },
        ],
      },
    ],
    { initialEntries }
  )
}

function renderApp(initialEntries: string[] = ["/inventory"]) {
  const router = createTestRouter(initialEntries)
  return render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}

describe("Auth Flow Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("unauthenticated user navigating to a protected route sees the login screen", async () => {
    mockGetCurrentUser.mockRejectedValue(new Error("No user"))

    renderApp(["/inventory"])

    // After auth resolves to unauthenticated, AuthGuard redirects to /login
    // The login screen renders a "Sign in" button and form fields
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /sign in/i })
      ).toBeInTheDocument()
    })

    // Verify it's the login form (has email and password inputs)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it("successful login redirects to admin layout with inventory content", async () => {
    // Start unauthenticated
    mockGetCurrentUser.mockRejectedValue(new Error("No user"))

    renderApp(["/login"])

    // Wait for login screen to render
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /sign in/i })
      ).toBeInTheDocument()
    })

    // Set up signIn to succeed
    mockSignIn.mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: "DONE" },
    })
    mockFetchAuthSession.mockResolvedValue(
      createMockSession({
        email: "admin@example.com",
        name: "Admin User",
        groups: ["admin"],
      }) as Awaited<ReturnType<typeof fetchAuthSession>>
    )

    // Fill in credentials
    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)

    fireEvent.change(emailInput, { target: { value: "admin@example.com" } })
    fireEvent.change(passwordInput, { target: { value: "SecurePassword123!" } })

    // Submit form
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: /sign in/i }))
    })

    // After successful login, user should see the admin layout with inventory heading
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /inventory/i })
      ).toBeInTheDocument()
    })
  })

  it("logout redirects back to login screen", async () => {
    // Start authenticated
    mockGetCurrentUser.mockResolvedValue({
      username: "user-123",
      userId: "abc-123",
    })
    mockFetchAuthSession.mockResolvedValue(
      createMockSession({
        email: "admin@example.com",
        name: "Admin User",
        groups: ["admin"],
      }) as Awaited<ReturnType<typeof fetchAuthSession>>
    )
    mockSignOut.mockResolvedValue(undefined)

    renderApp(["/inventory"])

    // Wait for admin layout to render (inventory heading is an h1)
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /inventory/i })
      ).toBeInTheDocument()
    })

    // Open profile menu (Radix requires pointerDown)
    const profileButton = screen.getByRole("button", {
      name: /open profile menu/i,
    })
    fireEvent.pointerDown(profileButton, {
      button: 0,
      pointerType: "mouse",
    })

    // Wait for dropdown to open
    await waitFor(() => {
      expect(profileButton).toHaveAttribute("aria-expanded", "true")
    })

    // Click logout
    const logoutItem = screen.getByText(/log out/i)
    fireEvent.click(logoutItem)

    // Should redirect to login (the login form shows the Sign in button)
    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    })
  })

  it("token refresh failure redirects to login screen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    // Start authenticated
    mockGetCurrentUser.mockResolvedValue({
      username: "user-123",
      userId: "abc-123",
    })
    mockFetchAuthSession.mockResolvedValueOnce(
      createMockSession({
        email: "admin@example.com",
        name: "Admin User",
        groups: ["admin"],
      }) as Awaited<ReturnType<typeof fetchAuthSession>>
    )

    renderApp(["/inventory"])

    // Wait for admin layout to render
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /inventory/i })
      ).toBeInTheDocument()
    })

    // Simulate token refresh failure on next call
    mockFetchAuthSession.mockRejectedValueOnce(new Error("Token expired"))

    // Advance timer to trigger refresh interval (4 minutes)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60 * 1000)
    })

    // Should redirect to login
    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    })

    vi.useRealTimers()
  })
})
