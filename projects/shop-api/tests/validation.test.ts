import { describe, it, expect } from "vitest";
import { validateCreateAccount } from "../src/validation";

describe("validation", () => {
  describe("validateCreateAccount", () => {
    const validInput = {
      accountNumber: 42,
      name: "Jane Smith",
    };

    it("accepts a valid input with only required fields", () => {
      const result = validateCreateAccount(validInput);
      expect(result).toEqual({
        valid: true,
        data: {
          accountNumber: 42,
          name: "Jane Smith",
          street: "",
          place: "",
          postcode: "",
          canton: "",
          email: "",
          telephone: "",
        },
      });
    });

    it("accepts a valid input with all optional fields", () => {
      const input = {
        ...validInput,
        street: "123 Main St",
        place: "Zurich",
        postcode: "8001",
        canton: "ZH",
        email: "jane@example.com",
        telephone: "555-0100",
      };
      const result = validateCreateAccount(input);
      expect(result).toEqual({
        valid: true,
        data: input,
      });
    });

    it("accepts empty optional fields", () => {
      const input = {
        ...validInput,
        street: "",
        place: "",
        postcode: "",
        canton: "",
        email: "",
        telephone: "",
      };
      const result = validateCreateAccount(input);
      expect(result.valid).toBe(true);
    });

    it("accepts when optional fields are omitted (undefined)", () => {
      const result = validateCreateAccount(validInput);
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

    describe("street validation", () => {
      it("rejects non-string street", () => {
        const result = validateCreateAccount({ ...validInput, street: 123 });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "street",
            message: "street must be a string",
          });
        }
      });

      it("rejects street exceeding 200 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          street: "a".repeat(201),
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "street",
            message: "street must be at most 200 characters",
          });
        }
      });

      it("accepts street with exactly 200 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          street: "a".repeat(200),
        });
        expect(result.valid).toBe(true);
      });
    });

    describe("place validation", () => {
      it("rejects non-string place", () => {
        const result = validateCreateAccount({ ...validInput, place: 123 });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "place",
            message: "place must be a string",
          });
        }
      });

      it("rejects place exceeding 100 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          place: "a".repeat(101),
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "place",
            message: "place must be at most 100 characters",
          });
        }
      });

      it("accepts place with exactly 100 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          place: "a".repeat(100),
        });
        expect(result.valid).toBe(true);
      });
    });

    describe("postcode validation", () => {
      it("rejects non-string postcode", () => {
        const result = validateCreateAccount({ ...validInput, postcode: 8001 });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "postcode",
            message: "postcode must be a string",
          });
        }
      });

      it("rejects postcode exceeding 20 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          postcode: "1".repeat(21),
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "postcode",
            message: "postcode must be at most 20 characters",
          });
        }
      });

      it("accepts postcode with exactly 20 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          postcode: "1".repeat(20),
        });
        expect(result.valid).toBe(true);
      });
    });

    describe("canton validation", () => {
      it("rejects non-string canton", () => {
        const result = validateCreateAccount({ ...validInput, canton: 42 });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "canton",
            message: "canton must be a string",
          });
        }
      });

      it("rejects canton exceeding 50 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          canton: "a".repeat(51),
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "canton",
            message: "canton must be at most 50 characters",
          });
        }
      });

      it("accepts canton with exactly 50 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          canton: "a".repeat(50),
        });
        expect(result.valid).toBe(true);
      });
    });

    describe("email validation", () => {
      it("rejects non-string email", () => {
        const result = validateCreateAccount({ ...validInput, email: 123 });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "email",
            message: "email must be a string",
          });
        }
      });

      it("rejects email exceeding 254 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          email: "a".repeat(255),
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: "email",
            message: "email must be at most 254 characters",
          });
        }
      });

      it("accepts email with exactly 254 characters", () => {
        const result = validateCreateAccount({
          ...validInput,
          email: "a".repeat(254),
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
          street: 123,
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
