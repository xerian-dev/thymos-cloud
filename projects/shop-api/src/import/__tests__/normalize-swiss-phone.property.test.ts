import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { normalizeSwissPhone } from "../field-mapper";

/**
 * Feature: account-model-restructure, Property 4: Swiss phone normalization
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 */
describe("Property 4: Swiss phone normalization", () => {
  it("strips +41 prefix and prepends 0", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(normalizeSwissPhone("+41" + s)).toBe("0" + s);
      }),
      { numRuns: 200 },
    );
  });

  it("strips 0041 prefix and prepends 0", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(normalizeSwissPhone("0041" + s)).toBe("0" + s);
      }),
      { numRuns: 200 },
    );
  });

  it("returns input unchanged when it does not start with +41 or 0041", () => {
    fc.assert(
      fc.property(
        fc
          .string()
          .filter(
            (s) =>
              !s.startsWith("+41") && !s.startsWith("0041") && s.length > 0,
          ),
        (s) => {
          expect(normalizeSwissPhone(s)).toBe(s);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("returns empty string for null input", () => {
    expect(normalizeSwissPhone(null)).toBe("");
  });

  it("returns empty string for undefined input", () => {
    expect(normalizeSwissPhone(undefined)).toBe("");
  });
});
