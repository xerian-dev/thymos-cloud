import { describe, it, expect } from "vitest";
import { navigationItems } from "@/config/navigation";

describe("Employees navigation integration", () => {
  it("includes an 'Employees' entry in the navigation items", () => {
    const employeesEntry = navigationItems.find(
      (item) => item.label === "Employees",
    );
    expect(employeesEntry).toBeDefined();
  });

  it("positions 'Employees' after 'Accounts' and before 'Sales'", () => {
    const accountsIndex = navigationItems.findIndex(
      (item) => item.label === "Accounts",
    );
    const employeesIndex = navigationItems.findIndex(
      (item) => item.label === "Employees",
    );
    const salesIndex = navigationItems.findIndex(
      (item) => item.label === "Sales",
    );

    expect(accountsIndex).toBeGreaterThanOrEqual(0);
    expect(employeesIndex).toBeGreaterThanOrEqual(0);
    expect(salesIndex).toBeGreaterThanOrEqual(0);

    expect(employeesIndex).toBeGreaterThan(accountsIndex);
    expect(employeesIndex).toBeLessThan(salesIndex);
  });

  it("has path '/employees' for the Employees entry", () => {
    const employeesEntry = navigationItems.find(
      (item) => item.label === "Employees",
    );
    expect(employeesEntry?.path).toBe("/employees");
  });
});
