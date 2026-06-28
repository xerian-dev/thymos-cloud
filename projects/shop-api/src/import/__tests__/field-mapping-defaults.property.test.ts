import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { mapConsignCloudToShop } from "../field-mapper";
import type { ConsignCloudAccount } from "../field-mapper";

/**
 * **Validates: Requirements 5.5, 5.6, 5.7, 6.1**
 *
 * Property 3: Direct field mapping with null defaults
 * For any ConsignCloudAccount, verify:
 * - place === city ?? ""
 * - postcode === postal_code ?? ""
 * - canton === state ?? ""
 * - email === source.email
 */

const consignCloudAccountArb = fc.record({
  id: fc.string({ minLength: 1 }),
  number: fc.string({ minLength: 1 }),
  first_name: fc.string(),
  last_name: fc.string(),
  company: fc.string(),
  email: fc.string(),
  phone_number: fc.option(fc.string(), { nil: undefined }),
  address_line_1: fc.option(fc.string(), { nil: undefined }),
  address_line_2: fc.option(fc.string(), { nil: undefined }),
  city: fc.option(fc.string(), { nil: undefined }),
  state: fc.option(fc.string(), { nil: undefined }),
  postal_code: fc.option(fc.string(), { nil: undefined }),
  balance: fc.integer(),
  email_notifications_enabled: fc.boolean(),
  created: fc.string(),
});

describe("mapConsignCloudToShop - direct field mapping properties", () => {
  it("maps city to place with empty string default", () => {
    fc.assert(
      fc.property(consignCloudAccountArb, (source) => {
        const mapped = mapConsignCloudToShop(source as ConsignCloudAccount);
        expect(mapped.place).toBe(source.city ?? "");
      }),
    );
  });

  it("maps postal_code to postcode with empty string default", () => {
    fc.assert(
      fc.property(consignCloudAccountArb, (source) => {
        const mapped = mapConsignCloudToShop(source as ConsignCloudAccount);
        expect(mapped.postcode).toBe(source.postal_code ?? "");
      }),
    );
  });

  it("maps state to canton with empty string default", () => {
    fc.assert(
      fc.property(consignCloudAccountArb, (source) => {
        const mapped = mapConsignCloudToShop(source as ConsignCloudAccount);
        expect(mapped.canton).toBe(source.state ?? "");
      }),
    );
  });

  it("maps email directly from source", () => {
    fc.assert(
      fc.property(consignCloudAccountArb, (source) => {
        const mapped = mapConsignCloudToShop(source as ConsignCloudAccount);
        expect(mapped.email).toBe(source.email);
      }),
    );
  });
});
