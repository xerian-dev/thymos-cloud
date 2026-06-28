import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateCreateAccount } from "../src/validation";

/** Helper: builds a valid base input so we can vary one field at a time */
function validBase(overrides: Record<string, unknown> = {}): unknown {
  return {
    accountNumber: 1,
    name: "Test",
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
 * Validates: Requirements 1.3, 1.4, 1.5, 1.6, 2.2, 3.2
 */
describe("Feature: accounts-api-backend, Property 5: Optional field length validation", () => {
  it("accepts street strings of length 0–200", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }),
        (street: string) => {
          const result = validateCreateAccount(validBase({ street }));
          expect(result.valid).toBe(true);
        },
      ),
    );
  });

  it("rejects street strings longer than 200 characters", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 201, maxLength: 300 }),
        (street: string) => {
          const result = validateCreateAccount(validBase({ street }));
          expect(result.valid).toBe(false);
        },
      ),
    );
  });

  it("accepts place strings of length 0–100", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }),
        (place: string) => {
          const result = validateCreateAccount(validBase({ place }));
          expect(result.valid).toBe(true);
        },
      ),
    );
  });

  it("rejects place strings longer than 100 characters", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 101, maxLength: 200 }),
        (place: string) => {
          const result = validateCreateAccount(validBase({ place }));
          expect(result.valid).toBe(false);
        },
      ),
    );
  });

  it("accepts postcode strings of length 0–20", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 20 }),
        (postcode: string) => {
          const result = validateCreateAccount(validBase({ postcode }));
          expect(result.valid).toBe(true);
        },
      ),
    );
  });

  it("rejects postcode strings longer than 20 characters", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 21, maxLength: 40 }),
        (postcode: string) => {
          const result = validateCreateAccount(validBase({ postcode }));
          expect(result.valid).toBe(false);
        },
      ),
    );
  });

  it("accepts canton strings of length 0–50", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50 }),
        (canton: string) => {
          const result = validateCreateAccount(validBase({ canton }));
          expect(result.valid).toBe(true);
        },
      ),
    );
  });

  it("rejects canton strings longer than 50 characters", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 51, maxLength: 100 }),
        (canton: string) => {
          const result = validateCreateAccount(validBase({ canton }));
          expect(result.valid).toBe(false);
        },
      ),
    );
  });

  it("accepts email strings of length 0–254", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 254 }),
        (email: string) => {
          const result = validateCreateAccount(validBase({ email }));
          expect(result.valid).toBe(true);
        },
      ),
    );
  });

  it("rejects email strings longer than 254 characters", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 255, maxLength: 400 }),
        (email: string) => {
          const result = validateCreateAccount(validBase({ email }));
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

  it("accepts undefined/null for all optional fields", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(undefined, null),
        fc.constantFrom(undefined, null),
        fc.constantFrom(undefined, null),
        fc.constantFrom(undefined, null),
        fc.constantFrom(undefined, null),
        fc.constantFrom(undefined, null),
        (street, place, postcode, canton, email, telephone) => {
          const result = validateCreateAccount(
            validBase({ street, place, postcode, canton, email, telephone }),
          );
          expect(result.valid).toBe(true);
        },
      ),
    );
  });
});
