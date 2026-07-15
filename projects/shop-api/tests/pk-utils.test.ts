import { describe, it, expect } from "vitest";
import {
  buildAccountUuidPk,
  formatAccountNumber,
  buildItemPk,
  formatSkuGsi1sk,
  buildSalePk,
  formatSaleGsi1sk,
  buildEmployeePk,
} from "../src/pk-utils";

describe("pk-utils", () => {
  describe("buildAccountUuidPk", () => {
    it("constructs PK with UUID", () => {
      expect(buildAccountUuidPk("abc-123")).toBe("ACCOUNT#abc-123");
    });

    it("handles full UUID format", () => {
      expect(buildAccountUuidPk("550e8400-e29b-41d4-a716-446655440000")).toBe(
        "ACCOUNT#550e8400-e29b-41d4-a716-446655440000",
      );
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

  describe("buildItemPk", () => {
    it("constructs PK with UUID", () => {
      expect(buildItemPk("abc-123")).toBe("ITEM#abc-123");
    });

    it("handles full UUID format", () => {
      expect(buildItemPk("550e8400-e29b-41d4-a716-446655440000")).toBe(
        "ITEM#550e8400-e29b-41d4-a716-446655440000",
      );
    });
  });

  describe("formatSkuGsi1sk", () => {
    it("pads single-digit SKU to 7 digits with ITEM# prefix", () => {
      expect(formatSkuGsi1sk(1)).toBe("ITEM#0000001");
    });

    it("pads multi-digit SKU to 7 digits with ITEM# prefix", () => {
      expect(formatSkuGsi1sk(42)).toBe("ITEM#0000042");
    });

    it("does not pad 7-digit SKU", () => {
      expect(formatSkuGsi1sk(9999999)).toBe("ITEM#9999999");
    });

    it("pads SKU with intermediate length", () => {
      expect(formatSkuGsi1sk(12345)).toBe("ITEM#0012345");
    });
  });

  describe("buildSalePk", () => {
    it("constructs PK with UUID", () => {
      expect(buildSalePk("abc-123")).toBe("SALE#abc-123");
    });

    it("handles full UUID format", () => {
      expect(buildSalePk("550e8400-e29b-41d4-a716-446655440000")).toBe(
        "SALE#550e8400-e29b-41d4-a716-446655440000",
      );
    });
  });

  describe("formatSaleGsi1sk", () => {
    it("pads single-digit sale number to 7 digits with SALE# prefix", () => {
      expect(formatSaleGsi1sk(1)).toBe("SALE#0000001");
    });

    it("pads multi-digit sale number to 7 digits with SALE# prefix", () => {
      expect(formatSaleGsi1sk(42)).toBe("SALE#0000042");
    });

    it("does not pad 7-digit sale number", () => {
      expect(formatSaleGsi1sk(9999999)).toBe("SALE#9999999");
    });

    it("pads sale number with intermediate length", () => {
      expect(formatSaleGsi1sk(12345)).toBe("SALE#0012345");
    });
  });

  describe("buildEmployeePk", () => {
    it("constructs PK with UUID", () => {
      expect(buildEmployeePk("abc-123")).toBe("EMPLOYEE#abc-123");
    });

    it("handles full UUID format", () => {
      expect(buildEmployeePk("550e8400-e29b-41d4-a716-446655440000")).toBe(
        "EMPLOYEE#550e8400-e29b-41d4-a716-446655440000",
      );
    });
  });
});
