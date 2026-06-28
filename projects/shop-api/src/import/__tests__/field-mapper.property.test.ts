import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  mapConsignCloudToShop,
  hasFieldChanges,
  type ConsignCloudAccount,
  type MappedAccountFields,
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
    phone_number: fc.option(fc.string({ minLength: 0, maxLength: 30 }), {
      nil: undefined,
    }),
    address_line_1: fc.option(fc.string({ minLength: 0, maxLength: 100 }), {
      nil: undefined,
    }),
    address_line_2: fc.option(fc.string({ minLength: 0, maxLength: 100 }), {
      nil: undefined,
    }),
    city: fc.option(fc.string({ minLength: 0, maxLength: 50 }), {
      nil: undefined,
    }),
    state: fc.option(fc.string({ minLength: 0, maxLength: 50 }), {
      nil: undefined,
    }),
    postal_code: fc.option(fc.string({ minLength: 0, maxLength: 20 }), {
      nil: undefined,
    }),
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

  it("email maps directly from source email", () => {
    fc.assert(
      fc.property(arbConsignCloudAccount, (account) => {
        const result = mapConsignCloudToShop(account);
        expect(result.email).toBe(account.email);
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
  const arbTags = fc.array(fc.string({ minLength: 1, maxLength: 30 }), {
    minLength: 0,
    maxLength: 5,
  });

  const arbMappedFields: fc.Arbitrary<MappedAccountFields> = fc.record({
    name: arbFieldValue,
    company: arbFieldValue,
    street: arbFieldValue,
    place: arbFieldValue,
    postcode: arbFieldValue,
    canton: arbFieldValue,
    email: arbFieldValue,
    telephone: arbFieldValue,
    tags: arbTags,
  });

  it("returns false when all fields are identical", () => {
    fc.assert(
      fc.property(arbMappedFields, (mapped) => {
        const existing = { ...mapped };
        expect(hasFieldChanges(existing, mapped)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("returns true if at least one scalar field differs", () => {
    const scalarFields = [
      "name",
      "company",
      "street",
      "place",
      "postcode",
      "canton",
      "email",
      "telephone",
    ] as const;

    fc.assert(
      fc.property(
        arbMappedFields,
        fc.integer({ min: 0, max: scalarFields.length - 1 }),
        (mapped, fieldIdx) => {
          const existing = { ...mapped, tags: [...mapped.tags] };
          existing[scalarFields[fieldIdx]] =
            mapped[scalarFields[fieldIdx]] + "X";
          expect(hasFieldChanges(existing, mapped)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("treats undefined optional fields in existing as empty string for comparison", () => {
    fc.assert(
      fc.property(arbFieldValue, arbTags, (name, tags) => {
        const existing = {
          name,
          company: undefined,
          street: undefined,
          place: undefined,
          postcode: undefined,
          canton: undefined,
          email: undefined,
          telephone: undefined,
          tags,
        };
        const mapped: MappedAccountFields = {
          name,
          company: "",
          street: "",
          place: "",
          postcode: "",
          canton: "",
          email: "",
          telephone: "",
          tags: [...tags],
        };
        expect(hasFieldChanges(existing, mapped)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
