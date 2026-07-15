import { describe, it, expect } from "vitest";
import { validateSaleUpdate } from "../sale-update-validation";

describe("validateSaleUpdate", () => {
  describe("body-level validation", () => {
    it("returns error when body is null", () => {
      const result = validateSaleUpdate(null);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toEqual([
          { field: "body", message: "Request body must be an object" },
        ]);
      }
    });

    it("returns error when body is not an object", () => {
      const result = validateSaleUpdate("not an object");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toEqual([
          { field: "body", message: "Request body must be an object" },
        ]);
      }
    });

    it("returns error when body is undefined", () => {
      const result = validateSaleUpdate(undefined);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toEqual([
          { field: "body", message: "Request body must be an object" },
        ]);
      }
    });
  });

  describe("optional field: status", () => {
    it("returns error when status is invalid", () => {
      const result = validateSaleUpdate({ status: "pending" });
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
        const result = validateSaleUpdate({ status });
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.data.status).toBe(status);
        }
      }
    });

    it("accepts missing status (all fields optional)", () => {
      const result = validateSaleUpdate({});
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.status).toBeUndefined();
      }
    });
  });

  describe("optional field: cashierId", () => {
    it("returns error when cashierId is not a string", () => {
      const result = validateSaleUpdate({ cashierId: 123 });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContainEqual({
          field: "cashierId",
          message: "cashierId must be a string",
        });
      }
    });

    it("returns error when cashierId is empty", () => {
      const result = validateSaleUpdate({ cashierId: "" });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContainEqual({
          field: "cashierId",
          message: "cashierId must not be empty",
        });
      }
    });

    it("accepts valid cashierId", () => {
      const result = validateSaleUpdate({ cashierId: "emp-123" });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.cashierId).toBe("emp-123");
      }
    });
  });

  describe("optional numeric fields", () => {
    const numericFields = ["subtotal", "total", "storePortion", "consignorPortion", "change"];

    for (const field of numericFields) {
      it(`returns error when ${field} is not a number`, () => {
        const result = validateSaleUpdate({ [field]: "not-a-number" });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field,
            message: `${field} must be a number`,
          });
        }
      });

      it(`accepts ${field} when it is a valid number`, () => {
        const result = validateSaleUpdate({ [field]: 42.5 });
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.data[field as keyof typeof result.data]).toBe(42.5);
        }
      });

      it(`ignores ${field} when undefined`, () => {
        const result = validateSaleUpdate({});
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.data[field as keyof typeof result.data]).toBeUndefined();
        }
      });

      it(`ignores ${field} when null`, () => {
        const result = validateSaleUpdate({ [field]: null });
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.data[field as keyof typeof result.data]).toBeUndefined();
        }
      });
    }
  });

  describe("optional string fields", () => {
    it("returns error when memo is not a string", () => {
      const result = validateSaleUpdate({ memo: 123 });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContainEqual({
          field: "memo",
          message: "memo must be a string",
        });
      }
    });

    it("accepts memo when it is a string", () => {
      const result = validateSaleUpdate({ memo: "test memo" });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.memo).toBe("test memo");
      }
    });

    it("returns error when finalizedAt is not a string", () => {
      const result = validateSaleUpdate({ finalizedAt: 12345 });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContainEqual({
          field: "finalizedAt",
          message: "finalizedAt must be a string",
        });
      }
    });

    it("accepts finalizedAt when it is a string", () => {
      const result = validateSaleUpdate({ finalizedAt: "2024-01-15T10:00:00Z" });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.finalizedAt).toBe("2024-01-15T10:00:00Z");
      }
    });

    it("returns error when voidedAt is not a string", () => {
      const result = validateSaleUpdate({ voidedAt: true });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContainEqual({
          field: "voidedAt",
          message: "voidedAt must be a string",
        });
      }
    });

    it("accepts voidedAt when it is a string", () => {
      const result = validateSaleUpdate({ voidedAt: "2024-01-15T10:00:00Z" });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.voidedAt).toBe("2024-01-15T10:00:00Z");
      }
    });
  });

  describe("error collection (no fail-fast)", () => {
    it("collects all errors when multiple fields are invalid", () => {
      const result = validateSaleUpdate({
        status: "invalid",
        cashierId: "",
        subtotal: "bad",
        total: true,
        memo: 999,
        finalizedAt: 123,
        voidedAt: false,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.length).toBe(7);
        const fields = result.errors.map((e) => e.field);
        expect(fields).toContain("status");
        expect(fields).toContain("cashierId");
        expect(fields).toContain("subtotal");
        expect(fields).toContain("total");
        expect(fields).toContain("memo");
        expect(fields).toContain("finalizedAt");
        expect(fields).toContain("voidedAt");
      }
    });
  });

  describe("valid input", () => {
    it("returns valid result with empty object (all fields optional)", () => {
      const result = validateSaleUpdate({});
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data).toEqual({});
      }
    });

    it("returns valid result with all fields populated", () => {
      const result = validateSaleUpdate({
        status: "finalized",
        cashierId: "emp-456",
        subtotal: 100.0,
        total: 108.0,
        storePortion: 54.0,
        consignorPortion: 54.0,
        change: 2.0,
        memo: "Cash sale",
        finalizedAt: "2024-01-15T10:00:00Z",
        voidedAt: "2024-01-16T10:00:00Z",
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
          finalizedAt: "2024-01-15T10:00:00Z",
          voidedAt: "2024-01-16T10:00:00Z",
        });
      }
    });

    it("returns valid result with only some fields provided", () => {
      const result = validateSaleUpdate({
        status: "voided",
        voidedAt: "2024-01-16T10:00:00Z",
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data).toEqual({
          status: "voided",
          voidedAt: "2024-01-16T10:00:00Z",
        });
      }
    });
  });
});
