import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import * as fc from "fast-check";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import type {
  AuthContextValue,
  AuthState,
} from "../../providers/auth-provider";

/**
 * Feature: shop-monorepo, Property 5: Roles display completeness
 *
 * For any authenticated user with a `cognito:groups` claim containing zero or more
 * group names, the profile menu SHALL display all group names from the claim.
 * If the groups array is empty, a "no roles assigned" indicator SHALL be shown instead.
 *
 * Validates: Requirements 8.3, 8.4
 */

// Radix UI requires PointerEvent to be available in the test environment
beforeAll(() => {
  class MockPointerEvent extends Event {
    button: number;
    ctrlKey: boolean;
    pointerType: string;

    constructor(type: string, props: PointerEventInit = {}) {
      super(type, props);
      this.button = props.button ?? 0;
      this.ctrlKey = props.ctrlKey ?? false;
      this.pointerType = props.pointerType ?? "mouse";
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  window.PointerEvent = MockPointerEvent as any;
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
});

const mockSignOut = vi.fn();

function createMockAuthValue(groups: string[]): AuthContextValue {
  const state: AuthState = {
    status: "authenticated",
    user: {
      email: "test@example.com",
      name: "Test User",
      groups,
    },
    error: null,
  };
  return {
    state,
    signIn: vi.fn(),
    signOut: mockSignOut,
    confirmNewPassword: vi.fn(),
  };
}

let mockAuthValue: AuthContextValue = createMockAuthValue([]);

vi.mock("../../providers/auth-provider", () => ({
  useAuth: () => mockAuthValue,
}));

afterEach(() => {
  cleanup();
});

async function openDropdown(): Promise<void> {
  const trigger = screen.getByRole("button", { name: /open profile menu/i });
  await act(async () => {
    trigger.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerType: "mouse",
      }),
    );
    trigger.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerType: "mouse",
      }),
    );
    trigger.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );
  });
}

describe("Feature: shop-monorepo, Property 5: Roles display completeness", () => {
  it("all group names are rendered when groups array is non-empty", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,29}$/), {
          minLength: 1,
          maxLength: 10,
        }),
        async (groups) => {
          // Use unique groups to avoid key collision issues in React
          const uniqueGroups = [...new Set(groups)];
          if (uniqueGroups.length === 0) return;

          // Clean up before each property iteration
          cleanup();

          mockAuthValue = createMockAuthValue(uniqueGroups);

          const { ProfileMenu } = await import("./profile-menu");
          render(<ProfileMenu />);

          await openDropdown();

          // Wait for the dropdown content to appear (Radix portal)
          await waitFor(() => {
            expect(screen.getByText("Roles")).toBeInTheDocument();
          });

          // Get all menu items in the roles group
          const menuItems = screen.getAllByRole("menuitem");

          // Filter out "Log out" item — remaining are role items
          const roleItems = menuItems.filter(
            (item) => item.textContent !== "Log out",
          );

          // Verify all group names are present among role items
          const renderedRoles = roleItems.map((item) =>
            (item.textContent ?? "").trim(),
          );
          for (const group of uniqueGroups) {
            expect(renderedRoles).toContain(group);
          }

          // "No roles assigned" should NOT be shown
          expect(
            screen.queryByText(/no roles assigned/i),
          ).not.toBeInTheDocument();
        },
      ),
      { numRuns: 100 },
    );
  }, 60000);

  it("'No roles assigned' is shown when groups array is empty", async () => {
    mockAuthValue = createMockAuthValue([]);

    const { ProfileMenu } = await import("./profile-menu");
    render(<ProfileMenu />);

    await openDropdown();

    // Wait for the dropdown content to appear (Radix portal)
    await waitFor(() => {
      expect(screen.getByText("Roles")).toBeInTheDocument();
    });

    // Verify "No roles assigned" is displayed
    expect(screen.getByText(/no roles assigned/i)).toBeInTheDocument();
  });
});
