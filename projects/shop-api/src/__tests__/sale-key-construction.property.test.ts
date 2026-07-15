import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { buildSalePk, formatSaleGsi1sk } from "../pk-utils";

/**
 * **Validates: Requirements 3.4**
 */
describe("Feature: sales-backend-api, Property 3: Sale key construction round-trip", () => {
  it("buildSalePk produces 'SALE#' + uuid for any string", () => {
    fc.assert(
      fc.property(fc.uuid(), (uuid) => {
        expect(buildSalePk(uuid)).toBe(`SALE#${uuid}`);
      }),
      { numRuns: 200 },
    );
  });

  it("formatSaleGsi1sk produces 'SALE#' + 7-char zero-padded number", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999999 }), (n) => {
        const result = formatSaleGsi1sk(n);
        expect(result).toBe(`SALE#${String(n).padStart(7, "0")}`);
        // Verify format: SALE# followed by exactly 7 digits
        expect(result).toMatch(/^SALE#\d{7}$/);
      }),
      { numRuns: 200 },
    );
  });

  it("formatSaleGsi1sk preserves numeric ordering under lexicographic comparison", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9999998 }),
        fc.integer({ min: 1, max: 9999998 }),
        (a, b) => {
          fc.pre(a !== b);
          const keyA = formatSaleGsi1sk(a);
          const keyB = formatSaleGsi1sk(b);
          if (a < b) {
            expect(keyA < keyB).toBe(true);
          } else {
            expect(keyA > keyB).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
