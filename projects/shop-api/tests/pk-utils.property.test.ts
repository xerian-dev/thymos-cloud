import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildAccountUuidPk, formatAccountNumber } from "../src/pk-utils";

/**
 * Property: buildAccountUuidPk produces ACCOUNT# prefix + uuid
 */
describe("pk-utils properties", () => {
  it("buildAccountUuidPk(uuid) always starts with ACCOUNT# prefix followed by the uuid", () => {
    fc.assert(
      fc.property(fc.uuid(), (uuid: string) => {
        const pk = buildAccountUuidPk(uuid);
        expect(pk).toBe(`ACCOUNT#${uuid}`);
        expect(pk).toMatch(/^ACCOUNT#.+$/);
      }),
    );
  });

  it("formatAccountNumber(n) produces exactly 7 characters for any valid account number", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9999999 }), (n: number) => {
        const formatted = formatAccountNumber(n);
        expect(formatted).toHaveLength(7);
        expect(formatted).toMatch(/^\d{7}$/);
        expect(parseInt(formatted, 10)).toBe(n);
      }),
    );
  });
});
