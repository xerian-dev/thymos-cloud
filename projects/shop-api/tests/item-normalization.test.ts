import { describe, it, expect } from "vitest";
import {
  normalizeItemAttributes,
  ValidatedItemInput,
  NormalizedItemAttributes,
} from "../src/item-validation";

describe("normalizeItemAttributes", () => {
  const baseInput: ValidatedItemInput = {
    accountId: "acc-123",
    title: "Test Item",
    tagPrice: 29.99,
    quantity: 3,
    split: 60,
    inventoryType: "Consignment",
    terms: "Return To Consignor",
  };

  it("preserves all required fields", () => {
    const result = normalizeItemAttributes(baseInput);

    expect(result.accountId).toBe("acc-123");
    expect(result.title).toBe("Test Item");
    expect(result.tagPrice).toBe(29.99);
    expect(result.quantity).toBe(3);
    expect(result.split).toBe(60);
    expect(result.inventoryType).toBe("Consignment");
    expect(result.terms).toBe("Return To Consignor");
  });

  it("defaults taxExempt to false when omitted", () => {
    const result = normalizeItemAttributes(baseInput);
    expect(result.taxExempt).toBe(false);
  });

  it("preserves taxExempt true when provided", () => {
    const result = normalizeItemAttributes({ ...baseInput, taxExempt: true });
    expect(result.taxExempt).toBe(true);
  });

  it("preserves taxExempt false when explicitly set", () => {
    const result = normalizeItemAttributes({ ...baseInput, taxExempt: false });
    expect(result.taxExempt).toBe(false);
  });

  it("strips empty-string category", () => {
    const result = normalizeItemAttributes({ ...baseInput, category: "" });
    expect(result.category).toBeUndefined();
  });

  it("preserves non-empty category", () => {
    const result = normalizeItemAttributes({
      ...baseInput,
      category: "Clothing",
    });
    expect(result.category).toBe("Clothing");
  });

  it("strips empty-string brand", () => {
    const result = normalizeItemAttributes({ ...baseInput, brand: "" });
    expect(result.brand).toBeUndefined();
  });

  it("preserves non-empty brand", () => {
    const result = normalizeItemAttributes({ ...baseInput, brand: "Nike" });
    expect(result.brand).toBe("Nike");
  });

  it("strips empty-string color", () => {
    const result = normalizeItemAttributes({ ...baseInput, color: "" });
    expect(result.color).toBeUndefined();
  });

  it("preserves non-empty color", () => {
    const result = normalizeItemAttributes({ ...baseInput, color: "Red" });
    expect(result.color).toBe("Red");
  });

  it("strips empty-string size", () => {
    const result = normalizeItemAttributes({ ...baseInput, size: "" });
    expect(result.size).toBeUndefined();
  });

  it("preserves non-empty size", () => {
    const result = normalizeItemAttributes({ ...baseInput, size: "M" });
    expect(result.size).toBe("M");
  });

  it("strips empty-string shelf", () => {
    const result = normalizeItemAttributes({ ...baseInput, shelf: "" });
    expect(result.shelf).toBeUndefined();
  });

  it("preserves non-empty shelf", () => {
    const result = normalizeItemAttributes({ ...baseInput, shelf: "A3" });
    expect(result.shelf).toBe("A3");
  });

  it("strips empty-string details", () => {
    const result = normalizeItemAttributes({ ...baseInput, details: "" });
    expect(result.details).toBeUndefined();
  });

  it("preserves non-empty details", () => {
    const result = normalizeItemAttributes({
      ...baseInput,
      details: "<p>Rich text</p>",
    });
    expect(result.details).toBe("<p>Rich text</p>");
  });

  it("strips empty-string description", () => {
    const result = normalizeItemAttributes({ ...baseInput, description: "" });
    expect(result.description).toBeUndefined();
  });

  it("preserves non-empty description", () => {
    const result = normalizeItemAttributes({
      ...baseInput,
      description: "A fine item",
    });
    expect(result.description).toBe("A fine item");
  });

  it("omits tags when undefined", () => {
    const result = normalizeItemAttributes(baseInput);
    expect(result.tags).toBeUndefined();
  });

  it("omits empty tags array", () => {
    const result = normalizeItemAttributes({ ...baseInput, tags: [] });
    expect(result.tags).toBeUndefined();
  });

  it("preserves non-empty tags array", () => {
    const result = normalizeItemAttributes({
      ...baseInput,
      tags: ["vintage", "leather"],
    });
    expect(result.tags).toEqual(["vintage", "leather"]);
  });

  it("preserves imageKeys array in original order", () => {
    const keys = [
      "items/abc/img1.jpg",
      "items/abc/img2.png",
      "items/abc/img3.webp",
    ];
    const result = normalizeItemAttributes({ ...baseInput, imageKeys: keys });
    expect(result.imageKeys).toEqual(keys);
  });

  it("omits imageKeys when undefined", () => {
    const result = normalizeItemAttributes(baseInput);
    expect(result.imageKeys).toBeUndefined();
  });

  it("omits empty imageKeys array", () => {
    const result = normalizeItemAttributes({ ...baseInput, imageKeys: [] });
    expect(result.imageKeys).toBeUndefined();
  });

  it("does not mutate imageKeys input array", () => {
    const keys = ["key1", "key2"];
    const input = { ...baseInput, imageKeys: keys };
    const result = normalizeItemAttributes(input);
    expect(result.imageKeys).not.toBe(keys);
    expect(result.imageKeys).toEqual(keys);
  });

  it("preserves expirationDate when present", () => {
    const result = normalizeItemAttributes({
      ...baseInput,
      expirationDate: "2025-12-31T00:00:00Z",
    });
    expect(result.expirationDate).toBe("2025-12-31T00:00:00Z");
  });

  it("omits expirationDate when undefined", () => {
    const result = normalizeItemAttributes(baseInput);
    expect(result.expirationDate).toBeUndefined();
  });

  it("omits undefined optional fields from output", () => {
    const result = normalizeItemAttributes(baseInput);
    expect("category" in result).toBe(false);
    expect("brand" in result).toBe(false);
    expect("color" in result).toBe(false);
    expect("size" in result).toBe(false);
    expect("shelf" in result).toBe(false);
    expect("details" in result).toBe(false);
    expect("description" in result).toBe(false);
    expect("tags" in result).toBe(false);
    expect("imageKeys" in result).toBe(false);
    expect("expirationDate" in result).toBe(false);
  });
});
