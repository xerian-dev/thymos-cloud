import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapBrand, mapColor } from "../../src/import/canonical-mapper";

describe("canonical-mapper", () => {
  describe("mapBrand", () => {
    const brandMappings = new Map<string, string>([
      ["nike", "Nike"],
      ["nikke", "Nike"],
      ["adidas", "Adidas"],
      ["gucci", "Gucci"],
    ]);

    it("returns canonical name for exact lowercase match", () => {
      const result = mapBrand("nike", brandMappings);
      expect(result).toEqual({ canonical: "Nike", source: "nike" });
    });

    it("returns canonical name for case-insensitive match", () => {
      const result = mapBrand("NIKE", brandMappings);
      expect(result).toEqual({ canonical: "Nike", source: "NIKE" });
    });

    it("returns canonical name for alias match", () => {
      const result = mapBrand("Nikke", brandMappings);
      expect(result).toEqual({ canonical: "Nike", source: "Nikke" });
    });

    it("returns canonical name for alias with different casing", () => {
      const result = mapBrand("NIKKE", brandMappings);
      expect(result).toEqual({ canonical: "Nike", source: "NIKKE" });
    });

    it("returns original value unchanged when no match found", () => {
      const result = mapBrand("Puma", brandMappings);
      expect(result).toEqual({ canonical: "Puma", source: null });
    });

    it("trims whitespace before lookup", () => {
      const result = mapBrand("  nike  ", brandMappings);
      expect(result).toEqual({ canonical: "Nike", source: "  nike  " });
    });

    it("handles empty string (no match)", () => {
      const result = mapBrand("", brandMappings);
      expect(result).toEqual({ canonical: "", source: null });
    });
  });

  describe("mapColor", () => {
    const colorMappings = new Map<string, string>([
      ["red", "Red"],
      ["rot", "Red"],
      ["blue", "Blue"],
      ["blau", "Blue"],
    ]);

    it("returns canonical name for exact lowercase match", () => {
      const result = mapColor("red", colorMappings);
      expect(result).toEqual({ canonical: "Red", source: "red" });
    });

    it("returns canonical name for case-insensitive match", () => {
      const result = mapColor("RED", colorMappings);
      expect(result).toEqual({ canonical: "Red", source: "RED" });
    });

    it("returns canonical name for alias match (German)", () => {
      const result = mapColor("Rot", colorMappings);
      expect(result).toEqual({ canonical: "Red", source: "Rot" });
    });

    it("returns canonical name for alias with different casing", () => {
      const result = mapColor("ROT", colorMappings);
      expect(result).toEqual({ canonical: "Red", source: "ROT" });
    });

    it("returns original value unchanged when no match found", () => {
      const result = mapColor("Green", colorMappings);
      expect(result).toEqual({ canonical: "Green", source: null });
    });

    it("trims whitespace before lookup", () => {
      const result = mapColor("  blau  ", colorMappings);
      expect(result).toEqual({ canonical: "Blue", source: "  blau  " });
    });

    it("handles empty string (no match)", () => {
      const result = mapColor("", colorMappings);
      expect(result).toEqual({ canonical: "", source: null });
    });
  });

  describe("loadCanonicalMappings", () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it("builds brand map from DynamoDB records with name and aliases", async () => {
      const mockSend = vi.fn().mockResolvedValue({
        Items: [
          {
            PK: "CANONICAL#BRANDS",
            SK: "BRAND#Nike",
            name: "Nike",
            aliases: ["Nikke", "NIKE"],
          },
          {
            PK: "CANONICAL#BRANDS",
            SK: "BRAND#Adidas",
            name: "Adidas",
            aliases: ["addidas"],
          },
        ],
        LastEvaluatedKey: undefined,
      });

      vi.doMock("../../src/dynamodb-client", () => ({
        docClient: { send: mockSend },
        TABLE_NAME: "test-table",
      }));

      const { loadCanonicalMappings } =
        await import("../../src/import/canonical-mapper");
      const mappings = await loadCanonicalMappings();

      expect(mappings.brands.get("nike")).toBe("Nike");
      expect(mappings.brands.get("nikke")).toBe("Nike");
      expect(mappings.brands.get("adidas")).toBe("Adidas");
      expect(mappings.brands.get("addidas")).toBe("Adidas");
    });

    it("builds color map from DynamoDB records with name and aliases", async () => {
      const mockSend = vi.fn().mockResolvedValue({
        Items: [
          {
            PK: "CANONICAL#COLORS",
            SK: "COLOR#Red",
            name: "Red",
            aliases: ["rot", "Rot"],
          },
          {
            PK: "CANONICAL#COLORS",
            SK: "COLOR#Blue",
            name: "Blue",
            aliases: ["blau"],
          },
        ],
        LastEvaluatedKey: undefined,
      });

      vi.doMock("../../src/dynamodb-client", () => ({
        docClient: { send: mockSend },
        TABLE_NAME: "test-table",
      }));

      const { loadCanonicalMappings } =
        await import("../../src/import/canonical-mapper");
      const mappings = await loadCanonicalMappings();

      expect(mappings.colors.get("red")).toBe("Red");
      expect(mappings.colors.get("rot")).toBe("Red");
      expect(mappings.colors.get("blue")).toBe("Blue");
      expect(mappings.colors.get("blau")).toBe("Blue");
    });

    it("handles records with no aliases", async () => {
      const mockSend = vi.fn().mockResolvedValue({
        Items: [{ PK: "CANONICAL#BRANDS", SK: "BRAND#Zara", name: "Zara" }],
        LastEvaluatedKey: undefined,
      });

      vi.doMock("../../src/dynamodb-client", () => ({
        docClient: { send: mockSend },
        TABLE_NAME: "test-table",
      }));

      const { loadCanonicalMappings } =
        await import("../../src/import/canonical-mapper");
      const mappings = await loadCanonicalMappings();

      expect(mappings.brands.get("zara")).toBe("Zara");
    });

    it("handles empty results from DynamoDB", async () => {
      const mockSend = vi.fn().mockResolvedValue({
        Items: [],
        LastEvaluatedKey: undefined,
      });

      vi.doMock("../../src/dynamodb-client", () => ({
        docClient: { send: mockSend },
        TABLE_NAME: "test-table",
      }));

      const { loadCanonicalMappings } =
        await import("../../src/import/canonical-mapper");
      const mappings = await loadCanonicalMappings();

      expect(mappings.brands.size).toBe(0);
      expect(mappings.colors.size).toBe(0);
    });

    it("handles paginated DynamoDB responses", async () => {
      const mockSend = vi.fn().mockImplementation((command: unknown) => {
        const cmd = command as {
          input: {
            KeyConditionExpression: string;
            ExpressionAttributeValues: Record<string, string>;
            ExclusiveStartKey?: unknown;
          };
        };
        const pk = cmd.input.ExpressionAttributeValues[":pk"];

        if (pk === "CANONICAL#BRANDS" && !cmd.input.ExclusiveStartKey) {
          return Promise.resolve({
            Items: [
              {
                PK: "CANONICAL#BRANDS",
                SK: "BRAND#Nike",
                name: "Nike",
                aliases: ["Nikke"],
              },
            ],
            LastEvaluatedKey: { PK: "CANONICAL#BRANDS", SK: "BRAND#Nike" },
          });
        }
        if (pk === "CANONICAL#BRANDS" && cmd.input.ExclusiveStartKey) {
          return Promise.resolve({
            Items: [
              {
                PK: "CANONICAL#BRANDS",
                SK: "BRAND#Adidas",
                name: "Adidas",
                aliases: [],
              },
            ],
            LastEvaluatedKey: undefined,
          });
        }
        if (pk === "CANONICAL#COLORS") {
          return Promise.resolve({
            Items: [
              {
                PK: "CANONICAL#COLORS",
                SK: "COLOR#Red",
                name: "Red",
                aliases: ["rot"],
              },
            ],
            LastEvaluatedKey: undefined,
          });
        }

        return Promise.resolve({ Items: [], LastEvaluatedKey: undefined });
      });

      vi.doMock("../../src/dynamodb-client", () => ({
        docClient: { send: mockSend },
        TABLE_NAME: "test-table",
      }));

      const { loadCanonicalMappings } =
        await import("../../src/import/canonical-mapper");
      const mappings = await loadCanonicalMappings();

      expect(mappings.brands.get("nike")).toBe("Nike");
      expect(mappings.brands.get("nikke")).toBe("Nike");
      expect(mappings.brands.get("adidas")).toBe("Adidas");
      expect(mappings.colors.get("red")).toBe("Red");
      expect(mappings.colors.get("rot")).toBe("Red");
    });
  });
});
