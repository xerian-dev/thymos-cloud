import { describe, it, expect } from "vitest";
import {
  mapConsignCloudItem,
  type ItemMappingResult,
} from "../../src/import/item-mapper";
import type { ConsignCloudItem } from "../../src/import/item-consigncloud-client";

function baseValidItem(
  overrides?: Partial<ConsignCloudItem>,
): ConsignCloudItem {
  return {
    id: "cc-item-001",
    name: "Test Item",
    price: 29.99,
    quantity: 1,
    consignor_split: 50,
    account_id: "acc-001",
    created: "2026-01-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("item-mapper edge cases", () => {
  describe("title truncation", () => {
    it("does not truncate a title exactly 200 characters long", () => {
      const title200 = "a".repeat(200);
      const result = mapConsignCloudItem(baseValidItem({ name: title200 }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.title).toHaveLength(200);
        expect(result.mapped.title).toBe(title200);
      }
    });

    it("truncates a title of 201 characters to 200", () => {
      const title201 = "b".repeat(201);
      const result = mapConsignCloudItem(baseValidItem({ name: title201 }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.title).toHaveLength(200);
        expect(result.mapped.title).toBe("b".repeat(200));
      }
    });

    it("accepts a title of 1 character (shortest valid)", () => {
      const result = mapConsignCloudItem(baseValidItem({ name: "x" }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.title).toBe("x");
      }
    });
  });

  describe("price boundaries", () => {
    it("accepts price 0.00 (lower boundary)", () => {
      const result = mapConsignCloudItem(baseValidItem({ price: 0.0 }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.tagPrice).toBe(0.0);
      }
    });

    it("accepts price 999,999.99 (upper boundary)", () => {
      const result = mapConsignCloudItem(baseValidItem({ price: 999_999.99 }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.tagPrice).toBe(999_999.99);
      }
    });

    it("rejects price -0.01 (below lower boundary)", () => {
      const result = mapConsignCloudItem(baseValidItem({ price: -0.01 }));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("tagPrice");
      }
    });

    it("rejects price 1,000,000.00 (above upper boundary)", () => {
      const result = mapConsignCloudItem(baseValidItem({ price: 1_000_000.0 }));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("tagPrice");
      }
    });
  });

  describe("quantity boundaries", () => {
    it("accepts quantity 1 (lower boundary)", () => {
      const result = mapConsignCloudItem(baseValidItem({ quantity: 1 }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.quantity).toBe(1);
      }
    });

    it("accepts quantity 9999 (upper boundary)", () => {
      const result = mapConsignCloudItem(baseValidItem({ quantity: 9999 }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.quantity).toBe(9999);
      }
    });

    it("rejects quantity 0 (below lower boundary)", () => {
      const result = mapConsignCloudItem(baseValidItem({ quantity: 0 }));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("quantity");
      }
    });

    it("rejects quantity 10000 (above upper boundary)", () => {
      const result = mapConsignCloudItem(baseValidItem({ quantity: 10000 }));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("quantity");
      }
    });
  });

  describe("split boundaries", () => {
    it("accepts split 0 (lower boundary)", () => {
      const result = mapConsignCloudItem(baseValidItem({ consignor_split: 0 }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.split).toBe(0);
      }
    });

    it("accepts split 100 (upper boundary)", () => {
      const result = mapConsignCloudItem(
        baseValidItem({ consignor_split: 100 }),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.split).toBe(100);
      }
    });

    it("rejects split -1 (below lower boundary)", () => {
      const result = mapConsignCloudItem(
        baseValidItem({ consignor_split: -1 }),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("split");
      }
    });

    it("rejects split 101 (above upper boundary)", () => {
      const result = mapConsignCloudItem(
        baseValidItem({ consignor_split: 101 }),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("split");
      }
    });
  });

  describe("null/undefined optional fields", () => {
    it("maps null category to undefined (not present in result)", () => {
      const result = mapConsignCloudItem(baseValidItem({ category: null }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.category).toBeUndefined();
      }
    });

    it("maps undefined tags to undefined (not present in result)", () => {
      const result = mapConsignCloudItem(baseValidItem({ tags: undefined }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.tags).toBeUndefined();
      }
    });

    it("maps undefined description to undefined (not present in result)", () => {
      const result = mapConsignCloudItem(
        baseValidItem({ description: undefined }),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.description).toBeUndefined();
      }
    });
  });

  describe("images array mapping", () => {
    it("maps images array to imageKeys with URLs", () => {
      const result = mapConsignCloudItem(
        baseValidItem({
          images: [
            { url: "https://cdn.example.com/img1.jpg" },
            { url: "https://cdn.example.com/img2.png" },
          ],
        }),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.imageKeys).toEqual([
          "https://cdn.example.com/img1.jpg",
          "https://cdn.example.com/img2.png",
        ]);
      }
    });

    it("maps empty images array to undefined (not present in result)", () => {
      const result = mapConsignCloudItem(baseValidItem({ images: [] }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.imageKeys).toBeUndefined();
      }
    });
  });

  describe("description truncation", () => {
    it("does not truncate a description exactly 2000 characters long", () => {
      const desc2000 = "d".repeat(2000);
      const result = mapConsignCloudItem(
        baseValidItem({ description: desc2000 }),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.description).toHaveLength(2000);
        expect(result.mapped.description).toBe(desc2000);
      }
    });

    it("truncates a description of 2001 characters to 2000", () => {
      const desc2001 = "e".repeat(2001);
      const result = mapConsignCloudItem(
        baseValidItem({ description: desc2001 }),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.description).toHaveLength(2000);
        expect(result.mapped.description).toBe("e".repeat(2000));
      }
    });
  });
});
