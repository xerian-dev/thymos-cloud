import { describe, it, expect } from "vitest";
import { navigationItems } from "@/config/navigation";
import { router } from "@/config/routes";

describe("Accounts navigation item", () => {
  it("includes an entry with label 'Accounts' and path '/accounts'", () => {
    const accountsNav = navigationItems.find(
      (item) => item.label === "Accounts",
    );

    expect(accountsNav).toBeDefined();
    expect(accountsNav!.path).toBe("/accounts");
  });

  it("has an icon property defined", () => {
    const accountsNav = navigationItems.find(
      (item) => item.label === "Accounts",
    );

    expect(accountsNav).toBeDefined();
    expect(accountsNav!.icon).toBeDefined();
    expect(accountsNav!.icon).not.toBeNull();
  });
});

describe("Accounts route configuration", () => {
  it("contains 'accounts' path under AuthGuard → AdminLayout children", () => {
    // router.routes is the top-level route array
    const routes = router.routes;

    // Find the AuthGuard route (no path, has children — second top-level route)
    const authGuardRoute = routes.find(
      (route) => !("path" in route && route.path) && route.children,
    );
    expect(authGuardRoute).toBeDefined();

    // AuthGuard's children should contain the AdminLayout route
    const adminLayoutRoute = authGuardRoute!.children?.find(
      (route) => route.children,
    );
    expect(adminLayoutRoute).toBeDefined();

    // AdminLayout's children should include the accounts route
    const accountsRoute = adminLayoutRoute!.children?.find(
      (route) => "path" in route && route.path === "accounts",
    );
    expect(accountsRoute).toBeDefined();
  });
});
