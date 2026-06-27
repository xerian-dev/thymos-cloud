import { describe, it, expect } from "vitest";
import { accountNumberSchema, accountFormSchema } from "./accounts-validation";

describe("accountNumberSchema", () => {
  describe("accepts valid account numbers", () => {
    it("accepts minimum value 1", () => {
      expect(accountNumberSchema.safeParse(1).success).toBe(true);
    });

    it("accepts maximum value 9999999", () => {
      expect(accountNumberSchema.safeParse(9999999).success).toBe(true);
    });

    it("accepts a typical value 42", () => {
      expect(accountNumberSchema.safeParse(42).success).toBe(true);
    });

    it("accepts a large value 1000000", () => {
      expect(accountNumberSchema.safeParse(1000000).success).toBe(true);
    });
  });

  describe("rejects invalid account numbers", () => {
    it("rejects zero", () => {
      const result = accountNumberSchema.safeParse(0);
      expect(result.success).toBe(false);
    });

    it("rejects negative numbers", () => {
      const result = accountNumberSchema.safeParse(-1);
      expect(result.success).toBe(false);
    });

    it("rejects decimal numbers", () => {
      const result = accountNumberSchema.safeParse(3.14);
      expect(result.success).toBe(false);
    });

    it("rejects values exceeding maximum", () => {
      const result = accountNumberSchema.safeParse(10000000);
      expect(result.success).toBe(false);
    });

    it("rejects NaN", () => {
      const result = accountNumberSchema.safeParse(NaN);
      expect(result.success).toBe(false);
    });
  });
});

describe("accountFormSchema", () => {
  const validForm = { accountNumber: 42, name: "Test" };

  describe("name field validation", () => {
    it("accepts a normal name", () => {
      const result = accountFormSchema.safeParse({
        ...validForm,
        name: "John",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a single character name", () => {
      const result = accountFormSchema.safeParse({ ...validForm, name: "A" });
      expect(result.success).toBe(true);
    });

    it("accepts a name at max length (100 characters)", () => {
      const result = accountFormSchema.safeParse({
        ...validForm,
        name: "a".repeat(100),
      });
      expect(result.success).toBe(true);
    });

    it("rejects an empty name", () => {
      const result = accountFormSchema.safeParse({ ...validForm, name: "" });
      expect(result.success).toBe(false);
    });

    it("rejects a whitespace-only name", () => {
      const result = accountFormSchema.safeParse({ ...validForm, name: "   " });
      expect(result.success).toBe(false);
    });

    it("rejects a name exceeding max length (101 characters)", () => {
      const result = accountFormSchema.safeParse({
        ...validForm,
        name: "a".repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("address and telephone optionality", () => {
    it("accepts a form with address and telephone omitted", () => {
      const result = accountFormSchema.safeParse({
        accountNumber: 42,
        name: "Test",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.address).toBe("");
        expect(result.data.telephone).toBe("");
      }
    });

    it("rejects address exceeding 500 characters", () => {
      const result = accountFormSchema.safeParse({
        ...validForm,
        address: "a".repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it("rejects telephone exceeding 30 characters", () => {
      const result = accountFormSchema.safeParse({
        ...validForm,
        telephone: "a".repeat(31),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("full valid form submissions", () => {
    it("accepts a minimal valid form", () => {
      const result = accountFormSchema.safeParse({
        accountNumber: 42,
        name: "Test",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a full valid form with all fields", () => {
      const result = accountFormSchema.safeParse({
        accountNumber: 1,
        name: "Test",
        address: "123 Main",
        telephone: "555-0100",
      });
      expect(result.success).toBe(true);
    });
  });
});
