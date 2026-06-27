import { describe, it, expect } from "vitest";
import { validateCreateAccount } from "../src/validation";

describe("validation", () => {
  describe("validateCreateAccount", () => {
    const validInput = {
      accountNumber: 42,
      name: "Jane Smith",
      address: "123 Main St",
      telephone: "555-0100",
    };

    it("accepts a valid input", () => {
      const result = validateCreateAccount(validInput);
      expect(result).toEqual({ valid: true, data: validInput });
    });

    it("accepts empty address", () => {
      const result = validateCreateAccount({ ...validInput, address: "" });
      expect(result.valid).toBe(true);
    });

    it("accepts empty telephone", () => {
      const result = validateCreateAccount({ ...validInput, telephone: "" });
      expect(result.valid).toBe(true);
    });

    it("rejects null body", () => {
      const result = validateCreateAccount(null);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0].field).toBe("body");
      }
    });

    it("rejects non-object body", () => {
      const result = validateCreateAccount("string");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0].field).toBe("body");
      }
    });

    describe("accountNumber validation", () => {
      it("rejects non-number accountNumber", () => {
        const result = validateCreateAccount({
          ...validInput,
          accountNumber: "42",
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "accountNumber",
            message: "accountNumber must be a number",
          });
        }
      });

      it("rejects fractional accountNumber", () => {
        const result = validateCreateAccount({
          ...validInput,
          accountNumber: 3.5,
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "accountNumber",
            message: "accountNumber must be an integer",
          });
        }
      });

      it("rejects accountNumber less than 1", () => {
        const result = validateCreateAccount({
          ...validInput,
          accountNumber: 0,
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "accountNumber",
            message: "accountNumber must be between 1 and 9999999",
          });
        }
      });

      it("rejects accountNumber greater than 9999999", () => {
        const result = validateCreateAccount({
          ...validInput,
          accountNumber: 10000000,
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "accountNumber",
            message: "accountNumber must be between 1 and 9999999",
          });
        }
      });

      it("accepts accountNumber of 1", () => {
        const result = validateCreateAccount({
          ...validInput,
          accountNumber: 1,
        });
        expect(result.valid).toBe(true);
      });

      it("accepts accountNumber of 9999999", () => {
        const result = validateCreateAccount({
          ...validInput,
          accountNumber: 9999999,
        });
        expect(result.valid).toBe(true);
      });
    });

    describe("name validation", () => {
      it("rejects non-string name", () => {
        const result = validateCreateAccount({ ...validInput, name: 123 });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "name",
            message: "name must be a string",
          });
        }
      });

      it("rejects empty string name", () => {
        const result = validateCreateAccount({ ...validInput, name: "" });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "name",
            message: "name must be between 1 and 100 characters",
          });
        }
      });

      it("rejects name exceeding 100 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          name: "a".repeat(101),
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "name",
            message: "name must be between 1 and 100 characters",
          });
        }
      });

      it("rejects name with only whitespace", () => {
        const result = validateCreateAccount({
          ...validInput,
          name: "   ",
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "name",
            message: "name must contain at least one non-whitespace character",
          });
        }
      });

      it("accepts name with exactly 100 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          name: "a".repeat(100),
        });
        expect(result.valid).toBe(true);
      });

      it("accepts single character name", () => {
        const result = validateCreateAccount({ ...validInput, name: "A" });
        expect(result.valid).toBe(true);
      });
    });

    describe("address validation", () => {
      it("rejects non-string address", () => {
        const result = validateCreateAccount({ ...validInput, address: 123 });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "address",
            message: "address must be a string",
          });
        }
      });

      it("rejects address exceeding 500 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          address: "a".repeat(501),
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "address",
            message: "address must be at most 500 characters",
          });
        }
      });

      it("accepts address with exactly 500 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          address: "a".repeat(500),
        });
        expect(result.valid).toBe(true);
      });
    });

    describe("telephone validation", () => {
      it("rejects non-string telephone", () => {
        const result = validateCreateAccount({
          ...validInput,
          telephone: 5550100,
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "telephone",
            message: "telephone must be a string",
          });
        }
      });

      it("rejects telephone exceeding 30 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          telephone: "1".repeat(31),
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "telephone",
            message: "telephone must be at most 30 characters",
          });
        }
      });

      it("accepts telephone with exactly 30 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          telephone: "1".repeat(30),
        });
        expect(result.valid).toBe(true);
      });
    });

    describe("multiple errors", () => {
      it("returns all validation errors at once", () => {
        const result = validateCreateAccount({
          accountNumber: "not-a-number",
          name: "",
          address: 123,
          telephone: 456,
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors.length).toBe(4);
        }
      });
    });
  });
});
