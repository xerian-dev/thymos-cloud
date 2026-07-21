import { describe, it, expect } from "vitest";
import {
  deriveItemStatus,
  mapConsignCloudItem,
  type ItemStatus,
} from "../item-mapper";
import type { ConsignCloudItem } from "../item-consigncloud-client";

function makeItem(overrides: Partial<ConsignCloudItem> = {}): ConsignCloudItem {
  return {
    id: "cc-item-uuid-001",
    title: "Vintage Lamp",
    tag_price: 5000,
    quantity: 1,
    split: 0.6,
    inventory_type: "consignment",
    terms: "donate",
    tax_exempt: false,
    created: "2024-03-15T10:00:00Z",
    ...overrides,
  };
}

describe("deriveItemStatus", () => {
  it("returns 'active' for single-status object { active: 1 }", () => {
    const result: ItemStatus = deriveItemStatus({ active: 1 });
    expect(result).toBe("active");
  });

  it("returns 'active' for multi-status { sold: 1, active: 2 } (higher priority)", () => {
    const result: ItemStatus = deriveItemStatus({ sold: 1, active: 2 });
    expect(result).toBe("active");
  });

  it("returns 'sold' for sold variant { sold_on_shopify: 1 }", () => {
    const result: ItemStatus = deriveItemStatus({ sold_on_shopify: 1 });
    expect(result).toBe("sold");
  });

  it("returns 'sold' for sold variant { sold_on_square: 1 }", () => {
    const result: ItemStatus = deriveItemStatus({ sold_on_square: 1 });
    expect(result).toBe("sold");
  });

  it("returns 'sold' for sold variant { sold_on_third_party: 1 }", () => {
    const result: ItemStatus = deriveItemStatus({ sold_on_third_party: 1 });
    expect(result).toBe("sold");
  });

  it("returns 'active' for empty object", () => {
    const result: ItemStatus = deriveItemStatus({});
    expect(result).toBe("active");
  });

  it("returns 'active' for null", () => {
    const result: ItemStatus = deriveItemStatus(null);
    expect(result).toBe("active");
  });

  it("returns 'active' for undefined", () => {
    const result: ItemStatus = deriveItemStatus(undefined);
    expect(result).toBe("active");
  });

  it("ignores statuses with count <= 0", () => {
    const result: ItemStatus = deriveItemStatus({ parked: 0, inactive: -1 });
    expect(result).toBe("active");
  });

  it("returns highest-priority status among multiple with non-zero counts", () => {
    const result: ItemStatus = deriveItemStatus({
      damaged: 1,
      lost: 1,
      parked: 1,
    });
    expect(result).toBe("parked");
  });

  it("collapses multiple sold variants and compares against other statuses", () => {
    const result: ItemStatus = deriveItemStatus({
      sold_on_shopify: 2,
      sold_on_square: 1,
      expired: 1,
    });
    expect(result).toBe("expired");
  });
});

describe("mapConsignCloudItem", () => {
  describe("new fields mapping", () => {
    it("includes all new fields when present", () => {
      const item = makeItem({
        status: { active: 1 },
        location: { name: "Shelf A3" },
        details: "Some extra details about this item",
        schedule_start: "2024-04-01T00:00:00Z",
        expires: "2024-12-31T23:59:59Z",
        last_sold: "2024-02-10T14:30:00Z",
        last_viewed: "2024-03-01T09:00:00Z",
        printed: "2024-01-20T08:00:00Z",
        days_on_shelf: 45,
        deleted: "2024-03-10T12:00:00Z",
      });

      const result = mapConsignCloudItem(item);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.mapped.status).toBe("active");
      expect(result.mapped.location).toBe("Shelf A3");
      expect(result.mapped.details).toBe("Some extra details about this item");
      expect(result.mapped.scheduleStart).toBe("2024-04-01T00:00:00Z");
      expect(result.mapped.expirationDate).toBe("2024-12-31T23:59:59Z");
      expect(result.mapped.lastSold).toBe("2024-02-10T14:30:00Z");
      expect(result.mapped.lastViewed).toBe("2024-03-01T09:00:00Z");
      expect(result.mapped.labelPrintedAt).toBe("2024-01-20T08:00:00Z");
      expect(result.mapped.daysOnShelf).toBe(45);
      expect(result.mapped.deleted).toBe("2024-03-10T12:00:00Z");
      expect(result.mapped.createdAt).toBe("2024-03-15T10:00:00Z");
    });

    it("handles null/undefined new fields gracefully", () => {
      const item = makeItem({
        status: null,
        location: null,
        details: null,
        schedule_start: null,
        expires: null,
        last_sold: null,
        last_viewed: null,
        printed: null,
        days_on_shelf: null,
        deleted: null,
      });

      const result = mapConsignCloudItem(item);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.mapped.status).toBe("active");
      expect(result.mapped.location).toBeUndefined();
      expect(result.mapped.details).toBeUndefined();
      expect(result.mapped.scheduleStart).toBeUndefined();
      expect(result.mapped.expirationDate).toBeUndefined();
      expect(result.mapped.lastSold).toBeUndefined();
      expect(result.mapped.lastViewed).toBeUndefined();
      expect(result.mapped.labelPrintedAt).toBeUndefined();
      expect(result.mapped.daysOnShelf).toBeUndefined();
      expect(result.mapped.deleted).toBeUndefined();
    });

    it("handles missing new fields (undefined) gracefully", () => {
      const item = makeItem({});
      // Ensure none of the new optional fields are set
      const record = item as unknown as Record<string, unknown>;
      delete record.status;
      delete record.location;
      delete record.details;
      delete record.schedule_start;
      delete record.expires;
      delete record.last_sold;
      delete record.last_viewed;
      delete record.printed;
      delete record.days_on_shelf;
      delete record.deleted;

      const result = mapConsignCloudItem(item);
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.mapped.status).toBe("active");
      expect(result.mapped.location).toBeUndefined();
      expect(result.mapped.details).toBeUndefined();
      expect(result.mapped.scheduleStart).toBeUndefined();
      expect(result.mapped.expirationDate).toBeUndefined();
      expect(result.mapped.lastSold).toBeUndefined();
      expect(result.mapped.lastViewed).toBeUndefined();
      expect(result.mapped.labelPrintedAt).toBeUndefined();
      expect(result.mapped.daysOnShelf).toBeUndefined();
      expect(result.mapped.deleted).toBeUndefined();
    });

    it("uses CC created timestamp as createdAt", () => {
      const item = makeItem({ created: "2023-06-20T15:30:00Z" });
      const result = mapConsignCloudItem(item);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.mapped.createdAt).toBe("2023-06-20T15:30:00Z");
    });

    it("truncates details to 5000 characters", () => {
      const longDetails = "x".repeat(6000);
      const item = makeItem({ details: longDetails });
      const result = mapConsignCloudItem(item);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.mapped.details).toHaveLength(5000);
    });
  });

  describe("quantity 0 is allowed (sold items)", () => {
    it("allows quantity 0 for sold items", () => {
      const item = makeItem({ quantity: 0, status: { sold: 1 } });
      const result = mapConsignCloudItem(item);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.mapped.quantity).toBe(0);
      expect(result.mapped.status).toBe("sold");
    });

    it("defaults quantity to 0 when not provided", () => {
      const item = makeItem({});
      (item as unknown as Record<string, unknown>).quantity = undefined;
      const result = mapConsignCloudItem(item);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.mapped.quantity).toBe(0);
    });
  });

  describe("deleted items are mapped (not rejected)", () => {
    it("maps a deleted item with deleted timestamp", () => {
      const item = makeItem({
        deleted: "2024-02-15T08:00:00Z",
        status: { sold: 1 },
        quantity: 0,
      });
      const result = mapConsignCloudItem(item);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.mapped.deleted).toBe("2024-02-15T08:00:00Z");
      expect(result.mapped.quantity).toBe(0);
    });

    it("does not reject items based on deleted status", () => {
      const item = makeItem({
        deleted: "2024-01-01T00:00:00Z",
        title: "Deleted Item",
        tag_price: 1000,
      });
      const result = mapConsignCloudItem(item);
      expect(result.success).toBe(true);
    });
  });

  describe("status derivation integration", () => {
    it("derives status from item.status object", () => {
      const item = makeItem({ status: { parked: 1 } });
      const result = mapConsignCloudItem(item);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.mapped.status).toBe("parked");
    });

    it("defaults to active when status is null", () => {
      const item = makeItem({ status: null });
      const result = mapConsignCloudItem(item);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.mapped.status).toBe("active");
    });
  });
});
