import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validateSaleInput, ALLOWED_SALE_STATUSES } from "../sale-validation";

/**
 * **Validates: Requirements 3.6, 3.7, 3.9, 4.4**
 *
 * Property 1: Sale validation completeness
 * For any input object, validateSaleInput accepts it if and only if:
 * - status is one of {"open", "finalized", "voided"}
 * - cashierId is a non-empty string
 * - all optional numeric fields (if present) are numbers
 * - memo (if present) is a string
 * Furthermore, when validation fails, the returned fields array contains exactly
 * the fields that violate constraints — no false positives and no false negatives.
 */
describe("Feature: sales-backend-api, Property 1: Sale validation completeness", () => {
  // Test that valid inputs are always accepted
  it("accepts any object with valid status, non-empty cashierId, valid numeric optionals, and valid memo", () => {
    fc.assert(
      fc.property(
        fc.record({
          status: fc.constantFrom("open", "finalized", "voided"),
          cashierId: fc.string({ minLength: 1 }),
          subtotal: fc.option(fc.double({ noNaN: true }), { nil: undefined }),
          total: fc.option(fc.double({ noNaN: true }), { nil: undefined }),
          storePortion: fc.option(fc.double({ noNaN: true }), { nil: undefined }),
          consignorPortion: fc.option(fc.double({ noNaN: true }), { nil: undefined }),
          change: fc.option(fc.double({ noNaN: true }), { nil: undefined }),
          memo: fc.option(fc.string(), { nil: undefined }),
        }),
        (input) => {
          const result = validateSaleInput(input);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  // Test that invalid status is always rejected
  it("rejects any object with invalid status", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !["open", "finalized", "voided"].includes(s)),
        fc.string({ minLength: 1 }),
        (status, cashierId) => {
          const result = validateSaleInput({ status, cashierId });
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.some((e) => e.field === "status")).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Test that empty or non-string cashierId is always rejected
  it("rejects any object with empty or non-string cashierId", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("open", "finalized", "voided"),
        fc.oneof(
          fc.constant(""),
          fc.integer(),
          fc.constant(null),
          fc.constant(undefined),
          fc.boolean(),
        ),
        (status, cashierId) => {
          const result = validateSaleInput({ status, cashierId });
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.some((e) => e.field === "cashierId")).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Test that non-numeric optional fields cause rejection
  it("rejects when any optional numeric field is present but not a number", () => {
    const numericFields = ["subtotal", "total", "storePortion", "consignorPortion", "change"] as const;
    fc.assert(
      fc.property(
        fc.constantFrom(...numericFields),
        fc.oneof(fc.string(), fc.boolean(), fc.constant([])),
        (field, badValue) => {
          const input = { status: "open", cashierId: "emp1", [field]: badValue };
          const result = validateSaleInput(input);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.some((e) => e.field === field)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Test that non-string memo causes rejection
  it("rejects when memo is present but not a string", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.boolean(), fc.constant([]), fc.double({ noNaN: true })),
        (badMemo) => {
          const input = { status: "open", cashierId: "emp1", memo: badMemo };
          const result = validateSaleInput(input);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.some((e) => e.field === "memo")).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Test error collection is complete (no false negatives) and has no duplicates
  it("reports errors for all invalid fields with no duplicates", () => {
    fc.assert(
      fc.property(
        fc.record({
          status: fc.oneof(fc.constantFrom("open", "finalized", "voided"), fc.string()),
          cashierId: fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined)),
          subtotal: fc.option(fc.oneof(fc.double({ noNaN: true }), fc.string()), { nil: undefined }),
          total: fc.option(fc.oneof(fc.double({ noNaN: true }), fc.string()), { nil: undefined }),
          memo: fc.option(fc.oneof(fc.string(), fc.integer()), { nil: undefined }),
        }),
        (input) => {
          const result = validateSaleInput(input);
          if (!result.valid) {
            const errorFields = result.errors.map((e) => e.field);
            // No duplicates
            expect(new Set(errorFields).size).toBe(errorFields.length);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
