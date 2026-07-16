import { describe, it, expect } from "vitest";
import { validateSaleInput } from "../sale-validation";

describe("validateSaleInput", () => {
  describe("body-level validation", () => {
    it("returns error when body is null", () => {
      const result = validateSaleInput(null);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toEqual([
          { field: "body", message: "Request body must be an object" },
        ]);
      }
    });

    it("returns error when body is not an object", () => {
      const result = validateSaleInput("not an object");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toEqual([
          { field: "body", message: "Request body must be an object" },
        ]);
      }
    });

    it("returns error when body is undefined", () => {
      const result = validateSaleInput(undefined);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toEqual([
          { field: "body", message: "Request body must be an object" },
        ]);
      }
    });
  });

  describe("required field: status", () => {
    it("returns error when status is missing", () => {
      const result = validateSaleInput({ cashierId: "emp1" });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContainEqual({
          field: "status",
          message: "status must be one of: open, finalized, voided",
        });
      }
    });

    it("returns error when status is invalid", () => {
      const result = validateSaleInput({ status: "pending", cashierId: "emp1" });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContainEqual({
          field: "status",
          message: "status must be one of: open, finalized, voided",
        });
      }
    });

    it("accepts valid status values", () => {
      for (const status of ["open", "finalized", "voided"]) {
        const result = validateSaleInput({ status, cashierId: "emp1" });
        expect(result.valid).toBe(true);
      }
    });
  });

  describe("required field: cashierId", () => {
    it("returns error when cashierId is missing", () => {
      const result = validateSaleInput({ status: "open" });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContainEqual({
          field: "cashierId",
          message: "cashierId must be a string",
        });
      }
    });

    it("returns error when cashierId is empty", () => {
      const result = validateSaleInput({ status: "open", cashierId: "" });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContainEqual({
          field: "cashierId",
          message: "cashierId must not be empty",
        });
      }
    });

    it("returns error when cashierId is not a string", () => {
      const result = validateSaleInput({ status: "open", cashierId: 123 });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContainEqual({
          field: "cashierId",
          message: "cashierId must be a string",
        });
      }
    });
  });

  describe("optional numeric fields", () => {
    const numericFields = ["subtotal", "total", "storePortion", "consignorPortion", "change"];

    for (const field of numericFields) {
      it(`returns error when ${field} is not a number`, () => {
        const result = validateSaleInput({
          status: "open",
          cashierId: "emp1",
          [field]: "not-a-number",
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field,
            message: `${field} must be a number`,
          });
        }
      });

      it(`accepts ${field} when it is a valid number`, () => {
        const result = validateSaleInput({
          status: "open",
          cashierId: "emp1",
          [field]: 42.5,
        });
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.data[field as keyof typeof result.data]).toBe(42.5);
        }
      });

      it(`ignores ${field} when undefined`, () => {
        const result = validateSaleInput({
          status: "open",
          cashierId: "emp1",
        });
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.data[field as keyof typeof result.data]).toBeUndefined();
        }
      });

      it(`ignores ${field} when null`, () => {
        const result = validateSaleInput({
          status: "open",
          cashierId: "emp1",
          [field]: null,
        });
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.data[field as keyof typeof result.data]).toBeUndefined();
        }
      });
    }
  });

  describe("optional string field: memo", () => {
    it("returns error when memo is not a string", () => {
      const result = validateSaleInput({
        status: "open",
        cashierId: "emp1",
        memo: 123,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContainEqual({
          field: "memo",
          message: "memo must be a string",
        });
      }
    });

    it("accepts memo when it is a string", () => {
      const result = validateSaleInput({
        status: "open",
        cashierId: "emp1",
        memo: "test memo",
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.memo).toBe("test memo");
      }
    });

    it("ignores memo when undefined", () => {
      const result = validateSaleInput({
        status: "open",
        cashierId: "emp1",
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.memo).toBeUndefined();
      }
    });
  });

  describe("error collection (no fail-fast)", () => {
    it("collects all errors when multiple fields are invalid", () => {
      const result = validateSaleInput({
        status: "invalid",
        cashierId: "",
        subtotal: "bad",
        total: true,
        memo: 999,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.length).toBe(5);
        const fields = result.errors.map((e) => e.field);
        expect(fields).toContain("status");
        expect(fields).toContain("cashierId");
        expect(fields).toContain("subtotal");
        expect(fields).toContain("total");
        expect(fields).toContain("memo");
      }
    });
  });

  describe("valid input", () => {
    it("returns valid result with minimal required fields", () => {
      const result = validateSaleInput({
        status: "open",
        cashierId: "emp-123",
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data).toEqual({
          status: "open",
          cashierId: "emp-123",
        });
      }
    });

    it("returns valid result with all fields populated", () => {
      const result = validateSaleInput({
        status: "finalized",
        cashierId: "emp-456",
        subtotal: 100.0,
        total: 108.0,
        storePortion: 54.0,
        consignorPortion: 54.0,
        change: 2.0,
        memo: "Cash sale",
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data).toEqual({
          status: "finalized",
          cashierId: "emp-456",
          subtotal: 100.0,
          total: 108.0,
          storePortion: 54.0,
          consignorPortion: 54.0,
          change: 2.0,
          memo: "Cash sale",
        });
      }
    });
  });
});
