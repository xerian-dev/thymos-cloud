import { describe, it, expect } from "vitest";
import { isFinalizedSale, mapSale } from "./sale-mapper";

describe("isFinalizedSale", () => {
  it("returns true when finalized is non-null and voided is null/undefined", () => {
    expect(isFinalizedSale({ finalized: "2024-01-15T10:00:00Z" })).toBe(true);
    expect(
      isFinalizedSale({ finalized: "2024-01-15T10:00:00Z", voided: null }),
    ).toBe(true);
  });

  it("returns false when finalized is null", () => {
    expect(isFinalizedSale({ finalized: null })).toBe(false);
    expect(isFinalizedSale({})).toBe(false);
  });

  it("returns false when voided is non-null", () => {
    expect(
      isFinalizedSale({
        finalized: "2024-01-15T10:00:00Z",
        voided: "2024-01-16T10:00:00Z",
      }),
    ).toBe(false);
  });

  it("returns false when both finalized is null and voided is non-null", () => {
    expect(
      isFinalizedSale({ finalized: null, voided: "2024-01-16T10:00:00Z" }),
    ).toBe(false);
  });
});

describe("mapSale", () => {
  const validSale: Record<string, unknown> = {
    id: "sale-uuid-123",
    number: "1042",
    created: "2024-01-15T09:00:00Z",
    finalized: "2024-01-15T10:30:00Z",
    subtotal: 5000,
    total: 5400,
    store_portion: 2700,
    consignor_portion: 2700,
    change: 0,
    memo: "Test sale",
    line_items: [
      {
        unit_price: 2500,
        consignor_portion: 1250,
        store_portion: 1250,
        quantity: 1,
        days_on_shelf: 14,
        applied_discounts: [
          { id: "d1", amount: 100, level: "item", discount: "disc-1" },
          { id: "d2", amount: 50, level: "item", discount: "disc-2" },
        ],
      },
      {
        unit_price: 2500,
        consignor_portion: 1450,
        store_portion: 1050,
        quantity: 2,
        days_on_shelf: 7,
        applied_discounts: [],
      },
    ],
  };

  it("returns success with correctly mapped sale fields", () => {
    const result = mapSale(validSale);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.sale).toEqual({
      sourceId: "sale-uuid-123",
      sourceNumber: "1042",
      status: "finalized",
      subtotal: 5000,
      total: 5400,
      storePortion: 2700,
      consignorPortion: 2700,
      change: 0,
      memo: "Test sale",
      finalizedAt: "2024-01-15T10:30:00Z",
      voidedAt: null,
      createdAt: "2024-01-15T09:00:00Z",
    });
  });

  it("maps line items with summed discounts", () => {
    const result = mapSale(validSale);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.lineItems).toHaveLength(2);
    expect(result.lineItems[0]).toEqual({
      salePrice: 2500,
      discount: 150,
      consignorPortion: 1250,
      storePortion: 1250,
      quantity: 1,
      daysOnShelf: 14,
    });
    expect(result.lineItems[1]).toEqual({
      salePrice: 2500,
      discount: 0,
      consignorPortion: 1450,
      storePortion: 1050,
      quantity: 2,
      daysOnShelf: 7,
    });
  });

  it("returns failure for non-finalized sale", () => {
    const result = mapSale({ ...validSale, finalized: null });
    expect(result).toEqual({
      success: false,
      error: "Sale is not finalized or is voided",
    });
  });

  it("returns failure for voided sale", () => {
    const result = mapSale({ ...validSale, voided: "2024-01-16T10:00:00Z" });
    expect(result).toEqual({
      success: false,
      error: "Sale is not finalized or is voided",
    });
  });

  it("returns failure when id is missing", () => {
    const { id: _, ...noId } = validSale;
    const result = mapSale(noId);
    expect(result).toEqual({
      success: false,
      error: "Missing required field: id",
    });
  });

  it("returns failure when number is missing", () => {
    const { number: _, ...noNumber } = validSale;
    const result = mapSale(noNumber);
    expect(result).toEqual({
      success: false,
      error: "Missing required field: number",
    });
  });

  it("returns failure when created is missing", () => {
    const { created: _, ...noCreated } = validSale;
    const result = mapSale(noCreated);
    expect(result).toEqual({
      success: false,
      error: "Missing required field: created",
    });
  });

  it("handles missing line_items gracefully", () => {
    const { line_items: _, ...noLineItems } = validSale;
    const result = mapSale(noLineItems);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.lineItems).toEqual([]);
  });

  it("handles null memo", () => {
    const result = mapSale({ ...validSale, memo: null });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.sale.memo).toBeNull();
  });

  it("defaults numeric fields to 0 when missing", () => {
    const minimal: Record<string, unknown> = {
      id: "id-1",
      number: "100",
      created: "2024-01-01T00:00:00Z",
      finalized: "2024-01-01T01:00:00Z",
    };
    const result = mapSale(minimal);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.sale.subtotal).toBe(0);
    expect(result.sale.total).toBe(0);
    expect(result.sale.storePortion).toBe(0);
    expect(result.sale.consignorPortion).toBe(0);
    expect(result.sale.change).toBe(0);
  });

  it("handles line items with missing applied_discounts", () => {
    const saleWithBareLineItems: Record<string, unknown> = {
      ...validSale,
      line_items: [
        {
          unit_price: 1000,
          consignor_portion: 500,
          store_portion: 500,
          quantity: 1,
          days_on_shelf: 3,
        },
      ],
    };
    const result = mapSale(saleWithBareLineItems);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.lineItems[0].discount).toBe(0);
  });
});
