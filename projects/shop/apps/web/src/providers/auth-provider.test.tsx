import { render, screen, act, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { AuthProvider, useAuth } from "./auth-provider"

vi.mock("aws-amplify/auth", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
  getCurrentUser: vi.fn(),
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

function TestConsumer(): React.ReactNode {
  const { state, signIn, signOut } = useAuth()
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      <span data-testid="email">{state.user?.email ?? ""}</span>
      <span data-testid="name">{state.user?.name ?? ""}</span>
      <span data-testid="groups">{state.user?.groups.join(",") ?? ""}</span>
      <span data-testid="error">{state.error ?? ""}</span>
      <button
        onClick={() => void signIn("test@example.com", "password123")}
        data-testid="sign-in"
      >
        Sign In
      </button>
      <button onClick={() => void signOut()} data-testid="sign-out">
        Sign Out
      </button>
    </div>
  )
}

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

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts in loading state and transitions to unauthenticated when no session exists", async () => {
    mockGetCurrentUser.mockRejectedValue(new Error("No user"))

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    expect(screen.getByTestId("status").textContent).toBe("loading")

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("unauthenticated")
    })
  })

  it("transitions to authenticated when a valid session exists", async () => {
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

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("authenticated")
    })

    expect(screen.getByTestId("email").textContent).toBe("admin@example.com")
    expect(screen.getByTestId("name").textContent).toBe("Admin User")
    expect(screen.getByTestId("groups").textContent).toBe("admin")
  })

  it("parses cognito:groups from ID token", async () => {
    mockGetCurrentUser.mockResolvedValue({
      username: "user-123",
      userId: "abc-123",
    })
    mockFetchAuthSession.mockResolvedValue(
      createMockSession({
        email: "user@example.com",
        groups: ["admin", "editor", "viewer"],
      }) as Awaited<ReturnType<typeof fetchAuthSession>>
    )

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("groups").textContent).toBe(
        "admin,editor,viewer"
      )
    })
  })

  it("handles empty groups gracefully", async () => {
    mockGetCurrentUser.mockResolvedValue({
      username: "user-123",
      userId: "abc-123",
    })
    mockFetchAuthSession.mockResolvedValue(
      createMockSession({
        email: "user@example.com",
        groups: undefined,
      }) as Awaited<ReturnType<typeof fetchAuthSession>>
    )

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("authenticated")
    })

    expect(screen.getByTestId("groups").textContent).toBe("")
  })

  it("signIn uses USER_SRP_AUTH and transitions to authenticated", async () => {
    mockGetCurrentUser.mockRejectedValue(new Error("No user"))
    mockSignIn.mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: "DONE" },
    })
    mockFetchAuthSession.mockResolvedValue(
      createMockSession({
        email: "test@example.com",
        name: "Test User",
        groups: ["admin"],
      }) as Awaited<ReturnType<typeof fetchAuthSession>>
    )

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("unauthenticated")
    })

    await act(async () => {
      screen.getByTestId("sign-in").click()
    })

    expect(mockSignIn).toHaveBeenCalledWith({
      username: "test@example.com",
      password: "password123",
      options: { authFlowType: "USER_SRP_AUTH" },
    })

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("authenticated")
    })
  })

  it("signIn maps NotAuthorizedException to user-friendly message", async () => {
    mockGetCurrentUser.mockRejectedValue(new Error("No user"))

    const authError = new Error("Incorrect username or password.")
    authError.name = "NotAuthorizedException"
    mockSignIn.mockRejectedValue(authError)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("unauthenticated")
    })

    await act(async () => {
      screen.getByTestId("sign-in").click()
    })

    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).toBe(
        "Incorrect email or password"
      )
    })

    expect(screen.getByTestId("status").textContent).toBe("error")
  })

  it("signIn maps network errors to connectivity message", async () => {
    mockGetCurrentUser.mockRejectedValue(new Error("No user"))

    const networkError = new Error("network error")
    networkError.name = "NetworkError"
    mockSignIn.mockRejectedValue(networkError)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("unauthenticated")
    })

    await act(async () => {
      screen.getByTestId("sign-in").click()
    })

    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).toBe(
        "Unable to connect. Check your internet connection."
      )
    })
  })

  it("signOut clears state even when Amplify signOut fails (requirement 8.7)", async () => {
    mockGetCurrentUser.mockResolvedValue({
      username: "user-123",
      userId: "abc-123",
    })
    mockFetchAuthSession.mockResolvedValue(
      createMockSession({
        email: "user@example.com",
      }) as Awaited<ReturnType<typeof fetchAuthSession>>
    )
    mockSignOut.mockRejectedValue(new Error("Network error during sign out"))

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("authenticated")
    })

    await act(async () => {
      screen.getByTestId("sign-out").click()
    })

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("unauthenticated")
    })

    expect(screen.getByTestId("email").textContent).toBe("")
  })

  it("signOut calls Amplify signOut and clears state on success", async () => {
    mockGetCurrentUser.mockResolvedValue({
      username: "user-123",
      userId: "abc-123",
    })
    mockFetchAuthSession.mockResolvedValue(
      createMockSession({
        email: "user@example.com",
      }) as Awaited<ReturnType<typeof fetchAuthSession>>
    )
    mockSignOut.mockResolvedValue(undefined)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("authenticated")
    })

    await act(async () => {
      screen.getByTestId("sign-out").click()
    })

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("unauthenticated")
    })

    expect(mockSignOut).toHaveBeenCalled()
  })

  it("calls onSessionExpired when token refresh fails", async () => {
    vi.useFakeTimers()
    const onSessionExpired = vi.fn()

    mockGetCurrentUser.mockResolvedValue({
      username: "user-123",
      userId: "abc-123",
    })
    mockFetchAuthSession.mockResolvedValueOnce(
      createMockSession({
        email: "user@example.com",
      }) as Awaited<ReturnType<typeof fetchAuthSession>>
    )

    await act(async () => {
      render(
        <AuthProvider onSessionExpired={onSessionExpired}>
          <TestConsumer />
        </AuthProvider>
      )
    })

    expect(screen.getByTestId("status").textContent).toBe("authenticated")

    // Simulate refresh failure
    mockFetchAuthSession.mockRejectedValueOnce(new Error("Token expired"))

    // Advance time to trigger refresh interval (4 minutes)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60 * 1000)
    })

    expect(screen.getByTestId("status").textContent).toBe("unauthenticated")
    expect(onSessionExpired).toHaveBeenCalled()
  })

  it("throws when useAuth is used outside of AuthProvider", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => render(<TestConsumer />)).toThrow(
      "useAuth must be used within an AuthProvider"
    )

    consoleSpy.mockRestore()
  })
})
