import { describe, it, expect } from "vitest";
import { accountsColumns } from "./accounts-columns";

describe("accountsColumns", () => {
  const accessorKeys = accountsColumns
    .filter((col) => "accessorKey" in col)
    .map((col) => (col as { accessorKey: string }).accessorKey);

  it("includes street column", () => {
    expect(accessorKeys).toContain("street");
  });

  it("includes place column", () => {
    expect(accessorKeys).toContain("place");
  });

  it("includes postcode column", () => {
    expect(accessorKeys).toContain("postcode");
  });

  it("includes email column", () => {
    expect(accessorKeys).toContain("email");
  });

  it("includes telephone column", () => {
    expect(accessorKeys).toContain("telephone");
  });

  it("includes createdBy column", () => {
    expect(accessorKeys).toContain("createdBy");
  });

  it("does not include address column", () => {
    expect(accessorKeys).not.toContain("address");
  });

  it("columns do not have sorting enabled", () => {
    for (const col of accountsColumns) {
      expect((col as { enableSorting?: boolean }).enableSorting).not.toBe(true);
    }
  });
});
