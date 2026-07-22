import { describe, it, expect } from "vitest";
import {
  mapConsignCloudSale,
  buildSaleKeys,
  buildLineItemSk,
} from "../../src/import/sale-mapper";
import type {
  ConsignCloudSale,
  ConsignCloudLineItem,
} from "../../src/import/sale-consigncloud-client";

function baseValidSale(
  overrides?: Partial<
    ConsignCloudSale & { line_items?: ConsignCloudLineItem[] }
  >,
): ConsignCloudSale & { line_items?: ConsignCloudLineItem[] } {
  return {
    id: "sale-uuid-001",
    number: "1234",
    status: "finalized",
    subtotal: 5000,
    total: 5400,
    store_portion: 2700,
    consignor_portion: 2700,
    cogs: 2700,
    change: 0,
    memo: "Test sale memo",
    cashier: { id: "cashier-001", name: "Jane Doe" },
    created: "2026-03-10T14:30:00.000Z",
    finalized: "2026-03-10T15:00:00.000Z",
    voided: null,
    parked: null,
    refunded_amount: 0,
    cash_rounding_adjustment: 0,
    line_item_count: 2,
    notes: [],
    gift_cards: [],
    customer: null,
    register: null,
    register_report: null,
    pending_swipe: null,
    line_items: [
      {
        id: "li-001",
        item: {
          id: "item-uuid-001",
          image: null,
          quantity: 1,
          title: "Shirt",
          sku: "000001",
        },
        unit_price: 2500,
        consignor_portion: 1250,
        store_portion: 1250,
        split_price: 2500,
        split: 0.5,
        cost: 0,
        taxed_price: 2500,
        tax_exempt: false,
        days_on_shelf: 10,
        quantity: 1,
        refunded_quantity: 0,
        sale: "sale-uuid-001",
        created: "2026-03-10T14:30:00.000Z",
        discounts: [],
        surcharges: [],
        taxes: [],
        applied_discounts: [],
        applied_surcharges: [],
        applied_taxes: [],
      },
      {
        id: "li-002",
        item: {
          id: "item-uuid-002",
          image: null,
          quantity: 1,
          title: "Pants",
          sku: "000002",
        },
        unit_price: 2500,
        consignor_portion: 1450,
        store_portion: 1050,
        split_price: 2500,
        split: 0.58,
        cost: 0,
        taxed_price: 2500,
        tax_exempt: false,
        days_on_shelf: 5,
        quantity: 1,
        refunded_quantity: 0,
        sale: "sale-uuid-001",
        created: "2026-03-10T14:30:00.000Z",
        discounts: [],
        surcharges: [],
        taxes: [],
        applied_discounts: [
          { id: "d1", amount: 100, level: "item", discount: "disc-001" },
        ],
        applied_surcharges: [],
        applied_taxes: [
          {
            id: "t1",
            amount: 200,
            level: "item",
            tax: "tax-001",
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("sale-mapper", () => {
  describe("mapping with all fields present", () => {
    it("maps a full valid finalized sale correctly", () => {
      const sale = baseValidSale();
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.sourceId).toBe("sale-uuid-001");
        expect(result.mapped.number).toBe(1234);
        expect(result.mapped.status).toBe("finalized");
        expect(result.mapped.subtotal).toBe(5000);
        expect(result.mapped.total).toBe(5400);
        expect(result.mapped.storePortion).toBe(2700);
        expect(result.mapped.cogs).toBe(2700);
        expect(result.mapped.change).toBe(0);
        expect(result.mapped.memo).toBe("Test sale memo");
        expect(result.mapped.refundedAmount).toBe(0);
        expect(result.mapped.cashRoundingAdjustment).toBe(0);
        expect(result.mapped.lineItemCount).toBe(2);
        expect(result.mapped.finalizedAt).toBe("2026-03-10T15:00:00.000Z");
        expect(result.mapped.voidedAt).toBeNull();
        expect(result.mapped.parkedAt).toBeNull();
        expect(result.mapped.createdAt).toBe("2026-03-10T14:30:00.000Z");
        expect(result.lineItems).toHaveLength(2);
      }
    });

    it("maps line items with all new fields", () => {
      const sale = baseValidSale();
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.lineItems[0]).toEqual({
          sourceId: "li-001",
          itemSourceId: "item-uuid-001",
          itemSku: "000001",
          itemTitle: "Shirt",
          salePrice: 2500,
          consignorPortion: 1250,
          storePortion: 1250,
          split: 0.5,
          quantity: 1,
          daysOnShelf: 10,
          taxedPrice: 2500,
          taxExempt: false,
          refundedQuantity: 0,
          totalTax: 0,
          discount: 0,
          createdAt: "2026-03-10T14:30:00.000Z",
        });
        expect(result.lineItems[1]).toEqual({
          sourceId: "li-002",
          itemSourceId: "item-uuid-002",
          itemSku: "000002",
          itemTitle: "Pants",
          salePrice: 2500,
          consignorPortion: 1450,
          storePortion: 1050,
          split: 0.58,
          quantity: 1,
          daysOnShelf: 5,
          taxedPrice: 2500,
          taxExempt: false,
          refundedQuantity: 0,
          totalTax: 200,
          discount: 100,
          createdAt: "2026-03-10T14:30:00.000Z",
        });
      }
    });
  });

  describe("all sale statuses are mapped", () => {
    it("maps an open sale", () => {
      const sale = baseValidSale({
        status: "open",
        finalized: null,
        voided: null,
      });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.status).toBe("open");
        expect(result.mapped.finalizedAt).toBeNull();
        expect(result.mapped.voidedAt).toBeNull();
      }
    });

    it("maps a voided sale with voidedAt populated", () => {
      const sale = baseValidSale({
        status: "voided",
        finalized: "2026-03-10T15:00:00.000Z",
        voided: "2026-03-11T08:00:00.000Z",
      });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.status).toBe("voided");
        expect(result.mapped.voidedAt).toBe("2026-03-11T08:00:00.000Z");
        expect(result.mapped.finalizedAt).toBe("2026-03-10T15:00:00.000Z");
      }
    });

    it("maps a parked sale with parkedAt populated", () => {
      const sale = baseValidSale({
        status: "open",
        finalized: null,
        voided: null,
        parked: "2026-03-10T12:00:00.000Z",
      });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.parkedAt).toBe("2026-03-10T12:00:00.000Z");
      }
    });
  });

  describe("cogs mapping", () => {
    it("maps cogs from sale.cogs when present", () => {
      const sale = baseValidSale({ cogs: 3000, consignor_portion: 2700 });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.cogs).toBe(3000);
      }
    });

    it("falls back to consignor_portion when cogs is missing", () => {
      const sale = baseValidSale({ consignor_portion: 2700 });
      // Simulate missing cogs by casting
      const saleWithNoCogs = {
        ...sale,
        cogs: undefined,
      } as unknown as ConsignCloudSale & {
        line_items?: ConsignCloudLineItem[];
      };
      const result = mapConsignCloudSale(saleWithNoCogs);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.cogs).toBe(2700);
      }
    });
  });

  describe("new sale-level fields", () => {
    it("maps refundedAmount correctly", () => {
      const sale = baseValidSale({ refunded_amount: 1500 });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.refundedAmount).toBe(1500);
      }
    });

    it("maps cashRoundingAdjustment correctly", () => {
      const sale = baseValidSale({ cash_rounding_adjustment: -2 });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.cashRoundingAdjustment).toBe(-2);
      }
    });

    it("maps lineItemCount correctly", () => {
      const sale = baseValidSale({ line_item_count: 5 });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.lineItemCount).toBe(5);
      }
    });
  });

  describe("sale number parsing", () => {
    it("parses number string to integer", () => {
      const sale = baseValidSale({ number: "42" });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.number).toBe(42);
      }
    });

    it("fails when number is not a valid integer", () => {
      const sale = baseValidSale({ number: "abc" });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("number");
      }
    });
  });

  describe("line item totalTax derived from applied_taxes", () => {
    it("sums multiple applied_taxes amounts", () => {
      const sale = baseValidSale({
        line_items: [
          {
            id: "li-tax",
            item: { id: "item-1", title: "Taxed Item", sku: "TAX01" },
            unit_price: 1000,
            consignor_portion: 500,
            store_portion: 500,
            split_price: 1000,
            split: 0.5,
            cost: 0,
            taxed_price: 1150,
            tax_exempt: false,
            days_on_shelf: 1,
            quantity: 1,
            refunded_quantity: 0,
            sale: "sale-uuid-001",
            created: "2026-03-10T14:30:00.000Z",
            discounts: [],
            surcharges: [],
            taxes: [],
            applied_discounts: [],
            applied_surcharges: [],
            applied_taxes: [
              { id: "t1", amount: 100, level: "item", tax: "tax-001" },
              { id: "t2", amount: 50, level: "item", tax: "tax-002" },
            ],
          },
        ],
      });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.lineItems[0].totalTax).toBe(150);
      }
    });
  });

  describe("line item sourceId and item fields", () => {
    it("maps sourceId from item.id", () => {
      const sale = baseValidSale();
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.lineItems[0].sourceId).toBe("li-001");
        expect(result.lineItems[0].itemSourceId).toBe("item-uuid-001");
      }
    });

    it("maps itemSku and itemTitle from item object", () => {
      const sale = baseValidSale();
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.lineItems[0].itemSku).toBe("000001");
        expect(result.lineItems[0].itemTitle).toBe("Shirt");
      }
    });

    it("handles missing item fields gracefully", () => {
      const sale = baseValidSale({
        line_items: [
          {
            id: "li-no-item",
            item: { id: "item-bare" },
            unit_price: 500,
            consignor_portion: 250,
            store_portion: 250,
            split_price: 500,
            split: 0.5,
            cost: 0,
            taxed_price: 500,
            tax_exempt: true,
            days_on_shelf: 0,
            quantity: 1,
            refunded_quantity: 0,
            sale: "sale-uuid-001",
            created: "2026-03-10T14:30:00.000Z",
            discounts: [],
            surcharges: [],
            taxes: [],
            applied_discounts: [],
            applied_surcharges: [],
            applied_taxes: [],
          },
        ],
      });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.lineItems[0].itemSourceId).toBe("item-bare");
        expect(result.lineItems[0].itemSku).toBeNull();
        expect(result.lineItems[0].itemTitle).toBeNull();
        expect(result.lineItems[0].taxExempt).toBe(true);
      }
    });
  });

  describe("null memo handling", () => {
    it("maps null memo to null in the output", () => {
      const sale = baseValidSale({ memo: null });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.memo).toBeNull();
      }
    });
  });

  describe("null cashier handling", () => {
    it("does not crash when cashier is null", () => {
      const sale = baseValidSale({ cashier: null });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.sourceId).toBe("sale-uuid-001");
      }
    });
  });

  describe("empty line items array", () => {
    it("maps empty line_items to empty lineItems array", () => {
      const sale = baseValidSale({ line_items: [] });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.lineItems).toEqual([]);
      }
    });
  });

  describe("buildSaleKeys zero-padding", () => {
    it("zero-pads sale number 42 to 7 digits (0000042)", () => {
      const keys = buildSaleKeys("test-uuid", 42);

      expect(keys.PK).toBe("SALE#test-uuid");
      expect(keys.SK).toBe("METADATA");
      expect(keys.GSI1PK).toBe("SALES");
      expect(keys.GSI1SK).toBe("SALE#0000042");
    });

    it("zero-pads sale number 1 to 7 digits (0000001)", () => {
      const keys = buildSaleKeys("uuid-abc", 1);

      expect(keys.GSI1SK).toBe("SALE#0000001");
    });

    it("does not pad a 7-digit number (9999999)", () => {
      const keys = buildSaleKeys("uuid-xyz", 9999999);

      expect(keys.GSI1SK).toBe("SALE#9999999");
    });

    it("handles number 0 correctly (0000000)", () => {
      const keys = buildSaleKeys("uuid-zero", 0);

      expect(keys.GSI1SK).toBe("SALE#0000000");
    });
  });

  describe("buildLineItemSk zero-padding", () => {
    it("zero-pads index 0 to 4 digits (LINE_ITEM#0000)", () => {
      expect(buildLineItemSk(0)).toBe("LINE_ITEM#0000");
    });

    it("zero-pads index 999 to 4 digits (LINE_ITEM#0999)", () => {
      expect(buildLineItemSk(999)).toBe("LINE_ITEM#0999");
    });

    it("zero-pads index 1 to 4 digits (LINE_ITEM#0001)", () => {
      expect(buildLineItemSk(1)).toBe("LINE_ITEM#0001");
    });

    it("does not pad a 4-digit index (LINE_ITEM#9999)", () => {
      expect(buildLineItemSk(9999)).toBe("LINE_ITEM#9999");
    });
  });

  describe("missing required fields", () => {
    it("returns failure when id is missing", () => {
      const sale = baseValidSale({ id: "" });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("id");
      }
    });

    it("returns failure when number is missing", () => {
      const sale = baseValidSale({ number: "" });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("number");
      }
    });

    it("returns failure when created is missing", () => {
      const sale = baseValidSale({ created: "" });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("created");
      }
    });
  });
});
