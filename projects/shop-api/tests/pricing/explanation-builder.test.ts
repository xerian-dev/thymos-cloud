import { describe, it, expect } from "vitest";
import {
  buildExplanation,
  ExplanationInput,
} from "../../src/pricing/explanation-builder";

describe("buildExplanation", () => {
  describe("no data case", () => {
    it("returns no pricing data message when noData is true", () => {
      const input: ExplanationInput = {
        referenceSource: "brand_category",
        brand: "Nike",
        category: "Shoes",
        sampleSize: 0,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: true,
      };

      expect(buildExplanation(input)).toBe(
        "No pricing data available for this category"
      );
    });

    it("ignores other fields when noData is true", () => {
      const input: ExplanationInput = {
        referenceSource: "category_only",
        brand: null,
        category: "Bags",
        sampleSize: 50,
        velocityMultiplier: 0.9,
        creatorAdjustment: 0.85,
        colorAdjustment: 1.1,
        sizeAdjustment: 0.95,
        noData: true,
      };

      expect(buildExplanation(input)).toBe(
        "No pricing data available for this category"
      );
    });
  });

  describe("reference source", () => {
    it("describes brand×category reference source", () => {
      const input: ExplanationInput = {
        referenceSource: "brand_category",
        brand: "Gucci",
        category: "Handbags",
        sampleSize: 25,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("25 sold items");
      expect(result).toContain("Gucci × Handbags");
    });

    it("describes category-only fallback with insufficient brand data note", () => {
      const input: ExplanationInput = {
        referenceSource: "category_only",
        brand: null,
        category: "Dresses",
        sampleSize: 42,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("42 sold items");
      expect(result).toContain("category Dresses");
      expect(result).toContain("insufficient brand-specific data");
    });
  });

  describe("velocity multiplier", () => {
    it("describes poor sell-through when velocity < 1.0", () => {
      const input: ExplanationInput = {
        referenceSource: "brand_category",
        brand: "Zara",
        category: "Tops",
        sampleSize: 30,
        velocityMultiplier: 0.9,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("Reduced");
      expect(result).toContain("10%");
      expect(result).toContain("poor sell-through");
    });

    it("describes strong sell-through when velocity > 1.0", () => {
      const input: ExplanationInput = {
        referenceSource: "brand_category",
        brand: "Chanel",
        category: "Accessories",
        sampleSize: 15,
        velocityMultiplier: 1.05,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("Increased");
      expect(result).toContain("5%");
      expect(result).toContain("strong sell-through");
    });

    it("does not mention velocity when multiplier is 1.0", () => {
      const input: ExplanationInput = {
        referenceSource: "brand_category",
        brand: "H&M",
        category: "Pants",
        sampleSize: 20,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).not.toContain("sell-through");
      expect(result).not.toContain("Reduced");
      expect(result).not.toContain("Increased");
    });
  });

  describe("creator adjustment", () => {
    it("describes downward creator adjustment", () => {
      const input: ExplanationInput = {
        referenceSource: "brand_category",
        brand: "Prada",
        category: "Bags",
        sampleSize: 18,
        velocityMultiplier: 1.0,
        creatorAdjustment: 0.85,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("Creator's historical pricing tendency");
      expect(result).toContain("downward");
    });

    it("describes upward creator adjustment", () => {
      const input: ExplanationInput = {
        referenceSource: "brand_category",
        brand: "Prada",
        category: "Bags",
        sampleSize: 18,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.15,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("Creator's historical pricing tendency");
      expect(result).toContain("upward");
    });

    it("does not mention creator when adjustment is 1.0", () => {
      const input: ExplanationInput = {
        referenceSource: "brand_category",
        brand: "Prada",
        category: "Bags",
        sampleSize: 18,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).not.toContain("Creator");
    });
  });

  describe("color adjustment", () => {
    it("mentions color adjustment when not 1.0", () => {
      const input: ExplanationInput = {
        referenceSource: "brand_category",
        brand: "Nike",
        category: "Shoes",
        sampleSize: 35,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.05,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("Color adjustment applied");
    });

    it("does not mention color when adjustment is 1.0", () => {
      const input: ExplanationInput = {
        referenceSource: "brand_category",
        brand: "Nike",
        category: "Shoes",
        sampleSize: 35,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).not.toContain("Color");
    });
  });

  describe("size adjustment", () => {
    it("mentions size adjustment when not 1.0", () => {
      const input: ExplanationInput = {
        referenceSource: "brand_category",
        brand: "Levi's",
        category: "Jeans",
        sampleSize: 28,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 0.95,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("Size adjustment applied");
    });

    it("does not mention size when adjustment is 1.0", () => {
      const input: ExplanationInput = {
        referenceSource: "brand_category",
        brand: "Levi's",
        category: "Jeans",
        sampleSize: 28,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).not.toContain("Size");
    });
  });

  describe("combined adjustments", () => {
    it("includes all adjustment descriptions when all differ from 1.0", () => {
      const input: ExplanationInput = {
        referenceSource: "brand_category",
        brand: "Burberry",
        category: "Coats",
        sampleSize: 22,
        velocityMultiplier: 0.95,
        creatorAdjustment: 0.9,
        colorAdjustment: 1.08,
        sizeAdjustment: 0.97,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("Burberry × Coats");
      expect(result).toContain("22 sold items");
      expect(result).toContain("poor sell-through");
      expect(result).toContain("Creator's historical pricing tendency");
      expect(result).toContain("Color adjustment applied");
      expect(result).toContain("Size adjustment applied");
    });

    it("ends with a period", () => {
      const input: ExplanationInput = {
        referenceSource: "brand_category",
        brand: "Test",
        category: "Items",
        sampleSize: 10,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toMatch(/\.$/);
    });
  });
});
