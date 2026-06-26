import { describe, it, expect, vi, afterEach } from "vitest"
import * as fc from "fast-check"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import { ChangePasswordForm } from "./change-password-form"

/**
 * Feature: force-change-password, Property 2: Invalid password submission prevention
 *
 * For any string that violates at least one password policy rule, submitting the
 * Change_Password_Form SHALL produce a validation error and SHALL NOT invoke the
 * `onSubmit` callback.
 *
 * Validates: Requirements 3.3
 */

afterEach(() => {
  cleanup()
})

/**
 * Generates strings that violate at least one password policy rule.
 * Each sub-arbitrary generates strings missing at least one required character class.
 */
function invalidPasswordArb(): fc.Arbitrary<string> {
  return fc.oneof(
    // Too short (1-7 chars), any characters
    fc.stringMatching(/^.{1,7}$/),
    // No uppercase: only lowercase + digits + special chars, length >= 8
    fc.stringMatching(/^[a-z0-9!@#$%^&*]{8,20}$/),
    // No lowercase: only uppercase + digits + special chars, length >= 8
    fc.stringMatching(/^[A-Z0-9!@#$%^&*]{8,20}$/),
    // No digit: only letters + special chars, length >= 8
    fc.stringMatching(/^[A-Za-z!@#$%^&*]{8,20}$/),
    // No special character: only alphanumeric, length >= 8
    fc.stringMatching(/^[A-Za-z0-9]{8,20}$/)
  )
}

describe("Feature: force-change-password, Property 2: Invalid password submission prevention", () => {
  it("submitting with an invalid password shows validation error and does not call onSubmit", () => {
    fc.assert(
      fc.property(invalidPasswordArb(), (invalidPassword) => {
        cleanup()

        const onSubmit = vi.fn()
        render(
          <ChangePasswordForm
            onSubmit={onSubmit}
            isLoading={false}
            error={null}
          />
        )

        // Fill both password fields with the same invalid password (no mismatch interference)
        const newPasswordInput = screen.getByLabelText(/new password/i)
        const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

        fireEvent.change(newPasswordInput, {
          target: { value: invalidPassword },
        })
        fireEvent.change(confirmPasswordInput, {
          target: { value: invalidPassword },
        })

        // Submit the form
        const submitButton = screen.getByRole("button", {
          name: /change password/i,
        })
        fireEvent.click(submitButton)

        // Verify validation error is shown
        expect(
          screen.getByText("Password does not meet all requirements")
        ).toBeInTheDocument()

        // Verify onSubmit was NOT called
        expect(onSubmit).not.toHaveBeenCalled()
      }),
      { numRuns: 100 }
    )
  })
})
