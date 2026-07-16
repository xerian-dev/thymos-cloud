import { describe, expect, it } from "vitest";
import { saleFormSchema } from "./sales-validation";

describe("saleFormSchema", () => {
  it("accepts valid data with all fields", () => {
    const result = saleFormSchema.safeParse({
      cashierId: "abc-123-def",
      memo: "Test memo",
      status: "finalized",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid data with only required fields", () => {
    const result = saleFormSchema.safeParse({
      cashierId: "abc-123-def",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty string for memo", () => {
    const result = saleFormSchema.safeParse({
      cashierId: "abc-123-def",
      memo: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty cashierId", () => {
    const result = saleFormSchema.safeParse({
      cashierId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing cashierId", () => {
    const result = saleFormSchema.safeParse({
      memo: "some memo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects memo exceeding 500 characters", () => {
    const result = saleFormSchema.safeParse({
      cashierId: "abc-123",
      memo: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts memo at exactly 500 characters", () => {
    const result = saleFormSchema.safeParse({
      cashierId: "abc-123",
      memo: "a".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("accepts status 'voided'", () => {
    const result = saleFormSchema.safeParse({
      cashierId: "abc-123",
      status: "voided",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status value", () => {
    const result = saleFormSchema.safeParse({
      cashierId: "abc-123",
      status: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts undefined status", () => {
    const result = saleFormSchema.safeParse({
      cashierId: "abc-123",
      status: undefined,
    });
    expect(result.success).toBe(true);
  });
});
