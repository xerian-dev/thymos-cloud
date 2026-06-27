import { describe, it, expect } from "vitest";
import {
  buildAccountPk,
  parseAccountPk,
  formatAccountNumber,
} from "../src/pk-utils";

describe("pk-utils", () => {
  describe("buildAccountPk", () => {
    it("constructs PK with zero-padded account number", () => {
      expect(buildAccountPk(42)).toBe("ACCOUNT#0000042");
    });

    it("handles single-digit account numbers", () => {
      expect(buildAccountPk(1)).toBe("ACCOUNT#0000001");
    });

    it("handles maximum account number", () => {
      expect(buildAccountPk(9999999)).toBe("ACCOUNT#9999999");
    });
  });

  describe("parseAccountPk", () => {
    it("extracts account number from PK", () => {
      expect(parseAccountPk("ACCOUNT#0000042")).toBe(42);
    });

    it("parses single-digit account number", () => {
      expect(parseAccountPk("ACCOUNT#0000001")).toBe(1);
    });

    it("parses maximum account number", () => {
      expect(parseAccountPk("ACCOUNT#9999999")).toBe(9999999);
    });
  });

  describe("formatAccountNumber", () => {
    it("pads single-digit number to 7 digits", () => {
      expect(formatAccountNumber(1)).toBe("0000001");
    });

    it("pads multi-digit number to 7 digits", () => {
      expect(formatAccountNumber(42)).toBe("0000042");
    });

    it("does not pad 7-digit number", () => {
      expect(formatAccountNumber(9999999)).toBe("9999999");
    });

    it("pads number with intermediate length", () => {
      expect(formatAccountNumber(12345)).toBe("0012345");
    });
  });
});
