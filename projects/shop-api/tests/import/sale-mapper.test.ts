import { describe, it, expect } from "vitest";
import {
  mapConsignCloudSale,
  isFinalizedSale,
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
    change: 0,
    memo: "Test sale memo",
    cashier: { id: "cashier-001", name: "Jane Doe" },
    created: "2026-03-10T14:30:00.000Z",
    finalized: "2026-03-10T15:00:00.000Z",
    voided: null,
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
        applied_taxes: [],
      },
    ],
    ...overrides,
  };
}

describe("sale-mapper edge cases", () => {
  describe("mapping with all fields present", () => {
    it("maps a full valid sale correctly", () => {
      const sale = baseValidSale();
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.sourceId).toBe("sale-uuid-001");
        expect(result.mapped.sourceNumber).toBe("1234");
        expect(result.mapped.status).toBe("finalized");
        expect(result.mapped.subtotal).toBe(5000);
        expect(result.mapped.total).toBe(5400);
        expect(result.mapped.storePortion).toBe(2700);
        expect(result.mapped.consignorPortion).toBe(2700);
        expect(result.mapped.change).toBe(0);
        expect(result.mapped.memo).toBe("Test sale memo");
        expect(result.mapped.finalizedAt).toBe("2026-03-10T15:00:00.000Z");
        expect(result.mapped.voidedAt).toBeNull();
        expect(result.mapped.createdAt).toBe("2026-03-10T14:30:00.000Z");
        expect(result.lineItems).toHaveLength(2);
        expect(result.lineItems[0]).toEqual({
          salePrice: 2500,
          discount: 0,
          consignorPortion: 1250,
          storePortion: 1250,
          quantity: 1,
          daysOnShelf: 10,
        });
        expect(result.lineItems[1]).toEqual({
          salePrice: 2500,
          discount: 100,
          consignorPortion: 1450,
          storePortion: 1050,
          quantity: 1,
          daysOnShelf: 5,
        });
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

  describe("line item with different item references", () => {
    it("handles item object reference correctly", () => {
      const sale = baseValidSale({
        line_items: [
          {
            id: "li-obj",
            item: {
              id: "item-uuid-object",
              image: null,
              quantity: 2,
              title: "Hat",
              sku: "000099",
            },
            unit_price: 2000,
            consignor_portion: 1000,
            store_portion: 1000,
            split_price: 2000,
            split: 0.5,
            cost: 0,
            taxed_price: 2000,
            tax_exempt: false,
            days_on_shelf: 3,
            quantity: 2,
            refunded_quantity: 0,
            sale: "sale-uuid-001",
            created: "2026-03-10T14:30:00.000Z",
            discounts: [],
            surcharges: [],
            taxes: [],
            applied_discounts: [
              { id: "d1", amount: 50, level: "item", discount: "disc-1" },
            ],
            applied_surcharges: [],
            applied_taxes: [],
          },
        ],
      });
      const result = mapConsignCloudSale(sale);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.lineItems).toHaveLength(1);
        expect(result.lineItems[0].salePrice).toBe(2000);
        expect(result.lineItems[0].discount).toBe(50);
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

  describe("isFinalizedSale", () => {
    it("returns true when finalized is set and voided is null", () => {
      const sale = baseValidSale({
        finalized: "2026-03-10T15:00:00.000Z",
        voided: null,
      });
      expect(isFinalizedSale(sale)).toBe(true);
    });

    it("returns false when finalized is null", () => {
      const sale = baseValidSale({ finalized: null, voided: null });
      expect(isFinalizedSale(sale)).toBe(false);
    });

    it("returns false when voided is set (even if finalized is set)", () => {
      const sale = baseValidSale({
        finalized: "2026-03-10T15:00:00.000Z",
        voided: "2026-03-11T08:00:00.000Z",
      });
      expect(isFinalizedSale(sale)).toBe(false);
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
