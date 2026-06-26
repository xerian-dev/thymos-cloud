import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { PasswordStrengthIndicator } from "./password-strength-indicator"

describe("PasswordStrengthIndicator", () => {
  it("shows all rules as unsatisfied for an empty string", () => {
    render(<PasswordStrengthIndicator password="" />)

    const list = screen.getByRole("list", { name: "Password requirements" })
    const items = list.querySelectorAll("li")

    expect(items).toHaveLength(5)

    // All items should have the unsatisfied style (text-muted-foreground)
    for (const item of items) {
      const span = item.querySelector("span")
      expect(span).toHaveClass("text-muted-foreground")
      expect(span).not.toHaveClass("text-green-600")
    }
  })

  it("shows min-length rule as satisfied when password has 8+ characters", () => {
    render(<PasswordStrengthIndicator password="abcdefgh" />)

    const items = screen.getByRole("list").querySelectorAll("li")
    // min-length rule is first
    const minLengthSpan = items[0].querySelector("span")
    expect(minLengthSpan).toHaveClass("text-green-600")
    expect(minLengthSpan).toHaveTextContent("At least 8 characters")
  })

  it("shows uppercase rule as satisfied when password contains an uppercase letter", () => {
    render(<PasswordStrengthIndicator password="A" />)

    const items = screen.getByRole("list").querySelectorAll("li")
    // uppercase rule is second
    const uppercaseSpan = items[1].querySelector("span")
    expect(uppercaseSpan).toHaveClass("text-green-600")
    expect(uppercaseSpan).toHaveTextContent("At least one uppercase letter")
  })

  it("shows lowercase rule as satisfied when password contains a lowercase letter", () => {
    render(<PasswordStrengthIndicator password="a" />)

    const items = screen.getByRole("list").querySelectorAll("li")
    // lowercase rule is third
    const lowercaseSpan = items[2].querySelector("span")
    expect(lowercaseSpan).toHaveClass("text-green-600")
    expect(lowercaseSpan).toHaveTextContent("At least one lowercase letter")
  })

  it("shows digit rule as satisfied when password contains a digit", () => {
    render(<PasswordStrengthIndicator password="1" />)

    const items = screen.getByRole("list").querySelectorAll("li")
    // digit rule is fourth
    const digitSpan = items[3].querySelector("span")
    expect(digitSpan).toHaveClass("text-green-600")
    expect(digitSpan).toHaveTextContent("At least one digit")
  })

  it("shows special character rule as satisfied when password contains a special character", () => {
    render(<PasswordStrengthIndicator password="!" />)

    const items = screen.getByRole("list").querySelectorAll("li")
    // special rule is fifth
    const specialSpan = items[4].querySelector("span")
    expect(specialSpan).toHaveClass("text-green-600")
    expect(specialSpan).toHaveTextContent("At least one special character")
  })

  it("shows all rules as satisfied for a fully valid password", () => {
    render(<PasswordStrengthIndicator password="Abcdef1!" />)

    const items = screen.getByRole("list").querySelectorAll("li")

    expect(items).toHaveLength(5)

    for (const item of items) {
      const span = item.querySelector("span")
      expect(span).toHaveClass("text-green-600")
      expect(span).not.toHaveClass("text-muted-foreground")
    }
  })
})
