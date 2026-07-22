import { describe, it, expect } from "vitest";
import { mapSale } from "./sale-mapper";

describe("mapSale", () => {
  const validSale: Record<string, unknown> = {
    id: "sale-uuid-123",
    number: "1042",
    status: "finalized",
    created: "2024-01-15T09:00:00Z",
    finalized: "2024-01-15T10:30:00Z",
    voided: null,
    parked: null,
    subtotal: 5000,
    total: 5400,
    store_portion: 2700,
    cogs: 2700,
    consignor_portion: 2700,
    change: 0,
    memo: "Test sale",
    refunded_amount: 150,
    cash_rounding_adjustment: 5,
    line_item_count: 2,
    line_items: [
      {
        id: "li-001",
        item: { id: "item-cc-1", sku: "SKU-001", title: "Vintage Shirt" },
        unit_price: 2500,
        consignor_portion: 1250,
        store_portion: 1250,
        split: 0.5,
        quantity: 1,
        days_on_shelf: 14,
        taxed_price: 2625,
        tax_exempt: false,
        refunded_quantity: 0,
        created: "2024-01-15T09:00:00Z",
        applied_discounts: [
          { id: "d1", amount: 100, level: "item", discount: "disc-1" },
          { id: "d2", amount: 50, level: "item", discount: "disc-2" },
        ],
        applied_taxes: [{ id: "t1", amount: 125, level: "item", tax: "tax-1" }],
      },
      {
        id: "li-002",
        item: { id: "item-cc-2", sku: "SKU-002", title: "Blue Jeans" },
        unit_price: 2500,
        consignor_portion: 1450,
        store_portion: 1050,
        split: 0.58,
        quantity: 2,
        days_on_shelf: 7,
        taxed_price: 2600,
        tax_exempt: true,
        refunded_quantity: 1,
        created: "2024-01-15T09:01:00Z",
        applied_discounts: [],
        applied_taxes: [
          { id: "t2", amount: 50, level: "item", tax: "tax-2" },
          { id: "t3", amount: 50, level: "item", tax: "tax-3" },
        ],
      },
    ],
  };

  it("returns success with correctly mapped sale fields for finalized sale", () => {
    const result = mapSale(validSale);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.sale).toEqual({
      sourceId: "sale-uuid-123",
      number: 1042,
      status: "finalized",
      subtotal: 5000,
      total: 5400,
      storePortion: 2700,
      cogs: 2700,
      change: 0,
      memo: "Test sale",
      refundedAmount: 150,
      cashRoundingAdjustment: 5,
      lineItemCount: 2,
      finalizedAt: "2024-01-15T10:30:00Z",
      voidedAt: null,
      parkedAt: null,
      createdAt: "2024-01-15T09:00:00Z",
    });
  });

  it("maps open sales (no finalized-only filter)", () => {
    const openSale = {
      ...validSale,
      status: "open",
      finalized: null,
      voided: null,
      line_items: [],
    };
    const result = mapSale(openSale);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.sale.status).toBe("open");
    expect(result.sale.finalizedAt).toBeNull();
    expect(result.sale.voidedAt).toBeNull();
  });

  it("maps voided sales with voidedAt populated", () => {
    const voidedSale = {
      ...validSale,
      status: "voided",
      finalized: "2024-01-15T10:00:00Z",
      voided: "2024-01-16T08:00:00Z",
      line_items: [],
    };
    const result = mapSale(voidedSale);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.sale.status).toBe("voided");
    expect(result.sale.voidedAt).toBe("2024-01-16T08:00:00Z");
  });

  it("parses number to integer", () => {
    const result = mapSale(validSale);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.sale.number).toBe(1042);
    expect(typeof result.sale.number).toBe("number");
  });

  it("returns failure when number is non-numeric", () => {
    const result = mapSale({ ...validSale, number: "ABC" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("not a valid integer");
  });

  it("maps cogs from raw.cogs", () => {
    const result = mapSale(validSale);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.sale.cogs).toBe(2700);
  });

  it("falls back to consignor_portion when cogs is missing", () => {
    const { cogs: _, ...noCogs } = validSale;
    const result = mapSale(noCogs);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.sale.cogs).toBe(2700); // from consignor_portion
  });

  it("maps line items with all new fields", () => {
    const result = mapSale(validSale);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.lineItems).toHaveLength(2);
    expect(result.lineItems[0]).toEqual({
      sourceId: "li-001",
      itemSourceId: "item-cc-1",
      itemSku: "SKU-001",
      itemTitle: "Vintage Shirt",
      salePrice: 2500,
      consignorPortion: 1250,
      storePortion: 1250,
      split: 0.5,
      quantity: 1,
      daysOnShelf: 14,
      taxedPrice: 2625,
      taxExempt: false,
      refundedQuantity: 0,
      totalTax: 125,
      discount: 150,
      createdAt: "2024-01-15T09:00:00Z",
    });
    expect(result.lineItems[1]).toEqual({
      sourceId: "li-002",
      itemSourceId: "item-cc-2",
      itemSku: "SKU-002",
      itemTitle: "Blue Jeans",
      salePrice: 2500,
      consignorPortion: 1450,
      storePortion: 1050,
      split: 0.58,
      quantity: 2,
      daysOnShelf: 7,
      taxedPrice: 2600,
      taxExempt: true,
      refundedQuantity: 1,
      totalTax: 100,
      discount: 0,
      createdAt: "2024-01-15T09:01:00Z",
    });
  });

  it("line item totalTax is sum of applied_taxes amounts", () => {
    const result = mapSale(validSale);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.lineItems[0].totalTax).toBe(125);
    expect(result.lineItems[1].totalTax).toBe(100);
  });

  it("line item discount is sum of applied_discounts amounts", () => {
    const result = mapSale(validSale);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.lineItems[0].discount).toBe(150);
    expect(result.lineItems[1].discount).toBe(0);
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
      status: "open",
      created: "2024-01-01T00:00:00Z",
    };
    const result = mapSale(minimal);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.sale.subtotal).toBe(0);
    expect(result.sale.total).toBe(0);
    expect(result.sale.storePortion).toBe(0);
    expect(result.sale.cogs).toBe(0);
    expect(result.sale.change).toBe(0);
    expect(result.sale.refundedAmount).toBe(0);
    expect(result.sale.cashRoundingAdjustment).toBe(0);
    expect(result.sale.lineItemCount).toBe(0);
  });

  it("handles line items with missing applied_discounts and applied_taxes", () => {
    const saleWithBareLineItems: Record<string, unknown> = {
      ...validSale,
      line_items: [
        {
          id: "li-bare",
          item: { id: "item-bare", sku: null, title: null },
          unit_price: 1000,
          consignor_portion: 500,
          store_portion: 500,
          split: 0.5,
          quantity: 1,
          days_on_shelf: 3,
          taxed_price: 1050,
          tax_exempt: false,
          refunded_quantity: 0,
          created: "2024-01-01T00:00:00Z",
        },
      ],
    };
    const result = mapSale(saleWithBareLineItems);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.lineItems[0].discount).toBe(0);
    expect(result.lineItems[0].totalTax).toBe(0);
    expect(result.lineItems[0].itemSku).toBeNull();
    expect(result.lineItems[0].itemTitle).toBeNull();
  });

  it("handles line items without item object", () => {
    const saleWithNoItem: Record<string, unknown> = {
      ...validSale,
      line_items: [
        {
          id: "li-no-item",
          unit_price: 1000,
          consignor_portion: 500,
          store_portion: 500,
          split: 0.5,
          quantity: 1,
          days_on_shelf: 3,
          taxed_price: 1050,
          tax_exempt: false,
          refunded_quantity: 0,
          created: "2024-01-01T00:00:00Z",
          applied_discounts: [],
          applied_taxes: [],
        },
      ],
    };
    const result = mapSale(saleWithNoItem);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.lineItems[0].itemSourceId).toBe("");
    expect(result.lineItems[0].itemSku).toBeNull();
    expect(result.lineItems[0].itemTitle).toBeNull();
  });
});
