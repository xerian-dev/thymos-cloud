import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"
import { AuthGuard } from "./auth-guard"

const mockUseAuth = vi.fn()

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}))

function renderWithRouter(): void {
  render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route element={<AuthGuard />}>
          <Route path="/protected" element={<div>Protected Content</div>} />
        </Route>
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe("AuthGuard", () => {
  it("shows a loading indicator when auth status is loading", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "loading", user: null, error: null },
      signIn: vi.fn(),
      signOut: vi.fn(),
    })

    renderWithRouter()

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument()
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument()
    expect(screen.queryByText("Login Page")).not.toBeInTheDocument()
  })

  it("redirects to /login when auth status is unauthenticated", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "unauthenticated", user: null, error: null },
      signIn: vi.fn(),
      signOut: vi.fn(),
    })

    renderWithRouter()

    expect(screen.getByText("Login Page")).toBeInTheDocument()
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument()
  })

  it("redirects to /login when auth status is error", () => {
    mockUseAuth.mockReturnValue({
      state: { status: "error", user: null, error: "Something went wrong" },
      signIn: vi.fn(),
      signOut: vi.fn(),
    })

    renderWithRouter()

    expect(screen.getByText("Login Page")).toBeInTheDocument()
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument()
  })

  it("renders child routes when auth status is authenticated", () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: "authenticated",
        user: { email: "user@example.com", groups: [] },
        error: null,
      },
      signIn: vi.fn(),
      signOut: vi.fn(),
    })

    renderWithRouter()

    expect(screen.getByText("Protected Content")).toBeInTheDocument()
    expect(screen.queryByText("Login Page")).not.toBeInTheDocument()
  })
})
