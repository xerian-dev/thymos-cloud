import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { buildStreet } from "../field-mapper";

/**
 * Feature: account-model-restructure, Property 2: Street construction from address lines
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 */
describe("Property 2: Street construction from address lines", () => {
  it("concatenates both lines with comma when both non-empty", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (line1, line2) => {
          expect(buildStreet(line1, line2)).toBe(`${line1}, ${line2}`);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns addressLine1 when only addressLine1 is non-empty and addressLine2 is null/undefined/empty", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.constantFrom(null, undefined, ""),
        (line1, line2) => {
          expect(buildStreet(line1, line2)).toBe(line1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns addressLine2 when only addressLine2 is non-empty and addressLine1 is null/undefined/empty", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, ""),
        fc.string({ minLength: 1 }),
        (line1, line2) => {
          expect(buildStreet(line1, line2)).toBe(line2);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns empty string when both are null/undefined/empty", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, ""),
        fc.constantFrom(null, undefined, ""),
        (line1, line2) => {
          expect(buildStreet(line1, line2)).toBe("");
        },
      ),
      { numRuns: 100 },
    );
  });
});
