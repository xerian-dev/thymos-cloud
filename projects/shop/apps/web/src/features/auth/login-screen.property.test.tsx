import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { LoginScreen } from "./login-screen"

/**
 * Feature: shop-monorepo, Property 2: Empty field submission prevention
 *
 * For any combination of email and password values where at least one field is
 * empty or contains only whitespace characters, submitting the login form SHALL
 * produce a validation error for each empty field and SHALL NOT trigger an
 * authentication request.
 *
 * Validates: Requirements 5.4
 */

const mockSignIn = vi.fn()

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    state: { status: "unauthenticated" as const, user: null, error: null },
    signIn: mockSignIn,
    signOut: vi.fn(),
  }),
}))

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
}))

/** Arbitrary generating empty or whitespace-only strings */
const emptyOrWhitespaceArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.constant(" "),
  fc.constant("  "),
  fc.constant("\t"),
  fc.constant("\n"),
  fc.constant("\r\n"),
  fc.constant(" \t "),
  fc.constant("   "),
  fc.constant("\t\t"),
  fc.constant(" \n "),
  // Generate random whitespace-only strings of varying length
  fc
    .array(fc.constantFrom(" ", "\t", "\n", "\r"), {
      minLength: 1,
      maxLength: 10,
    })
    .map((chars) => chars.join(""))
)

/** Arbitrary generating non-empty, non-whitespace strings (valid input) */
const nonEmptyStringArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)

describe("Feature: shop-monorepo, Property 2: Empty field submission prevention", () => {
  beforeEach(() => {
    mockSignIn.mockReset()
  })

  it("shows email validation error and does not call signIn when email is empty/whitespace", () => {
    fc.assert(
      fc.property(
        emptyOrWhitespaceArb,
        nonEmptyStringArb,
        (email, password) => {
          mockSignIn.mockReset()

          const { unmount } = render(<LoginScreen />)

          const emailInput = screen.getByLabelText("Email")
          const passwordInput = screen.getByLabelText("Password")
          const submitButton = screen.getByRole("button", { name: /sign in/i })

          fireEvent.change(emailInput, { target: { value: email } })
          fireEvent.change(passwordInput, { target: { value: password } })
          fireEvent.click(submitButton)

          expect(screen.getByText("Email is required")).toBeInTheDocument()
          expect(mockSignIn).not.toHaveBeenCalled()

          unmount()
        }
      ),
      { numRuns: 100 }
    )
  })

  it("shows password validation error and does not call signIn when password is empty/whitespace", () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        emptyOrWhitespaceArb,
        (email, password) => {
          mockSignIn.mockReset()

          const { unmount } = render(<LoginScreen />)

          const emailInput = screen.getByLabelText("Email")
          const passwordInput = screen.getByLabelText("Password")
          const submitButton = screen.getByRole("button", { name: /sign in/i })

          fireEvent.change(emailInput, { target: { value: email } })
          fireEvent.change(passwordInput, { target: { value: password } })
          fireEvent.click(submitButton)

          expect(screen.getByText("Password is required")).toBeInTheDocument()
          expect(mockSignIn).not.toHaveBeenCalled()

          unmount()
        }
      ),
      { numRuns: 100 }
    )
  })

  it("shows both validation errors and does not call signIn when both fields are empty/whitespace", () => {
    fc.assert(
      fc.property(
        emptyOrWhitespaceArb,
        emptyOrWhitespaceArb,
        (email, password) => {
          mockSignIn.mockReset()

          const { unmount } = render(<LoginScreen />)

          const emailInput = screen.getByLabelText("Email")
          const passwordInput = screen.getByLabelText("Password")
          const submitButton = screen.getByRole("button", { name: /sign in/i })

          fireEvent.change(emailInput, { target: { value: email } })
          fireEvent.change(passwordInput, { target: { value: password } })
          fireEvent.click(submitButton)

          expect(screen.getByText("Email is required")).toBeInTheDocument()
          expect(screen.getByText("Password is required")).toBeInTheDocument()
          expect(mockSignIn).not.toHaveBeenCalled()

          unmount()
        }
      ),
      { numRuns: 100 }
    )
  })
})
