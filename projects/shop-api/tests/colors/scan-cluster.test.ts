import { describe, it, expect } from "vitest";
import {
  lookupCanonical,
  splitColorPattern,
  clusterColors,
  type ColorEntry,
} from "../../src/colors/scan-cluster.js";

describe("lookupCanonical", () => {
  describe("direct German lookups", () => {
    it("maps blau → Blau", () => {
      expect(lookupCanonical("blau")).toBe("Blau");
    });

    it("maps rot → Rot", () => {
      expect(lookupCanonical("rot")).toBe("Rot");
    });

    it("maps grün → Grün", () => {
      expect(lookupCanonical("grün")).toBe("Grün");
    });

    it("maps schwarz → Schwarz", () => {
      expect(lookupCanonical("schwarz")).toBe("Schwarz");
    });

    it("maps weiss → Weiss", () => {
      expect(lookupCanonical("weiss")).toBe("Weiss");
    });

    it("maps weiß → Weiss", () => {
      expect(lookupCanonical("weiß")).toBe("Weiss");
    });

    it("maps rosa → Rosa", () => {
      expect(lookupCanonical("rosa")).toBe("Rosa");
    });

    it("maps beige → Beige", () => {
      expect(lookupCanonical("beige")).toBe("Beige");
    });
  });

  describe("English → German mapping", () => {
    it("maps red → Rot", () => {
      expect(lookupCanonical("red")).toBe("Rot");
    });

    it("maps blue → Blau", () => {
      expect(lookupCanonical("blue")).toBe("Blau");
    });

    it("maps green → Grün", () => {
      expect(lookupCanonical("green")).toBe("Grün");
    });

    it("maps black → Schwarz", () => {
      expect(lookupCanonical("black")).toBe("Schwarz");
    });

    it("maps navy → Dunkelblau", () => {
      expect(lookupCanonical("navy")).toBe("Dunkelblau");
    });

    it("maps burgundy → Weinrot", () => {
      expect(lookupCanonical("burgundy")).toBe("Weinrot");
    });

    it("maps grey → Grau", () => {
      expect(lookupCanonical("grey")).toBe("Grau");
    });

    it("maps gray → Grau", () => {
      expect(lookupCanonical("gray")).toBe("Grau");
    });
  });

  describe("case insensitivity", () => {
    it("maps Blau → Blau", () => {
      expect(lookupCanonical("Blau")).toBe("Blau");
    });

    it("maps SCHWARZ → Schwarz", () => {
      expect(lookupCanonical("SCHWARZ")).toBe("Schwarz");
    });

    it("maps RED → Rot", () => {
      expect(lookupCanonical("RED")).toBe("Rot");
    });
  });

  describe("prefix handling", () => {
    it("maps dunkelblau → Dunkelblau", () => {
      expect(lookupCanonical("dunkelblau")).toBe("Dunkelblau");
    });

    it("maps hellgrün → Hellgrün", () => {
      expect(lookupCanonical("hellgrün")).toBe("Hellgrün");
    });

    it("maps dunkelrot → Dunkelrot", () => {
      expect(lookupCanonical("dunkelrot")).toBe("Dunkelrot");
    });

    it("maps hellbraun → Hellbraun", () => {
      expect(lookupCanonical("hellbraun")).toBe("Hellbraun");
    });

    it("maps dunkelgrau → Dunkelgrau", () => {
      expect(lookupCanonical("dunkelgrau")).toBe("Dunkelgrau");
    });

    it("maps English prefix darkblue → Dunkelblau", () => {
      expect(lookupCanonical("darkblue")).toBe("Dunkelblau");
    });

    it("maps lightgreen → Hellgrün", () => {
      expect(lookupCanonical("lightgreen")).toBe("Hellgrün");
    });
  });

  describe("compound colors with separators", () => {
    it("maps blau/grün → Blau/Grün", () => {
      expect(lookupCanonical("blau/grün")).toBe("Blau/Grün");
    });

    it("maps rot-schwarz → Rot-Schwarz", () => {
      expect(lookupCanonical("rot-schwarz")).toBe("Rot-Schwarz");
    });

    it("maps blau grün (space) → Blau/Grün", () => {
      expect(lookupCanonical("blau grün")).toBe("Blau/Grün");
    });

    it("returns null for partially unmapped compound", () => {
      expect(lookupCanonical("blau/neonpink")).toBeNull();
    });
  });

  describe("unmapped values", () => {
    it("returns null for unknown color", () => {
      expect(lookupCanonical("regenbogen")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(lookupCanonical("")).toBeNull();
    });

    it("returns null for gibberish", () => {
      expect(lookupCanonical("xyzabc123")).toBeNull();
    });
  });
});

describe("splitColorPattern", () => {
  describe("pure pattern values", () => {
    it("returns null color for 'gestreift'", () => {
      expect(splitColorPattern("gestreift")).toEqual({
        color: null,
        pattern: "Gestreift",
      });
    });

    it("returns null color for 'kariert'", () => {
      expect(splitColorPattern("kariert")).toEqual({
        color: null,
        pattern: "Kariert",
      });
    });

    it("returns null color for 'punkte'", () => {
      expect(splitColorPattern("punkte")).toEqual({
        color: null,
        pattern: "Punkte",
      });
    });

    it("is case-insensitive for patterns", () => {
      expect(splitColorPattern("Gestreift")).toEqual({
        color: null,
        pattern: "Gestreift",
      });
    });
  });

  describe("compound values (color + pattern)", () => {
    it("splits 'blau gestreift' → color: Blau, pattern: Gestreift", () => {
      expect(splitColorPattern("blau gestreift")).toEqual({
        color: "Blau",
        pattern: "Gestreift",
      });
    });

    it("splits 'dunkelblau kariert' → color: Dunkelblau, pattern: Kariert", () => {
      expect(splitColorPattern("dunkelblau kariert")).toEqual({
        color: "Dunkelblau",
        pattern: "Kariert",
      });
    });

    it("splits 'rot/gestreift' → color: Rot, pattern: Gestreift", () => {
      expect(splitColorPattern("rot/gestreift")).toEqual({
        color: "Rot",
        pattern: "Gestreift",
      });
    });

    it("splits 'schwarz-punkte' → color: Schwarz, pattern: Punkte", () => {
      expect(splitColorPattern("schwarz-punkte")).toEqual({
        color: "Schwarz",
        pattern: "Punkte",
      });
    });

    it("resolves English color in compound 'red stripes'", () => {
      expect(splitColorPattern("red stripes")).toEqual({
        color: "Rot",
        pattern: "Gestreift",
      });
    });
  });

  describe("pure color values (no pattern)", () => {
    it("returns null pattern for 'blau'", () => {
      expect(splitColorPattern("blau")).toEqual({
        color: "blau",
        pattern: null,
      });
    });

    it("returns null pattern for 'dunkelrot'", () => {
      expect(splitColorPattern("dunkelrot")).toEqual({
        color: "dunkelrot",
        pattern: null,
      });
    });

    it("returns null pattern for unknown value", () => {
      expect(splitColorPattern("regenbogen")).toEqual({
        color: "regenbogen",
        pattern: null,
      });
    });
  });

  describe("edge cases", () => {
    it("returns null for both when empty string", () => {
      expect(splitColorPattern("")).toEqual({
        color: null,
        pattern: null,
      });
    });

    it("handles whitespace-only input", () => {
      expect(splitColorPattern("   ")).toEqual({
        color: null,
        pattern: null,
      });
    });
  });
});

describe("clusterColors", () => {
  it("maps German raw values to canonical with null pattern", () => {
    const colors: ColorEntry[] = [
      { raw: "blau", count: 100 },
      { raw: "rot", count: 50 },
    ];

    const result = clusterColors(colors);
    expect(result).toContainEqual({
      raw: "blau",
      canonical: "Blau",
      pattern: null,
    });
    expect(result).toContainEqual({
      raw: "rot",
      canonical: "Rot",
      pattern: null,
    });
  });

  it("maps English raw values to German canonical with null pattern", () => {
    const colors: ColorEntry[] = [
      { raw: "red", count: 20 },
      { raw: "blue", count: 30 },
    ];

    const result = clusterColors(colors);
    expect(result).toContainEqual({
      raw: "red",
      canonical: "Rot",
      pattern: null,
    });
    expect(result).toContainEqual({
      raw: "blue",
      canonical: "Blau",
      pattern: null,
    });
  });

  it("maps case variants to canonical with null pattern", () => {
    const colors: ColorEntry[] = [
      { raw: "SCHWARZ", count: 10 },
      { raw: "Blau", count: 5 },
    ];

    const result = clusterColors(colors);
    expect(result).toContainEqual({
      raw: "SCHWARZ",
      canonical: "Schwarz",
      pattern: null,
    });
    expect(result).toContainEqual({
      raw: "Blau",
      canonical: "Blau",
      pattern: null,
    });
  });

  it("title-cases unmapped values with null pattern", () => {
    const colors: ColorEntry[] = [{ raw: "regenbogen", count: 5 }];

    const result = clusterColors(colors);
    expect(result).toContainEqual({
      raw: "regenbogen",
      canonical: "Regenbogen",
      pattern: null,
    });
  });

  it("handles prefix colors with null pattern", () => {
    const colors: ColorEntry[] = [{ raw: "dunkelblau", count: 50 }];

    const result = clusterColors(colors);
    expect(result).toContainEqual({
      raw: "dunkelblau",
      canonical: "Dunkelblau",
      pattern: null,
    });
  });

  it("handles compound colors with null pattern", () => {
    const colors: ColorEntry[] = [{ raw: "blau/grün", count: 10 }];

    const result = clusterColors(colors);
    expect(result).toContainEqual({
      raw: "blau/grün",
      canonical: "Blau/Grün",
      pattern: null,
    });
  });

  it("skips null/non-string entries gracefully", () => {
    const colors: ColorEntry[] = [
      { raw: null as unknown as string, count: 5 },
      { raw: undefined as unknown as string, count: 3 },
      { raw: 123 as unknown as string, count: 2 },
      { raw: "blau", count: 100 },
    ];

    const result = clusterColors(colors);
    expect(result).toContainEqual({
      raw: "blau",
      canonical: "Blau",
      pattern: null,
    });
    expect(result).toHaveLength(1);
  });

  it("sorts mappings alphabetically by raw", () => {
    const colors: ColorEntry[] = [
      { raw: "rot", count: 10 },
      { raw: "blau", count: 100 },
      { raw: "grün", count: 50 },
    ];

    const result = clusterColors(colors);
    const raws = result.map((m) => m.raw);
    expect(raws).toEqual([...raws].sort());
  });

  it("includes pure pattern values in mappings with null canonical", () => {
    const colors: ColorEntry[] = [
      { raw: "gestreift", count: 50 },
      { raw: "punkte", count: 30 },
      { raw: "blau", count: 100 },
    ];

    const result = clusterColors(colors);
    expect(result).toContainEqual({
      raw: "gestreift",
      canonical: null,
      pattern: "Gestreift",
    });
    expect(result).toContainEqual({
      raw: "punkte",
      canonical: null,
      pattern: "Punkte",
    });
    expect(result).toContainEqual({
      raw: "blau",
      canonical: "Blau",
      pattern: null,
    });
  });

  it("produces compound mappings with both canonical and pattern", () => {
    const colors: ColorEntry[] = [
      { raw: "blau gestreift", count: 10 },
      { raw: "dunkelblau kariert", count: 5 },
    ];

    const result = clusterColors(colors);
    expect(result).toContainEqual({
      raw: "blau gestreift",
      canonical: "Blau",
      pattern: "Gestreift",
    });
    expect(result).toContainEqual({
      raw: "dunkelblau kariert",
      canonical: "Dunkelblau",
      pattern: "Kariert",
    });
  });
});
