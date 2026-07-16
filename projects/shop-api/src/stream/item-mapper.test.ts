import { describe, it, expect } from "vitest";
import { mapItem } from "./item-mapper";

describe("mapItem", () => {
  const validRaw: Record<string, unknown> = {
    id: "abc-123",
    created: "2024-01-15T10:30:00Z",
    title: "Blue Dress",
    tag_price: 2500,
    quantity: 1,
    split: 0.6,
    inventory_type: "consignment",
    terms: "return_to_consignor",
    tax_exempt: false,
  };

  it("maps a valid item record successfully", () => {
    const result = mapItem(validRaw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.title).toBe("Blue Dress");
    expect(result.mapped.tagPrice).toBe(25);
    expect(result.mapped.quantity).toBe(1);
    expect(result.mapped.split).toBe(60);
    expect(result.mapped.inventoryType).toBe("Consignment");
    expect(result.mapped.terms).toBe("Return To Consignor");
    expect(result.mapped.taxExempt).toBe(false);
    expect(result.mapped.sourceId).toBe("abc-123");
    expect(result.mapped.createdAt).toBe("2024-01-15T10:30:00Z");
  });

  it("returns error when title and sku are both missing", () => {
    const raw = { ...validRaw, title: undefined, sku: undefined };
    const result = mapItem(raw);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("title and sku");
  });

  it("uses sku fallback when title is missing", () => {
    const raw = { ...validRaw, title: undefined, sku: "SKU-001" };
    const result = mapItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.title).toBe("Untitled (SKU-001)");
  });

  it("truncates title to 200 characters", () => {
    const longTitle = "A".repeat(300);
    const raw = { ...validRaw, title: longTitle };
    const result = mapItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.title.length).toBe(200);
  });

  it("returns error for missing price", () => {
    const raw = { ...validRaw, tag_price: undefined, price: undefined };
    const result = mapItem(raw);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("tagPrice");
  });

  it("returns error for negative price", () => {
    const raw = { ...validRaw, tag_price: -100 };
    const result = mapItem(raw);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("tagPrice");
  });

  it("returns error when price exceeds maximum", () => {
    const raw = { ...validRaw, tag_price: 100_000_000 };
    const result = mapItem(raw);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("999,999.99");
  });

  it("falls back to price field when tag_price is missing", () => {
    const raw = { ...validRaw, tag_price: undefined, price: 5000 };
    const result = mapItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.tagPrice).toBe(50);
  });

  it("converts split from decimal to percentage", () => {
    const raw = { ...validRaw, split: 0.45 };
    const result = mapItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.split).toBe(45);
  });

  it("uses consignor_split as fallback for split", () => {
    const raw = { ...validRaw, split: undefined, consignor_split: 0.7 };
    const result = mapItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.split).toBe(70);
  });

  it("returns error for split out of range", () => {
    const raw = { ...validRaw, split: 1.5 };
    const result = mapItem(raw);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("split");
  });

  it("maps inventory_type correctly", () => {
    expect(
      (mapItem({ ...validRaw, inventory_type: "buy_outright" }) as { success: true; mapped: { inventoryType: string } }).mapped.inventoryType
    ).toBe("Retail");
    expect(
      (mapItem({ ...validRaw, inventory_type: "retail" }) as { success: true; mapped: { inventoryType: string } }).mapped.inventoryType
    ).toBe("Retail");
    expect(
      (mapItem({ ...validRaw, inventory_type: "unknown" }) as { success: true; mapped: { inventoryType: string } }).mapped.inventoryType
    ).toBe("Consignment");
  });

  it("maps terms correctly", () => {
    expect(
      (mapItem({ ...validRaw, terms: "donate" }) as { success: true; mapped: { terms: string } }).mapped.terms
    ).toBe("Donate");
    expect(
      (mapItem({ ...validRaw, terms: "discard" }) as { success: true; mapped: { terms: string } }).mapped.terms
    ).toBe("Discard");
    expect(
      (mapItem({ ...validRaw, terms: "unknown" }) as { success: true; mapped: { terms: string } }).mapped.terms
    ).toBe("Donate");
  });

  it("handles optional description with truncation", () => {
    const longDesc = "B".repeat(3000);
    const raw = { ...validRaw, description: longDesc };
    const result = mapItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.description?.length).toBe(2000);
  });

  it("handles optional brand, color, size", () => {
    const raw = { ...validRaw, brand: "Nike", color: "Red", size: "M" };
    const result = mapItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.brand).toBe("Nike");
    expect(result.mapped.color).toBe("Red");
    expect(result.mapped.size).toBe("M");
  });

  it("extracts shelf name from nested shelf object", () => {
    const raw = { ...validRaw, shelf: { name: "Shelf A" } };
    const result = mapItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.shelf).toBe("Shelf A");
  });

  it("falls back to location.name when shelf is missing", () => {
    const raw = { ...validRaw, shelf: null, location: { name: "Zone 3" } };
    const result = mapItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.shelf).toBe("Zone 3");
  });

  it("extracts image urls from images array", () => {
    const raw = {
      ...validRaw,
      images: [{ url: "img1.jpg" }, { url: "img2.jpg" }],
    };
    const result = mapItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.imageKeys).toEqual(["img1.jpg", "img2.jpg"]);
  });

  it("filters tags to strings only, max 20", () => {
    const tags = [...Array.from({ length: 25 }, (_, i) => `tag-${i}`), 123, null];
    const raw = { ...validRaw, tags };
    const result = mapItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.tags?.length).toBe(20);
    expect(result.mapped.tags?.every((t) => typeof t === "string")).toBe(true);
  });

  it("does not include optional fields when absent", () => {
    const result = mapItem(validRaw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.description).toBeUndefined();
    expect(result.mapped.brand).toBeUndefined();
    expect(result.mapped.color).toBeUndefined();
    expect(result.mapped.size).toBeUndefined();
    expect(result.mapped.shelf).toBeUndefined();
    expect(result.mapped.tags).toBeUndefined();
    expect(result.mapped.imageKeys).toBeUndefined();
  });

  it("is idempotent — same input produces same output", () => {
    const result1 = mapItem(validRaw);
    const result2 = mapItem(validRaw);
    expect(result1).toEqual(result2);
  });

  it("handles zero price correctly", () => {
    const raw = { ...validRaw, tag_price: 0 };
    const result = mapItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.tagPrice).toBe(0);
  });

  it("defaults quantity to 0 when missing", () => {
    const raw = { ...validRaw, quantity: undefined };
    const result = mapItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.quantity).toBe(0);
  });

  it("defaults split to 0 when both split and consignor_split are missing", () => {
    const raw = { ...validRaw, split: undefined, consignor_split: undefined };
    const result = mapItem(raw);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mapped.split).toBe(0);
  });
});
