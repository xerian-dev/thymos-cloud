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
    title: "Test Item",
    tag_price: 2999,
    quantity: 1,
    split: 0.5,
    account_id: "acc-001",
    created: "2026-01-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("item-mapper edge cases", () => {
  describe("title truncation", () => {
    it("does not truncate a title exactly 200 characters long", () => {
      const title200 = "a".repeat(200);
      const result = mapConsignCloudItem(baseValidItem({ title: title200 }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.title).toHaveLength(200);
        expect(result.mapped.title).toBe(title200);
      }
    });

    it("truncates a title of 201 characters to 200", () => {
      const title201 = "b".repeat(201);
      const result = mapConsignCloudItem(baseValidItem({ title: title201 }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.title).toHaveLength(200);
        expect(result.mapped.title).toBe("b".repeat(200));
      }
    });

    it("accepts a title of 1 character (shortest valid)", () => {
      const result = mapConsignCloudItem(baseValidItem({ title: "x" }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.title).toBe("x");
      }
    });
  });

  describe("price boundaries", () => {
    it("accepts tag_price 0 (lower boundary, maps to 0.00)", () => {
      const result = mapConsignCloudItem(baseValidItem({ tag_price: 0 }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.tagPrice).toBe(0.0);
      }
    });

    it("accepts tag_price 99999999 (upper boundary, maps to 999,999.99)", () => {
      const result = mapConsignCloudItem(
        baseValidItem({ tag_price: 99999999 }),
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.tagPrice).toBe(999_999.99);
      }
    });

    it("rejects tag_price -1 (below lower boundary)", () => {
      const result = mapConsignCloudItem(baseValidItem({ tag_price: -1 }));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("tagPrice");
      }
    });

    it("rejects tag_price 100000000 (above upper boundary, maps to 1,000,000.00)", () => {
      const result = mapConsignCloudItem(
        baseValidItem({ tag_price: 100000000 }),
      );

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

    it("accepts quantity 0 (sold items)", () => {
      const result = mapConsignCloudItem(baseValidItem({ quantity: 0 }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.quantity).toBe(0);
      }
    });
  });

  describe("split boundaries", () => {
    it("accepts split 0 (lower boundary, maps to 0%)", () => {
      const result = mapConsignCloudItem(baseValidItem({ split: 0 }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.split).toBe(0);
      }
    });

    it("accepts split 1 (upper boundary, maps to 100%)", () => {
      const result = mapConsignCloudItem(baseValidItem({ split: 1 }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.mapped.split).toBe(100);
      }
    });

    it("rejects split -0.01 (below lower boundary)", () => {
      const result = mapConsignCloudItem(baseValidItem({ split: -0.01 }));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("split");
      }
    });

    it("rejects split 1.01 (above upper boundary)", () => {
      const result = mapConsignCloudItem(baseValidItem({ split: 1.01 }));

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
