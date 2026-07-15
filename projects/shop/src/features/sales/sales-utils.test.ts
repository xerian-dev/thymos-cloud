import { describe, expect, it } from "vitest";
import { formatChfCents, formatSaleDate, getStatusVariant } from "./sales-utils";

describe("formatChfCents", () => {
  it("converts cents to CHF display format", () => {
    expect(formatChfCents(4250)).toBe("CHF 42.50");
  });

  it("handles zero", () => {
    expect(formatChfCents(0)).toBe("CHF 0.00");
  });

  it("handles single-digit cents", () => {
    expect(formatChfCents(5)).toBe("CHF 0.05");
  });

  it("handles large amounts", () => {
    expect(formatChfCents(1000000)).toBe("CHF 10000.00");
  });

  it("handles negative amounts", () => {
    expect(formatChfCents(-150)).toBe("CHF -1.50");
  });
});

describe("formatSaleDate", () => {
  it("returns em-dash for undefined", () => {
    expect(formatSaleDate(undefined)).toBe("—");
  });

  it("returns em-dash for empty string", () => {
    expect(formatSaleDate("")).toBe("—");
  });

  it("formats a valid ISO date string", () => {
    const result = formatSaleDate("2024-03-15T14:30:00Z");
    // Result depends on locale, but should contain date parts
    expect(result).toBeTruthy();
    expect(result).not.toBe("—");
  });
});

describe("getStatusVariant", () => {
  it("returns neutral classes for open status", () => {
    expect(getStatusVariant("open")).toBe("bg-muted text-muted-foreground");
  });

  it("returns success classes for finalized status", () => {
    expect(getStatusVariant("finalized")).toBe(
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
    );
  });

  it("returns destructive classes for voided status", () => {
    expect(getStatusVariant("voided")).toBe("bg-destructive/10 text-destructive");
  });
});
