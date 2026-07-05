import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateItemInput } from "../src/item-validation";

/**
 * Feature: item-creation, Property 3: Required field validation — accept valid, reject invalid
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */
describe("Property 3: Required field validation — accept valid, reject invalid", () => {
  const validInventoryTypes = ["Consignment", "Retail"] as const;
  const validTerms = ["Return To Consignor", "Donate", "Discard"] as const;

  /** Generator for a valid tagPrice: number in [0, 999999.99] with ≤2 decimal places */
  const validTagPrice = fc
    .integer({ min: 0, max: 99999999 })
    .map((n) => n / 100);

  /** Generator for a valid quantity: positive integer ≤9999 */
  const validQuantity = fc.integer({ min: 1, max: 9999 });

  /** Generator for a valid split: integer in [0, 100] */
  const validSplit = fc.integer({ min: 0, max: 100 });

  /** Generator for a valid title: non-empty string ≤200 chars */
  const validTitle = fc.string({ minLength: 1, maxLength: 200 });

  /** Generator for a valid accountId: non-empty string */
  const validAccountId = fc.string({ minLength: 1, maxLength: 100 });

  /** Generator for a valid inventoryType */
  const validInventoryType = fc.constantFrom(...validInventoryTypes);

  /** Generator for valid terms */
  const validTermsGen = fc.constantFrom(...validTerms);

  /** Generator for a complete valid input (required fields only) */
  const validRequiredInput = fc.record({
    accountId: validAccountId,
    title: validTitle,
    tagPrice: validTagPrice,
    quantity: validQuantity,
    split: validSplit,
    inventoryType: validInventoryType,
    terms: validTermsGen,
  });

  it("accepts any input where all required fields are valid", () => {
    fc.assert(
      fc.property(validRequiredInput, (input) => {
        const result = validateItemInput(input);
        expect(result.valid).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("rejects when title is empty", () => {
    fc.assert(
      fc.property(validRequiredInput, (input) => {
        const invalidInput = { ...input, title: "" };
        const result = validateItemInput(invalidInput);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors.some((e) => e.field === "title")).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("rejects when title exceeds 200 characters", () => {
    fc.assert(
      fc.property(
        validRequiredInput,
        fc.string({ minLength: 201, maxLength: 300 }),
        (input, longTitle) => {
          const invalidInput = { ...input, title: longTitle };
          const result = validateItemInput(invalidInput);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.some((e) => e.field === "title")).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects when tagPrice is negative", () => {
    fc.assert(
      fc.property(
        validRequiredInput,
        fc.double({ min: -999999, max: -0.01, noNaN: true }),
        (input, negPrice) => {
          const invalidInput = { ...input, tagPrice: negPrice };
          const result = validateItemInput(invalidInput);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.some((e) => e.field === "tagPrice")).toBe(
              true,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects when tagPrice exceeds 999999.99", () => {
    fc.assert(
      fc.property(
        validRequiredInput,
        fc.double({ min: 1000000, max: 9999999, noNaN: true }),
        (input, highPrice) => {
          const invalidInput = { ...input, tagPrice: highPrice };
          const result = validateItemInput(invalidInput);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.some((e) => e.field === "tagPrice")).toBe(
              true,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects when tagPrice has more than 2 decimal places", () => {
    // Generate numbers guaranteed to have >2 decimal places
    // Use integers not divisible by 10 divided by 1000 (e.g., 1001/1000 = 1.001)
    const moreThanTwoDecimalsGen = fc
      .integer({ min: 1, max: 999999999 })
      .filter((n) => n % 10 !== 0)
      .map((n) => n / 1000);

    fc.assert(
      fc.property(
        validRequiredInput,
        moreThanTwoDecimalsGen,
        (input, badPrice) => {
          const invalidInput = { ...input, tagPrice: badPrice };
          const result = validateItemInput(invalidInput);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.some((e) => e.field === "tagPrice")).toBe(
              true,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects when quantity is not a positive integer", () => {
    fc.assert(
      fc.property(
        validRequiredInput,
        fc.integer({ min: -9999, max: 0 }),
        (input, badQuantity) => {
          const invalidInput = { ...input, quantity: badQuantity };
          const result = validateItemInput(invalidInput);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.some((e) => e.field === "quantity")).toBe(
              true,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects when quantity exceeds 9999", () => {
    fc.assert(
      fc.property(
        validRequiredInput,
        fc.integer({ min: 10000, max: 99999 }),
        (input, bigQuantity) => {
          const invalidInput = { ...input, quantity: bigQuantity };
          const result = validateItemInput(invalidInput);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.some((e) => e.field === "quantity")).toBe(
              true,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects when split is outside [0, 100]", () => {
    fc.assert(
      fc.property(
        validRequiredInput,
        fc.oneof(
          fc.integer({ min: -100, max: -1 }),
          fc.integer({ min: 101, max: 200 }),
        ),
        (input, badSplit) => {
          const invalidInput = { ...input, split: badSplit };
          const result = validateItemInput(invalidInput);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.some((e) => e.field === "split")).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects when inventoryType is not in the valid set", () => {
    fc.assert(
      fc.property(
        validRequiredInput,
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => !["Consignment", "Retail"].includes(s)),
        (input, badType) => {
          const invalidInput = { ...input, inventoryType: badType };
          const result = validateItemInput(invalidInput);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.some((e) => e.field === "inventoryType")).toBe(
              true,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects when terms is not in the valid set", () => {
    fc.assert(
      fc.property(
        validRequiredInput,
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter(
            (s) => !["Return To Consignor", "Donate", "Discard"].includes(s),
          ),
        (input, badTerms) => {
          const invalidInput = { ...input, terms: badTerms };
          const result = validateItemInput(invalidInput);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.some((e) => e.field === "terms")).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects when accountId is empty", () => {
    fc.assert(
      fc.property(validRequiredInput, (input) => {
        const invalidInput = { ...input, accountId: "" };
        const result = validateItemInput(invalidInput);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors.some((e) => e.field === "accountId")).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: item-creation, Property 4: Optional field length validation
 *
 * Validates: Requirements 2.9, 2.10, 2.11, 2.12
 */
describe("Property 4: Optional field length validation", () => {
  /** Base valid input to attach optional fields to */
  const baseValidInput = () => ({
    accountId: "test-account-id",
    title: "Test Item",
    tagPrice: 19.99,
    quantity: 1,
    split: 50,
    inventoryType: "Consignment" as const,
    terms: "Donate" as const,
  });

  it("accepts description ≤2000 characters, rejects >2000", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 2000 }), (desc) => {
        const input = { ...baseValidInput(), description: desc };
        const result = validateItemInput(input);
        expect(result.valid).toBe(true);
      }),
      { numRuns: 100 },
    );

    fc.assert(
      fc.property(fc.string({ minLength: 2001, maxLength: 2200 }), (desc) => {
        const input = { ...baseValidInput(), description: desc };
        const result = validateItemInput(input);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors.some((e) => e.field === "description")).toBe(
            true,
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  it("accepts details ≤5000 characters, rejects >5000", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 5000 }), (details) => {
        const input = { ...baseValidInput(), details };
        const result = validateItemInput(input);
        expect(result.valid).toBe(true);
      }),
      { numRuns: 100 },
    );

    fc.assert(
      fc.property(
        fc.string({ minLength: 5001, maxLength: 5200 }),
        (details) => {
          const input = { ...baseValidInput(), details };
          const result = validateItemInput(input);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.errors.some((e) => e.field === "details")).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("accepts tags with ≤20 items each ≤50 chars, rejects violations", () => {
    // Valid tags: ≤20 items, each ≤50 chars
    const validTag = fc.string({ minLength: 1, maxLength: 50 });
    const validTagsArray = fc.array(validTag, { minLength: 1, maxLength: 20 });

    fc.assert(
      fc.property(validTagsArray, (tags) => {
        const input = { ...baseValidInput(), tags };
        const result = validateItemInput(input);
        expect(result.valid).toBe(true);
      }),
      { numRuns: 100 },
    );

    // Reject: >20 tags
    const tooManyTags = fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
      minLength: 21,
      maxLength: 25,
    });

    fc.assert(
      fc.property(tooManyTags, (tags) => {
        const input = { ...baseValidInput(), tags };
        const result = validateItemInput(input);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors.some((e) => e.field === "tags")).toBe(true);
        }
      }),
      { numRuns: 100 },
    );

    // Reject: tag exceeding 50 chars
    const tagTooLong = fc.string({ minLength: 51, maxLength: 100 });

    fc.assert(
      fc.property(tagTooLong, (longTag) => {
        const input = { ...baseValidInput(), tags: [longTag] };
        const result = validateItemInput(input);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors.some((e) => e.field === "tags")).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("accepts valid ISO 8601 future expirationDate, rejects past/invalid", () => {
    // Valid: future dates (1 day to 5 years from now)
    const futureDateGen = fc.integer({ min: 1, max: 1825 }).map((daysAhead) => {
      const date = new Date();
      date.setDate(date.getDate() + daysAhead);
      return date.toISOString();
    });

    fc.assert(
      fc.property(futureDateGen, (dateStr) => {
        const input = { ...baseValidInput(), expirationDate: dateStr };
        const result = validateItemInput(input);
        expect(result.valid).toBe(true);
      }),
      { numRuns: 100 },
    );

    // Reject: past dates (1 day to 5 years ago)
    const pastDateGen = fc.integer({ min: 1, max: 1825 }).map((daysAgo) => {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      return date.toISOString();
    });

    fc.assert(
      fc.property(pastDateGen, (dateStr) => {
        const input = { ...baseValidInput(), expirationDate: dateStr };
        const result = validateItemInput(input);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors.some((e) => e.field === "expirationDate")).toBe(
            true,
          );
        }
      }),
      { numRuns: 100 },
    );

    // Reject: invalid date strings
    const invalidDateGen = fc
      .string({ minLength: 1, maxLength: 30 })
      .filter((s) => isNaN(new Date(s).getTime()));

    fc.assert(
      fc.property(invalidDateGen, (dateStr) => {
        const input = { ...baseValidInput(), expirationDate: dateStr };
        const result = validateItemInput(input);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors.some((e) => e.field === "expirationDate")).toBe(
            true,
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: item-creation, Property 5: Validation error completeness
 *
 * Validates: Requirements 2.13
 */
describe("Property 5: Validation error completeness", () => {
  it("for any input with N invalid required fields, the result contains errors mentioning each invalid field", () => {
    // Generate a subset of required fields to invalidate
    const requiredFields = [
      "accountId",
      "title",
      "tagPrice",
      "quantity",
      "split",
      "inventoryType",
      "terms",
    ] as const;

    // Map from field name to a valid value
    const validValues: Record<string, unknown> = {
      accountId: "valid-account-id",
      title: "Valid Title",
      tagPrice: 29.99,
      quantity: 5,
      split: 50,
      inventoryType: "Consignment",
      terms: "Donate",
    };

    // Map from field name to an invalid value
    const invalidValues: Record<string, unknown> = {
      accountId: "",
      title: "",
      tagPrice: -1,
      quantity: 0,
      split: 101,
      inventoryType: "Invalid",
      terms: "Invalid",
    };

    // Generate a non-empty subset of fields to invalidate
    const fieldsToInvalidateGen = fc
      .subarray([...requiredFields], { minLength: 1 })
      .filter((arr) => arr.length >= 1);

    fc.assert(
      fc.property(fieldsToInvalidateGen, (fieldsToInvalidate) => {
        // Build input with the selected fields invalid, rest valid
        const input: Record<string, unknown> = { ...validValues };
        for (const field of fieldsToInvalidate) {
          input[field] = invalidValues[field];
        }

        const result = validateItemInput(input);
        expect(result.valid).toBe(false);

        if (!result.valid) {
          // Each invalidated field should have a corresponding error
          const errorFields = new Set(result.errors.map((e) => e.field));
          for (const field of fieldsToInvalidate) {
            expect(errorFields.has(field)).toBe(true);
          }
          // The number of errors should be at least N (could be exactly N for required fields)
          expect(result.errors.length).toBeGreaterThanOrEqual(
            fieldsToInvalidate.length,
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  it("for any input with invalid optional fields combined with valid required fields, errors mention each invalid optional field", () => {
    const baseValid = {
      accountId: "valid-account-id",
      title: "Valid Title",
      tagPrice: 29.99,
      quantity: 5,
      split: 50,
      inventoryType: "Consignment",
      terms: "Donate",
    };

    // Optional fields with their invalid values
    const optionalInvalidations: Array<{
      field: string;
      value: unknown;
    }> = [
      { field: "description", value: "x".repeat(2001) },
      { field: "details", value: "x".repeat(5001) },
      { field: "tags", value: Array(21).fill("tag") },
      { field: "expirationDate", value: "2020-01-01T00:00:00.000Z" },
    ];

    // Generate a non-empty subset of optional fields to invalidate
    const subsetGen = fc
      .subarray(optionalInvalidations, { minLength: 1 })
      .filter((arr) => arr.length >= 1);

    fc.assert(
      fc.property(subsetGen, (fieldsToInvalidate) => {
        const input: Record<string, unknown> = { ...baseValid };
        for (const { field, value } of fieldsToInvalidate) {
          input[field] = value;
        }

        const result = validateItemInput(input);
        expect(result.valid).toBe(false);

        if (!result.valid) {
          const errorFields = new Set(result.errors.map((e) => e.field));
          for (const { field } of fieldsToInvalidate) {
            expect(errorFields.has(field)).toBe(true);
          }
          // Error count should match the number of invalid fields
          expect(result.errors.length).toBe(fieldsToInvalidate.length);
        }
      }),
      { numRuns: 100 },
    );
  });
});
