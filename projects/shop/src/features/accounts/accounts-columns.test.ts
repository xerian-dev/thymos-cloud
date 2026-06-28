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

  it("includes canton column", () => {
    expect(accessorKeys).toContain("canton");
  });

  it("includes email column", () => {
    expect(accessorKeys).toContain("email");
  });

  it("includes telephone column", () => {
    expect(accessorKeys).toContain("telephone");
  });

  it("does not include address column", () => {
    expect(accessorKeys).not.toContain("address");
  });

  it("new columns have caseInsensitive sorting enabled", () => {
    const newFields = [
      "street",
      "place",
      "postcode",
      "canton",
      "email",
      "telephone",
    ];
    for (const field of newFields) {
      const col = accountsColumns.find(
        (c) =>
          "accessorKey" in c &&
          (c as { accessorKey: string }).accessorKey === field,
      );
      expect(col).toBeDefined();
      expect((col as { enableSorting: boolean }).enableSorting).toBe(true);
      expect((col as { sortingFn: string }).sortingFn).toBe("caseInsensitive");
    }
  });
});
