import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { AdminLayout } from "./admin-layout"

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: { email: "user@example.com", name: "Test User", groups: ["admin"] },
      error: null,
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}))

function renderWithLayout(): void {
  render(
    <MemoryRouter initialEntries={["/inventory"]}>
      <AdminLayout />
    </MemoryRouter>
  )
}

describe("NavigationMenu", () => {
  it("renders an Inventory navigation entry", () => {
    renderWithLayout()

    expect(screen.getByText("Inventory")).toBeInTheDocument()
  })

  it("renders a Help navigation entry", () => {
    renderWithLayout()

    expect(screen.getByText("Help")).toBeInTheDocument()
  })

  it("at narrow viewport, sidebar is hidden by default and toggle button shows it", () => {
    // Simulate narrow viewport by checking that the sidebar has the hidden class
    // and that the toggle button can open it
    renderWithLayout()

    const sidebar = screen.getByRole("complementary", {
      name: /sidebar navigation/i,
    })

    // At narrow viewports (< 1024px), the sidebar is translated off-screen by default
    // The CSS class "-translate-x-full" hides it (lg:translate-x-0 shows it at large viewports)
    expect(sidebar.className).toContain("-translate-x-full")

    // Click the toggle button to open sidebar
    const toggleButton = screen.getByRole("button", { name: /open sidebar/i })
    fireEvent.click(toggleButton)

    // After toggle, sidebar should have translate-x-0
    expect(sidebar.className).toContain("translate-x-0")
    expect(sidebar.className).not.toMatch(/-translate-x-full/)
  })
})
