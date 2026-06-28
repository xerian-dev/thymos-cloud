import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  mapConsignCloudToShop,
  hasFieldChanges,
  type ConsignCloudAccount,
} from "../field-mapper";

/**
 * Feature: consigncloud-import, Property 6: Field mapping from ConsignCloud to Shop format
 * Validates: Requirements 3.5
 */
describe("Property 6: Field mapping from ConsignCloud to Shop format", () => {
  const arbConsignCloudAccount: fc.Arbitrary<ConsignCloudAccount> = fc.record({
    id: fc.uuid(),
    number: fc.string({ minLength: 1, maxLength: 20 }),
    first_name: fc.string({ minLength: 0, maxLength: 50 }),
    last_name: fc.string({ minLength: 0, maxLength: 50 }),
    company: fc.string({ minLength: 0, maxLength: 100 }),
    email: fc.emailAddress(),
    balance: fc.double({ min: -10000, max: 10000, noNaN: true }),
    email_notifications_enabled: fc.boolean(),
    created: fc
      .integer({ min: 946684800000, max: 1924905600000 })
      .map((ms: number) => new Date(ms).toISOString()),
    deleted: fc.constant(undefined),
  });

  it("name is trimmed concatenation of first_name + space + last_name", () => {
    fc.assert(
      fc.property(arbConsignCloudAccount, (account) => {
        const result = mapConsignCloudToShop(account);
        const expected = `${account.first_name} ${account.last_name}`.trim();
        expect(result.name).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it("company passes through unchanged", () => {
    fc.assert(
      fc.property(arbConsignCloudAccount, (account) => {
        const result = mapConsignCloudToShop(account);
        expect(result.company).toBe(account.company);
      }),
      { numRuns: 100 },
    );
  });

  it("telephone equals email", () => {
    fc.assert(
      fc.property(arbConsignCloudAccount, (account) => {
        const result = mapConsignCloudToShop(account);
        expect(result.telephone).toBe(account.email);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: consigncloud-import, Property 7: Change detection triggers update if and only if fields differ
 * Validates: Requirements 3.3, 3.4
 */
describe("Property 7: Change detection triggers update if and only if fields differ", () => {
  const arbFieldValue = fc.string({ minLength: 0, maxLength: 100 });

  it("returns false when all fields are identical", () => {
    fc.assert(
      fc.property(
        arbFieldValue,
        arbFieldValue,
        arbFieldValue,
        (name, company, telephone) => {
          const existing = { name, company, telephone };
          const mapped = { name, company, telephone };
          expect(hasFieldChanges(existing, mapped)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("returns true if at least one field differs", () => {
    fc.assert(
      fc.property(
        arbFieldValue,
        arbFieldValue,
        arbFieldValue,
        arbFieldValue,
        arbFieldValue,
        arbFieldValue,
        fc.integer({ min: 0, max: 2 }),
        (
          name1,
          company1,
          telephone1,
          name2,
          company2,
          telephone2,
          diffIndex,
        ) => {
          // Ensure at least one field actually differs
          const existing = {
            name: name1,
            company: company1,
            telephone: telephone1,
          };
          const mapped = {
            name: name2,
            company: company2,
            telephone: telephone2,
          };

          // Force at least one field to differ based on diffIndex
          if (diffIndex === 0) {
            mapped.name = existing.name + "X";
          } else if (diffIndex === 1) {
            mapped.company = existing.company + "X";
          } else {
            mapped.telephone = existing.telephone + "X";
          }

          expect(hasFieldChanges(existing, mapped)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("treats undefined company in existing as empty string for comparison", () => {
    fc.assert(
      fc.property(arbFieldValue, arbFieldValue, (name, telephone) => {
        const existing = { name, company: undefined, telephone };
        const mapped = { name, company: "", telephone };
        expect(hasFieldChanges(existing, mapped)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
