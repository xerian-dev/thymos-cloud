import { describe, it, expect, afterEach } from "vitest";
import * as fc from "fast-check";
import { render, screen, cleanup, within, act } from "@testing-library/react";
import { AccountsTable } from "./accounts-table";
import type { Account } from "./accounts-types";

/**
 * Feature: accounts-page, Property 5: Sort ordering correctness
 *
 * For any list of accounts and any sortable column, after sorting:
 * (a) the account number column SHALL be in numeric order, and
 * (b) all other sortable columns (name, address, telephone) SHALL be in
 *     case-insensitive alphabetical order.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.10
 */

/**
 * Feature: accounts-page, Property 6: Sort toggle behavior
 *
 * For any sortable column, clicking the column header when it is not the
 * currently sorted column SHALL produce ascending order. Clicking the currently
 * sorted column header SHALL toggle between ascending and descending order.
 *
 * Validates: Requirements 3.7, 3.8
 */

const accountArb = fc.record({
  uuid: fc.uuid(),
  shopUid: fc.integer({ min: 1, max: 9999999 }),
  name: fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => s.trim().length > 0),
  address: fc.string({ maxLength: 50 }),
  telephone: fc.string({ maxLength: 20 }),
  commentCount: fc.nat({ max: 100 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 }),
});

const accountsArb = fc.array(accountArb, { minLength: 2, maxLength: 20 });

afterEach(() => {
  cleanup();
});

function getColumnValues(columnIndex: number): string[] {
  const rows = screen.getAllByRole("row");
  // Skip the header row — get data rows only
  return rows.slice(1).map((row) => {
    const cells = within(row).getAllByRole("cell");
    return cells[columnIndex]?.textContent ?? "";
  });
}

function clickColumnHeader(name: RegExp): void {
  const button = screen.getByRole("button", { name });
  act(() => {
    button.click();
  });
}

const sortableColumns = [
  { name: "Account #", index: 0, type: "numeric" as const },
  { name: "Name", index: 1, type: "alpha" as const },
  { name: "Address", index: 2, type: "alpha" as const },
  { name: "Telephone", index: 3, type: "alpha" as const },
];

describe("Feature: accounts-page, Property 5: Sort ordering correctness", () => {
  it("account # column is in numeric ascending order after click, then descending after second click", () => {
    fc.assert(
      fc.property(accountsArb, (accounts: Account[]) => {
        cleanup();
        render(<AccountsTable data={accounts} loading={false} error={null} />);

        // Click Account # header to sort ascending
        clickColumnHeader(/Account #/);

        const valuesAsc = getColumnValues(0);
        const numericAsc = valuesAsc.map((v) => parseInt(v, 10));

        // Verify ascending numeric order
        for (let i = 0; i < numericAsc.length - 1; i++) {
          expect(numericAsc[i]).toBeLessThanOrEqual(numericAsc[i + 1]);
        }

        // Click again for descending
        clickColumnHeader(/Account #/);

        const valuesDesc = getColumnValues(0);
        const numericDesc = valuesDesc.map((v) => parseInt(v, 10));

        // Verify descending numeric order
        for (let i = 0; i < numericDesc.length - 1; i++) {
          expect(numericDesc[i]).toBeGreaterThanOrEqual(numericDesc[i + 1]);
        }
      }),
      { numRuns: 50 },
    );
  }, 60000);

  it("text columns (name, address, telephone) are in case-insensitive alphabetical order after sort", () => {
    const textColumns = sortableColumns.filter((c) => c.type === "alpha");
    const columnArb = fc.constantFrom(...textColumns);

    fc.assert(
      fc.property(accountsArb, columnArb, (accounts: Account[], column) => {
        cleanup();
        render(<AccountsTable data={accounts} loading={false} error={null} />);

        // Click the column header to sort ascending
        clickColumnHeader(new RegExp(column.name));

        const valuesAsc = getColumnValues(column.index);

        // Verify case-insensitive ascending alphabetical order
        for (let i = 0; i < valuesAsc.length - 1; i++) {
          const a = valuesAsc[i].toLowerCase();
          const b = valuesAsc[i + 1].toLowerCase();
          expect(a <= b).toBe(true);
        }

        // Click again for descending
        clickColumnHeader(new RegExp(column.name));

        const valuesDesc = getColumnValues(column.index);

        // Verify case-insensitive descending alphabetical order
        for (let i = 0; i < valuesDesc.length - 1; i++) {
          const a = valuesDesc[i].toLowerCase();
          const b = valuesDesc[i + 1].toLowerCase();
          expect(a >= b).toBe(true);
        }
      }),
      { numRuns: 50 },
    );
  }, 60000);
});

describe("Feature: accounts-page, Property 6: Sort toggle behavior", () => {
  it("clicking an unsorted column produces ascending; clicking again toggles to descending", () => {
    const columnArb = fc.constantFrom(...sortableColumns);

    fc.assert(
      fc.property(accountsArb, columnArb, (accounts: Account[], column) => {
        cleanup();
        render(<AccountsTable data={accounts} loading={false} error={null} />);

        // Find the th element that contains the sort button
        const headerButton = screen.getByRole("button", {
          name: new RegExp(column.name),
        });
        const th = headerButton.closest("th");
        expect(th).not.toBeNull();

        // Initially no column is sorted — all sortable headers should be "none"
        expect(th!.getAttribute("aria-sort")).toBe("none");

        // Click an unsorted column → ascending
        act(() => {
          headerButton.click();
        });
        expect(th!.getAttribute("aria-sort")).toBe("ascending");

        // Click same column again → descending
        act(() => {
          headerButton.click();
        });
        expect(th!.getAttribute("aria-sort")).toBe("descending");
      }),
      { numRuns: 50 },
    );
  }, 60000);

  it("clicking a different column resets the previously sorted column to none", () => {
    const columnPairArb = fc
      .tuple(
        fc.constantFrom(...sortableColumns),
        fc.constantFrom(...sortableColumns),
      )
      .filter(([a, b]) => a.name !== b.name);

    fc.assert(
      fc.property(
        accountsArb,
        columnPairArb,
        (accounts: Account[], [firstCol, secondCol]) => {
          cleanup();
          render(
            <AccountsTable data={accounts} loading={false} error={null} />,
          );

          // Sort by first column
          const firstButton = screen.getByRole("button", {
            name: new RegExp(firstCol.name),
          });
          const firstTh = firstButton.closest("th");
          act(() => {
            firstButton.click();
          });
          expect(firstTh!.getAttribute("aria-sort")).toBe("ascending");

          // Now click a different column
          const secondButton = screen.getByRole("button", {
            name: new RegExp(secondCol.name),
          });
          const secondTh = secondButton.closest("th");
          act(() => {
            secondButton.click();
          });

          // New column is ascending
          expect(secondTh!.getAttribute("aria-sort")).toBe("ascending");

          // Old column is back to none
          expect(firstTh!.getAttribute("aria-sort")).toBe("none");
        },
      ),
      { numRuns: 50 },
    );
  }, 60000);
});
