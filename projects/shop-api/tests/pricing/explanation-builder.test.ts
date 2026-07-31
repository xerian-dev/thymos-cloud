import { describe, it, expect } from "vitest";
import {
  buildExplanation,
  ExplanationInput,
} from "../../src/pricing/explanation-builder";

describe("buildExplanation", () => {
  describe("no data case", () => {
    it("returns no pricing data message when noData is true", () => {
      const input: ExplanationInput = {
        fallbackLevel: 1,
        source: "sold",
        brand: "Nike",
        category: "Shoes",
        description: "Sneakers",
        sampleSize: 0,
        unsoldCount: 0,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: true,
      };

      expect(buildExplanation(input)).toBe(
        "No pricing data available for this category",
      );
    });

    it("ignores other fields when noData is true", () => {
      const input: ExplanationInput = {
        fallbackLevel: 4,
        source: "sold",
        brand: null,
        category: "Bags",
        description: "Handtasche",
        sampleSize: 50,
        unsoldCount: 5,
        velocityMultiplier: 0.9,
        creatorAdjustment: 0.85,
        colorAdjustment: 1.1,
        sizeAdjustment: 0.95,
        noData: true,
      };

      expect(buildExplanation(input)).toBe(
        "No pricing data available for this category",
      );
    });
  });

  describe("fallback level 1: brand × description (sold)", () => {
    it("describes brand × description reference source", () => {
      const input: ExplanationInput = {
        fallbackLevel: 1,
        source: "sold",
        brand: "Gucci",
        category: "Handbags",
        description: "Handtasche",
        sampleSize: 25,
        unsoldCount: 3,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("25 sold items");
      expect(result).toContain("Gucci × Handtasche");
    });
  });

  describe("fallback level 2: description-only (sold)", () => {
    it("describes description-only with insufficient brand data note", () => {
      const input: ExplanationInput = {
        fallbackLevel: 2,
        source: "sold",
        brand: null,
        category: "Shoes",
        description: "Sandalen",
        sampleSize: 42,
        unsoldCount: 8,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("42 sold items");
      expect(result).toContain("matching description 'Sandalen'");
      expect(result).toContain("insufficient brand-specific data");
    });
  });

  describe("fallback level 3: brand × category (sold)", () => {
    it("describes brand × category reference source", () => {
      const input: ExplanationInput = {
        fallbackLevel: 3,
        source: "sold",
        brand: "Nike",
        category: "Shoes",
        description: null,
        sampleSize: 30,
        unsoldCount: 5,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("30 sold items");
      expect(result).toContain("Nike × Shoes");
    });
  });

  describe("fallback level 4: category-only (sold)", () => {
    it("describes category-only with insufficient brand data note", () => {
      const input: ExplanationInput = {
        fallbackLevel: 4,
        source: "sold",
        brand: null,
        category: "Dresses",
        description: null,
        sampleSize: 55,
        unsoldCount: 12,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("55 sold items");
      expect(result).toContain("category Dresses");
      expect(result).toContain("insufficient brand-specific data");
    });
  });

  describe("fallback level 5: brand × description (unsold)", () => {
    it("describes unsold items with brand × description and no-sold warning", () => {
      const input: ExplanationInput = {
        fallbackLevel: 5,
        source: "unsold",
        brand: "Zara",
        category: "Tops",
        description: "Bluse",
        sampleSize: 0,
        unsoldCount: 8,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("8 unsold items");
      expect(result).toContain("Zara × Bluse");
      expect(result).toContain("No items in this group have sold yet");
    });
  });

  describe("fallback level 6: description-only (unsold)", () => {
    it("describes unsold items with description-only and no-sold warning", () => {
      const input: ExplanationInput = {
        fallbackLevel: 6,
        source: "unsold",
        brand: null,
        category: "Outerwear",
        description: "Winterjacke",
        sampleSize: 0,
        unsoldCount: 4,
        velocityMultiplier: 1.0,
        creatorAdjustment: 1.0,
        colorAdjustment: 1.0,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("4 unsold items");
      expect(result).toContain("matching description 'Winterjacke'");
      expect(result).toContain("No items in this group have sold yet");
    });
  });

  describe("velocity multiplier", () => {
    it("describes poor sell-through when velocity < 1.0", () => {
      const input: ExplanationInput = {
        fallbackLevel: 1,
        source: "sold",
        brand: "Zara",
        category: "Tops",
        description: "T-Shirt",
        sampleSize: 30,
        unsoldCount: 5,
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
        fallbackLevel: 3,
        source: "sold",
        brand: "Chanel",
        category: "Accessories",
        description: null,
        sampleSize: 15,
        unsoldCount: 2,
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
        fallbackLevel: 1,
        source: "sold",
        brand: "H&M",
        category: "Pants",
        description: "Hose",
        sampleSize: 20,
        unsoldCount: 3,
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
        fallbackLevel: 1,
        source: "sold",
        brand: "Prada",
        category: "Bags",
        description: "Handtasche",
        sampleSize: 18,
        unsoldCount: 4,
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
        fallbackLevel: 2,
        source: "sold",
        brand: null,
        category: "Bags",
        description: "Rucksack",
        sampleSize: 18,
        unsoldCount: 3,
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
        fallbackLevel: 1,
        source: "sold",
        brand: "Prada",
        category: "Bags",
        description: "Handtasche",
        sampleSize: 18,
        unsoldCount: 2,
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
        fallbackLevel: 1,
        source: "sold",
        brand: "Nike",
        category: "Shoes",
        description: "Sneakers",
        sampleSize: 35,
        unsoldCount: 7,
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
        fallbackLevel: 1,
        source: "sold",
        brand: "Nike",
        category: "Shoes",
        description: "Sneakers",
        sampleSize: 35,
        unsoldCount: 7,
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
        fallbackLevel: 3,
        source: "sold",
        brand: "Levi's",
        category: "Jeans",
        description: null,
        sampleSize: 28,
        unsoldCount: 4,
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
        fallbackLevel: 3,
        source: "sold",
        brand: "Levi's",
        category: "Jeans",
        description: null,
        sampleSize: 28,
        unsoldCount: 4,
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
        fallbackLevel: 1,
        source: "sold",
        brand: "Burberry",
        category: "Coats",
        description: "Mantel",
        sampleSize: 22,
        unsoldCount: 6,
        velocityMultiplier: 0.95,
        creatorAdjustment: 0.9,
        colorAdjustment: 1.08,
        sizeAdjustment: 0.97,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("Burberry × Mantel");
      expect(result).toContain("22 sold items");
      expect(result).toContain("poor sell-through");
      expect(result).toContain("Creator's historical pricing tendency");
      expect(result).toContain("Color adjustment applied");
      expect(result).toContain("Size adjustment applied");
    });

    it("Tier 2 still includes adjustments after opening text", () => {
      const input: ExplanationInput = {
        fallbackLevel: 5,
        source: "unsold",
        brand: "Prada",
        category: "Bags",
        description: "Handtasche",
        sampleSize: 0,
        unsoldCount: 12,
        velocityMultiplier: 0.9,
        creatorAdjustment: 0.85,
        colorAdjustment: 1.1,
        sizeAdjustment: 1.0,
        noData: false,
      };

      const result = buildExplanation(input);
      expect(result).toContain("12 unsold items");
      expect(result).toContain("Prada × Handtasche");
      expect(result).toContain("No items in this group have sold yet");
      expect(result).toContain("poor sell-through");
      expect(result).toContain("Creator's historical pricing tendency");
      expect(result).toContain("Color adjustment applied");
    });

    it("ends with a period", () => {
      const input: ExplanationInput = {
        fallbackLevel: 1,
        source: "sold",
        brand: "Test",
        category: "Items",
        description: "Hose",
        sampleSize: 10,
        unsoldCount: 2,
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
