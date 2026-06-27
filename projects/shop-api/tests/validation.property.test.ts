import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateCreateAccount } from "../src/validation";

/** Helper: builds a valid base input so we can vary one field at a time */
function validBase(overrides: Record<string, unknown> = {}): unknown {
  return {
    accountNumber: 1,
    name: "Test",
    address: "",
    telephone: "",
    ...overrides,
  };
}

/**
 * Feature: accounts-api-backend, Property 3: Account number validation
 *
 * Validates: Requirements 4.1
 */
describe("Feature: accounts-api-backend, Property 3: Account number validation", () => {
  it("accepts any integer in [1, 9999999]", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999999 }), (n: number) => {
        const result = validateCreateAccount(validBase({ accountNumber: n }));
        expect(result.valid).toBe(true);
      }),
    );
  });

  it("rejects integers outside [1, 9999999] — zero and negative", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 0 }), (n: number) => {
        const result = validateCreateAccount(validBase({ accountNumber: n }));
        expect(result.valid).toBe(false);
      }),
    );
  });

  it("rejects integers greater than 9999999", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10_000_000, max: 100_000_000 }),
        (n: number) => {
          const result = validateCreateAccount(validBase({ accountNumber: n }));
          expect(result.valid).toBe(false);
        },
      ),
    );
  });

  it("rejects non-integer numbers (floats)", () => {
    fc.assert(
      fc.property(
        fc
          .double({ min: -1e6, max: 1e7, noNaN: true, noDefaultInfinity: true })
          .filter((n) => !Number.isInteger(n)),
        (n: number) => {
          const result = validateCreateAccount(validBase({ accountNumber: n }));
          expect(result.valid).toBe(false);
        },
      ),
    );
  });
});

/**
 * Feature: accounts-api-backend, Property 4: Name validation
 *
 * Validates: Requirements 4.2
 */
describe("Feature: accounts-api-backend, Property 4: Name validation", () => {
  it("accepts strings of length 1–100 with at least one non-whitespace character", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter((s) => /\S/.test(s)),
        (name: string) => {
          const result = validateCreateAccount(validBase({ name }));
          expect(result.valid).toBe(true);
        },
      ),
    );
  });

  it("rejects empty strings", () => {
    const result = validateCreateAccount(validBase({ name: "" }));
    expect(result.valid).toBe(false);
  });

  it("rejects strings longer than 100 characters", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 101, maxLength: 200 }),
        (name: string) => {
          const result = validateCreateAccount(validBase({ name }));
          expect(result.valid).toBe(false);
        },
      ),
    );
  });

  it("rejects whitespace-only strings", () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom(" ", "\t", "\n", "\r"), {
            minLength: 1,
            maxLength: 100,
          })
          .map((chars) => chars.join("")),
        (name: string) => {
          const result = validateCreateAccount(validBase({ name }));
          expect(result.valid).toBe(false);
        },
      ),
    );
  });
});

/**
 * Feature: accounts-api-backend, Property 5: Optional field length validation
 *
 * Validates: Requirements 4.3, 4.4
 */
describe("Feature: accounts-api-backend, Property 5: Optional field length validation", () => {
  it("accepts address strings of length 0–500", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        (address: string) => {
          const result = validateCreateAccount(validBase({ address }));
          expect(result.valid).toBe(true);
        },
      ),
    );
  });

  it("rejects address strings longer than 500 characters", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 501, maxLength: 600 }),
        (address: string) => {
          const result = validateCreateAccount(validBase({ address }));
          expect(result.valid).toBe(false);
        },
      ),
    );
  });

  it("accepts telephone strings of length 0–30", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 30 }),
        (telephone: string) => {
          const result = validateCreateAccount(validBase({ telephone }));
          expect(result.valid).toBe(true);
        },
      ),
    );
  });

  it("rejects telephone strings longer than 30 characters", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 31, maxLength: 60 }),
        (telephone: string) => {
          const result = validateCreateAccount(validBase({ telephone }));
          expect(result.valid).toBe(false);
        },
      ),
    );
  });
});
