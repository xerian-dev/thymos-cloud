import { describe, it, expect } from "vitest";
import {
  resolvePricingRef,
  buildDescriptionKey,
  buildCategoryKey,
} from "../../src/pricing/fallback-lookup.js";
import type {
  PricingRefData,
  PricingRefLookup,
} from "../../src/pricing/fallback-lookup.js";

function makeSoldRef(sampleSize = 10): PricingRefData {
  return { sampleSize, unsoldCount: 0 };
}

function makeUnsoldRef(unsoldCount = 5): PricingRefData {
  return { sampleSize: 0, unsoldCount };
}

describe("resolvePricingRef – unit tests", () => {
  const brand = "Nike";
  const description = "Hose";
  const categoryId = "cat-123";

  describe("each level independently", () => {
    it("level 1: brand×description with sampleSize > 0 → level 1, source sold", () => {
      const ref = makeSoldRef(15);
      const refs = new Map<string, PricingRefData>();
      refs.set(buildDescriptionKey(brand, description), ref);

      const result = resolvePricingRef({ brand, description, categoryId }, refs);

      expect(result).toEqual({
        found: true,
        source: "sold",
        level: 1,
        ref,
      });
    });

    it("level 2: description-only with sampleSize > 0 → level 2, source sold", () => {
      const ref = makeSoldRef(20);
      const refs = new Map<string, PricingRefData>();
      refs.set(buildDescriptionKey("_NONE_", description), ref);

      const result = resolvePricingRef({ brand, description, categoryId }, refs);

      expect(result).toEqual({
        found: true,
        source: "sold",
        level: 2,
        ref,
      });
    });

    it("level 3: brand×category with sampleSize > 0 → level 3, source sold", () => {
      const ref = makeSoldRef(8);
      const refs = new Map<string, PricingRefData>();
      refs.set(buildCategoryKey(brand, categoryId), ref);

      const result = resolvePricingRef({ brand, description, categoryId }, refs);

      expect(result).toEqual({
        found: true,
        source: "sold",
        level: 3,
        ref,
      });
    });

    it("level 4: category-only with sampleSize > 0 → level 4, source sold", () => {
      const ref = makeSoldRef(12);
      const refs = new Map<string, PricingRefData>();
      refs.set(buildCategoryKey("_NONE_", categoryId), ref);

      const result = resolvePricingRef({ brand, description, categoryId }, refs);

      expect(result).toEqual({
        found: true,
        source: "sold",
        level: 4,
        ref,
      });
    });

    it("level 5: brand×description with unsoldCount > 0 (no Tier 1 hits) → level 5, source unsold", () => {
      const ref = makeUnsoldRef(8);
      const refs = new Map<string, PricingRefData>();
      refs.set(buildDescriptionKey(brand, description), ref);

      const result = resolvePricingRef({ brand, description, categoryId }, refs);

      expect(result).toEqual({
        found: true,
        source: "unsold",
        level: 5,
        ref,
      });
    });

    it("level 6: description-only with unsoldCount > 0 (no higher hits) → level 6, source unsold", () => {
      const ref = makeUnsoldRef(3);
      const refs = new Map<string, PricingRefData>();
      refs.set(buildDescriptionKey("_NONE_", description), ref);

      const result = resolvePricingRef({ brand, description, categoryId }, refs);

      expect(result).toEqual({
        found: true,
        source: "unsold",
        level: 6,
        ref,
      });
    });
  });

  describe("precedence", () => {
    it("level 1 takes precedence over level 3 when both exist", () => {
      const level1Ref = makeSoldRef(10);
      const level3Ref = makeSoldRef(25);
      const refs = new Map<string, PricingRefData>();
      refs.set(buildDescriptionKey(brand, description), level1Ref);
      refs.set(buildCategoryKey(brand, categoryId), level3Ref);

      const result = resolvePricingRef({ brand, description, categoryId }, refs);

      expect(result).toEqual({
        found: true,
        source: "sold",
        level: 1,
        ref: level1Ref,
      });
    });

    it("level 2 takes precedence over level 3", () => {
      const level2Ref = makeSoldRef(7);
      const level3Ref = makeSoldRef(30);
      const refs = new Map<string, PricingRefData>();
      refs.set(buildDescriptionKey("_NONE_", description), level2Ref);
      refs.set(buildCategoryKey(brand, categoryId), level3Ref);

      const result = resolvePricingRef({ brand, description, categoryId }, refs);

      expect(result).toEqual({
        found: true,
        source: "sold",
        level: 2,
        ref: level2Ref,
      });
    });

    it("Tier 1 level 4 takes precedence over Tier 2 level 5", () => {
      const level4Ref = makeSoldRef(5);
      const level5Ref = makeUnsoldRef(10);
      const refs = new Map<string, PricingRefData>();
      refs.set(buildCategoryKey("_NONE_", categoryId), level4Ref);
      // Also add a brand×desc key with only unsold counts
      refs.set(buildDescriptionKey(brand, description), level5Ref);

      const result = resolvePricingRef({ brand, description, categoryId }, refs);

      expect(result).toEqual({
        found: true,
        source: "sold",
        level: 4,
        ref: level4Ref,
      });
    });
  });

  describe("null / not-found", () => {
    it("returns found=false, level=0 when nothing exists", () => {
      const refs = new Map<string, PricingRefData>();

      const result = resolvePricingRef({ brand, description, categoryId }, refs);

      expect(result).toEqual({
        found: false,
        source: null,
        level: 0,
        ref: null,
      });
    });

    it("sampleSize=0 does not match for Tier 1 (record exists but has 0 sold items)", () => {
      const refWithZeroSold: PricingRefData = { sampleSize: 0, unsoldCount: 0 };
      const refs = new Map<string, PricingRefData>();
      refs.set(buildDescriptionKey(brand, description), refWithZeroSold);
      refs.set(buildDescriptionKey("_NONE_", description), refWithZeroSold);
      refs.set(buildCategoryKey(brand, categoryId), refWithZeroSold);
      refs.set(buildCategoryKey("_NONE_", categoryId), refWithZeroSold);

      const result = resolvePricingRef({ brand, description, categoryId }, refs);

      // sampleSize=0 AND unsoldCount=0 → nothing matches at any level
      expect(result).toEqual({
        found: false,
        source: null,
        level: 0,
        ref: null,
      });
    });
  });
});
