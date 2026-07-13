import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildSaleKeys } from "../../src/import/sale-mapper";

/** Feature: consigncloud-sale-import, Property 3: Sale key construction follows the defined patterns */
describe("Property 3: Sale key construction follows the defined patterns", () => {
  /**
   * Validates: Requirements 6.2
   */
  it("PK equals SALE#<uuid>", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 1, max: 9999999 }),
        (uuid, number) => {
          const keys = buildSaleKeys(uuid, number);
          expect(keys.PK).toBe(`SALE#${uuid}`);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 6.2
   */
  it("SK equals METADATA", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 1, max: 9999999 }),
        (uuid, number) => {
          const keys = buildSaleKeys(uuid, number);
          expect(keys.SK).toBe("METADATA");
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 6.2
   */
  it("GSI1PK equals SALES", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 1, max: 9999999 }),
        (uuid, number) => {
          const keys = buildSaleKeys(uuid, number);
          expect(keys.GSI1PK).toBe("SALES");
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 6.2
   */
  it("GSI1SK equals SALE# followed by number zero-padded to 7 digits", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.integer({ min: 1, max: 9999999 }),
        (uuid, number) => {
          const keys = buildSaleKeys(uuid, number);
          expect(keys.GSI1SK).toBe(`SALE#${String(number).padStart(7, "0")}`);
        },
      ),
      { numRuns: 100 },
    );
  });
});
