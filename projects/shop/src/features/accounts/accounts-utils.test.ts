import { describe, it, expect } from "vitest";
import { formatShopUid } from "./accounts-utils";

describe("formatShopUid", () => {
  it("pads single digit to 7 characters", () => {
    expect(formatShopUid(1)).toBe("0000001");
  });

  it("returns 7-digit number unchanged", () => {
    expect(formatShopUid(9999999)).toBe("9999999");
  });

  it("pads two-digit number correctly", () => {
    expect(formatShopUid(42)).toBe("0000042");
  });

  it("pads three-digit number correctly", () => {
    expect(formatShopUid(100)).toBe("0000100");
  });

  it("returns 7-digit number at lower boundary unchanged", () => {
    expect(formatShopUid(1000000)).toBe("1000000");
  });
});
