import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { ProfileMenu } from "./profile-menu"

const mockSignOut = vi.fn()

vi.mock("../../providers/auth-provider", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: { email: "user@example.com", name: "Test User", groups: ["admin"] },
      error: null,
    },
    signIn: vi.fn(),
    signOut: mockSignOut,
  }),
}))

function renderProfileMenu(): void {
  render(
    <MemoryRouter>
      <ProfileMenu />
    </MemoryRouter>
  )
}

async function openDropdown(): Promise<void> {
  const trigger = screen.getByRole("button", { name: /open profile menu/i })
  // Radix DropdownMenu requires pointer events to open
  fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" })
  await waitFor(() => {
    expect(trigger).toHaveAttribute("aria-expanded", "true")
  })
}

describe("ProfileMenu", () => {
  beforeEach(() => {
    mockSignOut.mockClear()
  })

  it("renders a logout button inside the dropdown when opened", async () => {
    renderProfileMenu()

    await openDropdown()

    expect(screen.getByText("Log out")).toBeInTheDocument()
  })

  it("calls signOut when logout is clicked", async () => {
    renderProfileMenu()

    await openDropdown()

    const logoutItem = screen.getByText("Log out")
    fireEvent.click(logoutItem)

    expect(mockSignOut).toHaveBeenCalled()
  })
})
