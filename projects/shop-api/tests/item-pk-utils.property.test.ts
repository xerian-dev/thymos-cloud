import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildItemPk, formatSkuGsi1sk } from "../src/pk-utils";

/**
 * Feature: item-creation, Property 1: Item key and GSI1SK construction
 *
 * Validates: Requirements 1.1, 1.4
 */
describe("Item PK and GSI1SK construction properties", () => {
  it("buildItemPk(uuid) produces 'ITEM#' followed by the uuid for any valid UUID", () => {
    fc.assert(
      fc.property(fc.uuid(), (uuid: string) => {
        const pk = buildItemPk(uuid);
        expect(pk).toBe(`ITEM#${uuid}`);
        expect(pk.startsWith("ITEM#")).toBe(true);
        expect(pk.slice(5)).toBe(uuid);
      }),
      { numRuns: 100 },
    );
  });

  it("formatSkuGsi1sk(sku) produces 'ITEM#' followed by exactly 7 digits whose numeric value equals sku", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999999 }), (sku: number) => {
        const result = formatSkuGsi1sk(sku);

        // Must start with "ITEM#"
        expect(result.startsWith("ITEM#")).toBe(true);

        // The part after "ITEM#" must be exactly 7 digit characters
        const digits = result.slice(5);
        expect(digits).toHaveLength(7);
        expect(digits).toMatch(/^\d{7}$/);

        // The numeric value of those digits must equal the input sku
        expect(parseInt(digits, 10)).toBe(sku);
      }),
      { numRuns: 100 },
    );
  });
});
