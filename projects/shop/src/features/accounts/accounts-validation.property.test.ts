import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { accountFormSchema } from "./accounts-validation";

/**
 * Feature: accounts-page, Property 3: Name validation requires non-whitespace content within length bounds
 *
 * For any string S, the name validation SHALL accept S if and only if S contains at least
 * one non-whitespace character and has a total length of no more than 100 characters.
 *
 * Validates: Requirements 6.1, 6.2
 */

describe("Feature: accounts-page, Property 3: Name validation requires non-whitespace content within length bounds", () => {
  const nameSchema = accountFormSchema.shape.name;

  it("accepts any string with at least one non-whitespace character and length <= 100", () => {
    const validNameArb = fc
      .string({ minLength: 1, maxLength: 100 })
      .filter((s) => s.trim().length > 0);

    fc.assert(
      fc.property(validNameArb, (name: string) => {
        const result = nameSchema.safeParse(name);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects empty strings", () => {
    const result = nameSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only strings", () => {
    const whitespaceArb = fc
      .constantFrom(" ", "\t", "\n", "\r")
      .chain((ws) =>
        fc.integer({ min: 1, max: 100 }).map((len) => ws.repeat(len)),
      )
      .filter((s) => s.length <= 100);

    fc.assert(
      fc.property(whitespaceArb, (ws: string) => {
        const result = nameSchema.safeParse(ws);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects any string with length > 100", () => {
    const longStringArb = fc.string({ minLength: 101, maxLength: 300 });

    fc.assert(
      fc.property(longStringArb, (long: string) => {
        const result = nameSchema.safeParse(long);
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
