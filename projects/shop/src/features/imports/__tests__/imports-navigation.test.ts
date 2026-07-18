import { describe, it, expect } from "vitest";
import { navigationItems } from "@/config/navigation";
import { router } from "@/config/routes";

describe("Imports navigation integration", () => {
  it("includes an 'Imports' entry in the navigation items", () => {
    const importsEntry = navigationItems.find(
      (item) => item.label === "Imports",
    );
    expect(importsEntry).toBeDefined();
  });

  it("has path '/imports' for the Imports entry", () => {
    const importsEntry = navigationItems.find(
      (item) => item.label === "Imports",
    );
    expect(importsEntry?.path).toBe("/imports");
  });

  it("route configuration includes a path for 'imports'", () => {
    // The router's routes array contains the top-level route objects.
    // The protected routes are nested under the AuthGuard > AdminLayout children.
    const authGuardRoute = router.routes.find(
      (route) => route.children && route.children.length > 0,
    );
    const adminLayoutRoute = authGuardRoute?.children?.find(
      (child) => child.children && child.children.length > 0,
    );
    const importsRoute = adminLayoutRoute?.children?.find(
      (child) => child.path === "imports",
    );

    expect(importsRoute).toBeDefined();
  });
});
