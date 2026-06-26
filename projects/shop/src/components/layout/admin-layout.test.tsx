import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
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

function renderAdminLayout(): void {
  render(
    <MemoryRouter initialEntries={["/inventory"]}>
      <AdminLayout />
    </MemoryRouter>
  )
}

describe("AdminLayout", () => {
  it("renders a sidebar with aria-label", () => {
    renderAdminLayout()

    const sidebar = screen.getByRole("complementary", {
      name: /sidebar navigation/i,
    })
    expect(sidebar).toBeInTheDocument()
  })

  it("renders a header element", () => {
    renderAdminLayout()

    const header = screen.getByRole("banner")
    expect(header).toBeInTheDocument()
  })

  it("renders a main content area", () => {
    renderAdminLayout()

    const main = screen.getByRole("main")
    expect(main).toBeInTheDocument()
  })
})
