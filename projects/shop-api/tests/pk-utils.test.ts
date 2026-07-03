import { describe, it, expect } from "vitest";
import { buildAccountUuidPk, formatAccountNumber } from "../src/pk-utils";

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
});
