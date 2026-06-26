import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { LoginScreen } from "./login-screen"

const mockSignIn = vi.fn()
const mockUseAuth = vi.fn()
const mockNavigate = vi.fn()

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderLoginScreen(): void {
  render(
    <MemoryRouter>
      <LoginScreen />
    </MemoryRouter>
  )
}

describe("LoginScreen", () => {
  beforeEach(() => {
    mockSignIn.mockReset()
    mockNavigate.mockReset()
    mockUseAuth.mockReturnValue({
      state: { status: "unauthenticated", user: null, error: null },
      signIn: mockSignIn,
      signOut: vi.fn(),
    })
  })

  it("renders a submit button that is accessible", () => {
    renderLoginScreen()

    const button = screen.getByRole("button", { name: /sign in/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute("type", "submit")
  })

  it("disables the submit button during loading state", () => {
    // Mock auth state as loading with a submitting form
    mockUseAuth.mockReturnValue({
      state: { status: "loading", user: null, error: null },
      signIn: mockSignIn,
      signOut: vi.fn(),
    })

    renderLoginScreen()

    // Fill in the fields so the form can be submitted
    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    fireEvent.change(emailInput, { target: { value: "test@example.com" } })
    fireEvent.change(passwordInput, { target: { value: "password123" } })

    // Submit the form to trigger the internal submitting state
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }))

    // After submission with status "loading", the button should be disabled
    const button = screen.getByRole("button", { name: /signing in/i })
    expect(button).toBeDisabled()
  })

  it("does not render a signup or registration link", () => {
    renderLoginScreen()

    const signupTerms = ["sign up", "register", "create account", "signup"]
    for (const term of signupTerms) {
      expect(screen.queryByText(new RegExp(term, "i"))).not.toBeInTheDocument()
    }

    // Verify no links are rendered
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("displays an error message when auth fails", () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: "error",
        user: null,
        error: "Incorrect email or password",
      },
      signIn: mockSignIn,
      signOut: vi.fn(),
    })

    renderLoginScreen()

    // Submit form to trigger submitting state, which then reads the error
    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    fireEvent.change(emailInput, { target: { value: "test@example.com" } })
    fireEvent.change(passwordInput, { target: { value: "wrong" } })
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }))

    const alert = screen.getByRole("alert")
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent("Incorrect email or password")
  })

  it("preserves the email field value after an auth error", () => {
    mockUseAuth.mockReturnValue({
      state: {
        status: "error",
        user: null,
        error: "Incorrect email or password",
      },
      signIn: mockSignIn,
      signOut: vi.fn(),
    })

    renderLoginScreen()

    // Type an email address
    const emailInput = screen.getByLabelText(/email/i)
    fireEvent.change(emailInput, { target: { value: "user@example.com" } })

    // Type a password and submit the form
    const passwordInput = screen.getByLabelText(/password/i)
    fireEvent.change(passwordInput, { target: { value: "wrong-password" } })
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }))

    // After the error, the email should still be preserved
    expect(emailInput).toHaveValue("user@example.com")
  })
})
