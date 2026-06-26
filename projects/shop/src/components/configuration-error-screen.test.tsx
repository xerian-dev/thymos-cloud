import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ConfigurationErrorScreen } from "./configuration-error-screen"

describe("ConfigurationErrorScreen", () => {
  it("displays the provided error message", () => {
    render(
      <ConfigurationErrorScreen message="Application configuration error. Contact support." />
    )
    expect(
      screen.getByText("Application configuration error. Contact support.")
    ).toBeInTheDocument()
  })

  it("renders with an alert role for accessibility", () => {
    render(<ConfigurationErrorScreen message="Test error" />)
    expect(screen.getByRole("alert")).toBeInTheDocument()
  })

  it("displays the Configuration Error heading", () => {
    render(<ConfigurationErrorScreen message="Test error" />)
    expect(
      screen.getByRole("heading", { name: "Configuration Error" })
    ).toBeInTheDocument()
  })
})
