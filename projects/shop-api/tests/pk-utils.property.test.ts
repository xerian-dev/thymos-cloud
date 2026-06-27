import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildAccountPk, parseAccountPk } from "../src/pk-utils";

/**
 * Feature: accounts-api-backend, Property 1: Account PK round-trip
 *
 * Validates: Requirements 1.2, 3.3
 */
describe("Feature: accounts-api-backend, Property 1: Account PK round-trip", () => {
  it("parseAccountPk(buildAccountPk(n)) produces n for any valid account number", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999999 }), (n: number) => {
        const pk = buildAccountPk(n);
        const parsed = parseAccountPk(pk);
        expect(parsed).toBe(n);
      }),
    );
  });

  it("buildAccountPk(n) matches ACCOUNT# followed by exactly 7 digits", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999999 }), (n: number) => {
        const pk = buildAccountPk(n);
        expect(pk).toMatch(/^ACCOUNT#\d{7}$/);
      }),
    );
  });
});
