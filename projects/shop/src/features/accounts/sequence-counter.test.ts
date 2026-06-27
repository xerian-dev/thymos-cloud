import { describe, it, expect } from "vitest";
import {
  computeNextCounter,
  canCreateAccount,
  MAX_ACCOUNT_NUMBER,
} from "./sequence-counter";

describe("computeNextCounter", () => {
  it("increments by 1 when usedUid equals currentCounter (default sequential)", () => {
    expect(computeNextCounter(42, 42)).toBe(43);
    expect(computeNextCounter(1, 1)).toBe(2);
    expect(computeNextCounter(100, 100)).toBe(101);
  });

  it("sets counter to usedUid + 1 when usedUid exceeds currentCounter", () => {
    expect(computeNextCounter(10, 50)).toBe(51);
    expect(computeNextCounter(1, 9999998)).toBe(9999999);
    expect(computeNextCounter(500, 1000)).toBe(1001);
  });

  it("leaves counter unchanged when usedUid is less than currentCounter", () => {
    expect(computeNextCounter(100, 50)).toBe(100);
    expect(computeNextCounter(9999999, 1)).toBe(9999999);
    expect(computeNextCounter(42, 41)).toBe(42);
  });
});

describe("canCreateAccount", () => {
  it("returns true when nextCounter is within valid range", () => {
    expect(canCreateAccount(1)).toBe(true);
    expect(canCreateAccount(9999999)).toBe(true);
    expect(canCreateAccount(5000000)).toBe(true);
  });

  it("returns false when nextCounter exceeds MAX_ACCOUNT_NUMBER", () => {
    expect(canCreateAccount(10000000)).toBe(false);
    expect(canCreateAccount(MAX_ACCOUNT_NUMBER + 1)).toBe(false);
  });
});

describe("MAX_ACCOUNT_NUMBER", () => {
  it("equals 9999999", () => {
    expect(MAX_ACCOUNT_NUMBER).toBe(9999999);
  });
});
