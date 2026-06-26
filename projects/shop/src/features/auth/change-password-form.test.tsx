import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { ChangePasswordForm } from "./change-password-form"

function renderForm(
  props?: Partial<React.ComponentProps<typeof ChangePasswordForm>>
) {
  const defaultProps = {
    onSubmit: vi.fn(),
    isLoading: false,
    error: null,
  }
  return render(<ChangePasswordForm {...defaultProps} {...props} />)
}

describe("ChangePasswordForm", () => {
  describe("rendering", () => {
    it("renders new password and confirm password fields and submit button", () => {
      renderForm()

      expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /change password/i })
      ).toBeInTheDocument()
    })

    it("renders password fields with type=password and autocomplete=new-password", () => {
      renderForm()

      const newPasswordInput = screen.getByLabelText(/new password/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

      expect(newPasswordInput).toHaveAttribute("type", "password")
      expect(newPasswordInput).toHaveAttribute("autocomplete", "new-password")
      expect(confirmPasswordInput).toHaveAttribute("type", "password")
      expect(confirmPasswordInput).toHaveAttribute(
        "autocomplete",
        "new-password"
      )
    })

    it("renders password fields with maxLength=128", () => {
      renderForm()

      const newPasswordInput = screen.getByLabelText(/new password/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

      expect(newPasswordInput).toHaveAttribute("maxlength", "128")
      expect(confirmPasswordInput).toHaveAttribute("maxlength", "128")
    })
  })

  describe("validation - invalid password", () => {
    it("shows validation error when password does not meet policy rules", async () => {
      const onSubmit = vi.fn()
      renderForm({ onSubmit })

      const newPasswordInput = screen.getByLabelText(/new password/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

      // Type a weak password (missing uppercase, digit, special char, and too short)
      fireEvent.change(newPasswordInput, { target: { value: "short" } })
      fireEvent.change(confirmPasswordInput, { target: { value: "short" } })

      await act(async () => {
        fireEvent.submit(
          screen.getByRole("button", { name: /change password/i })
        )
      })

      expect(
        screen.getByText(/password does not meet all requirements/i)
      ).toBeInTheDocument()
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })

  describe("validation - password mismatch", () => {
    it("shows 'Passwords do not match' when confirm password differs from new password", async () => {
      const onSubmit = vi.fn()
      renderForm({ onSubmit })

      const newPasswordInput = screen.getByLabelText(/new password/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

      // Use a valid password but mismatched confirm
      fireEvent.change(newPasswordInput, { target: { value: "ValidPass1!" } })
      fireEvent.change(confirmPasswordInput, {
        target: { value: "DifferentPass1!" },
      })

      await act(async () => {
        fireEvent.submit(
          screen.getByRole("button", { name: /change password/i })
        )
      })

      expect(screen.getByText("Passwords do not match")).toBeInTheDocument()
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })

  describe("valid submission", () => {
    it("calls onSubmit with the password when password is valid and matches confirm", async () => {
      const onSubmit = vi.fn()
      renderForm({ onSubmit })

      const newPasswordInput = screen.getByLabelText(/new password/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

      const validPassword = "ValidPass1!"
      fireEvent.change(newPasswordInput, { target: { value: validPassword } })
      fireEvent.change(confirmPasswordInput, {
        target: { value: validPassword },
      })

      await act(async () => {
        fireEvent.submit(
          screen.getByRole("button", { name: /change password/i })
        )
      })

      expect(onSubmit).toHaveBeenCalledWith(validPassword)
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
  })

  describe("loading state", () => {
    it("disables inputs and button when isLoading is true", () => {
      renderForm({ isLoading: true })

      expect(screen.getByLabelText(/new password/i)).toBeDisabled()
      expect(screen.getByLabelText(/confirm password/i)).toBeDisabled()
      expect(
        screen.getByRole("button", { name: /changing password/i })
      ).toBeDisabled()
    })
  })

  describe("error display", () => {
    it("displays error prop with role='alert'", () => {
      const errorMessage = "Password must have uppercase characters"
      renderForm({ error: errorMessage })

      const alert = screen.getByRole("alert")
      expect(alert).toHaveTextContent(errorMessage)
    })
  })

  describe("accessibility", () => {
    it("sets aria-invalid on the new password input when it has a validation error", async () => {
      renderForm()

      const newPasswordInput = screen.getByLabelText(/new password/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

      // Submit with invalid password to trigger validation error
      fireEvent.change(newPasswordInput, { target: { value: "weak" } })
      fireEvent.change(confirmPasswordInput, { target: { value: "weak" } })

      await act(async () => {
        fireEvent.submit(
          screen.getByRole("button", { name: /change password/i })
        )
      })

      expect(newPasswordInput).toHaveAttribute("aria-invalid", "true")
    })

    it("sets aria-describedby on the new password input linking to the error message", async () => {
      renderForm()

      const newPasswordInput = screen.getByLabelText(/new password/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

      fireEvent.change(newPasswordInput, { target: { value: "weak" } })
      fireEvent.change(confirmPasswordInput, { target: { value: "weak" } })

      await act(async () => {
        fireEvent.submit(
          screen.getByRole("button", { name: /change password/i })
        )
      })

      const describedById = newPasswordInput.getAttribute("aria-describedby")
      expect(describedById).toBe("new-password-error")
      expect(document.getElementById("new-password-error")).toHaveTextContent(
        /password does not meet all requirements/i
      )
    })

    it("sets aria-invalid and aria-describedby on confirm password when passwords do not match", async () => {
      renderForm()

      const newPasswordInput = screen.getByLabelText(/new password/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

      fireEvent.change(newPasswordInput, { target: { value: "ValidPass1!" } })
      fireEvent.change(confirmPasswordInput, {
        target: { value: "Mismatch1!" },
      })

      await act(async () => {
        fireEvent.submit(
          screen.getByRole("button", { name: /change password/i })
        )
      })

      expect(confirmPasswordInput).toHaveAttribute("aria-invalid", "true")
      const describedById =
        confirmPasswordInput.getAttribute("aria-describedby")
      expect(describedById).toBe("confirm-password-error")
      expect(
        document.getElementById("confirm-password-error")
      ).toHaveTextContent("Passwords do not match")
    })

    it("associates labels with inputs via for/id attribute pairing", () => {
      renderForm()

      const newPasswordInput = screen.getByLabelText(/new password/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

      expect(newPasswordInput).toHaveAttribute("id", "new-password")
      expect(confirmPasswordInput).toHaveAttribute("id", "confirm-password")
    })
  })
})
