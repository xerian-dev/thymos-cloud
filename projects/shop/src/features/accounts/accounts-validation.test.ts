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

  describe("optional fields default to empty string", () => {
    it("accepts a form with optional fields omitted", () => {
      const result = accountFormSchema.safeParse({
        accountNumber: 42,
        name: "Test",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.street).toBe("");
        expect(result.data.place).toBe("");
        expect(result.data.postcode).toBe("");
        expect(result.data.canton).toBe("");
        expect(result.data.email).toBe("");
        expect(result.data.telephone).toBe("");
      }
    });

    it("rejects street exceeding 200 characters", () => {
      const result = accountFormSchema.safeParse({
        ...validForm,
        street: "a".repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it("rejects place exceeding 100 characters", () => {
      const result = accountFormSchema.safeParse({
        ...validForm,
        place: "a".repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it("rejects postcode exceeding 20 characters", () => {
      const result = accountFormSchema.safeParse({
        ...validForm,
        postcode: "a".repeat(21),
      });
      expect(result.success).toBe(false);
    });

    it("rejects canton exceeding 50 characters", () => {
      const result = accountFormSchema.safeParse({
        ...validForm,
        canton: "a".repeat(51),
      });
      expect(result.success).toBe(false);
    });

    it("rejects email exceeding 254 characters", () => {
      const result = accountFormSchema.safeParse({
        ...validForm,
        email: "a".repeat(255),
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

  describe("address field is not accepted", () => {
    it("does not include address in parsed output even if provided", () => {
      const result = accountFormSchema.safeParse({
        accountNumber: 42,
        name: "Test",
        address: "123 Old Street, City",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect("address" in result.data).toBe(false);
      }
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
        street: "123 Main",
        place: "Zurich",
        postcode: "8001",
        canton: "ZH",
        email: "test@example.com",
        telephone: "555-0100",
      });
      expect(result.success).toBe(true);
    });
  });
});
