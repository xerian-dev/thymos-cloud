import { describe, it, expect } from "vitest";
import { formatAccountNumber } from "./accounts-utils";

describe("formatAccountNumber", () => {
  it("pads single digit to 7 characters", () => {
    expect(formatAccountNumber(1)).toBe("0000001");
  });

  it("returns 7-digit number unchanged", () => {
    expect(formatAccountNumber(9999999)).toBe("9999999");
  });

  it("pads two-digit number correctly", () => {
    expect(formatAccountNumber(42)).toBe("0000042");
  });

  it("pads three-digit number correctly", () => {
    expect(formatAccountNumber(100)).toBe("0000100");
  });

  it("returns 7-digit number at lower boundary unchanged", () => {
    expect(formatAccountNumber(1000000)).toBe("1000000");
  });
});
