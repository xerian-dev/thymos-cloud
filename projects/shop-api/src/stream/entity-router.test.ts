import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseEntityType, routeRecord, ValidationError } from "./entity-router";

vi.mock("./account-mapper", () => ({
  mapAccount: vi.fn(() => ({ sourceId: "acc-1", firstName: "Test" })),
}));

vi.mock("./item-mapper", () => ({
  mapItem: vi.fn(() => ({ success: true, mapped: { sourceId: "item-1" } })),
}));

vi.mock("./sale-mapper", () => ({
  mapSale: vi.fn(() => ({
    success: true,
    sale: { sourceId: "sale-1" },
    lineItems: [],
  })),
}));

vi.mock("./upsert-service", () => ({
  upsertAccount: vi.fn(async () => ({ action: "created" })),
  upsertItem: vi.fn(async () => ({ action: "created" })),
  upsertSale: vi.fn(async () => ({ action: "created" })),
}));

import { mapAccount } from "./account-mapper";
import { mapItem } from "./item-mapper";
import { mapSale } from "./sale-mapper";
import { upsertAccount, upsertItem, upsertSale } from "./upsert-service";

describe("parseEntityType", () => {
  it("parses ACCOUNT from a valid PK", () => {
    expect(parseEntityType("IMPORT#CONSIGNCLOUD#ACCOUNT#abc-123")).toBe(
      "ACCOUNT",
    );
  });

  it("parses ITEM from a valid PK", () => {
    expect(parseEntityType("IMPORT#CONSIGNCLOUD#ITEM#def-456")).toBe("ITEM");
  });

  it("parses SALE from a valid PK", () => {
    expect(parseEntityType("IMPORT#CONSIGNCLOUD#SALE#ghi-789")).toBe("SALE");
  });

  it("returns null for unrecognised entity type", () => {
    expect(parseEntityType("IMPORT#CONSIGNCLOUD#UNKNOWN#xyz")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseEntityType("")).toBeNull();
  });

  it("returns null for PK with too few segments", () => {
    expect(parseEntityType("IMPORT#CONSIGNCLOUD")).toBeNull();
  });

  it("returns null for lowercase entity type", () => {
    expect(parseEntityType("IMPORT#CONSIGNCLOUD#account#abc")).toBeNull();
  });

  it("handles PK with extra hash segments in the ID", () => {
    expect(parseEntityType("IMPORT#CONSIGNCLOUD#ACCOUNT#id-with#hash")).toBe(
      "ACCOUNT",
    );
  });
});

describe("routeRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes ACCOUNT to mapAccount + upsertAccount", async () => {
    const raw = { id: "acc-1", first_name: "Test" };
    await routeRecord({
      entityType: "ACCOUNT",
      rawAttributes: raw,
    });

    expect(mapAccount).toHaveBeenCalledWith(raw);
    expect(upsertAccount).toHaveBeenCalledWith(
      { sourceId: "acc-1", firstName: "Test" },
      raw,
    );
  });

  it("routes ITEM to mapItem + upsertItem on success", async () => {
    await routeRecord({
      entityType: "ITEM",
      rawAttributes: { id: "item-1", title: "Widget" },
    });

    expect(mapItem).toHaveBeenCalledWith({ id: "item-1", title: "Widget" });
    expect(upsertItem).toHaveBeenCalled();
  });

  it("throws ValidationError when mapItem returns failure", async () => {
    vi.mocked(mapItem).mockReturnValueOnce({
      success: false,
      error: "Missing required fields: title and sku",
    });

    await expect(
      routeRecord({
        entityType: "ITEM",
        rawAttributes: {},
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("routes SALE to mapSale + upsertSale on success", async () => {
    const raw = { id: "sale-1", number: "S001", created: "2024-01-01" };

    await routeRecord({
      entityType: "SALE",
      rawAttributes: raw,
    });

    expect(mapSale).toHaveBeenCalledWith(raw);
    expect(upsertSale).toHaveBeenCalled();
  });

  it("throws ValidationError when mapSale returns failure", async () => {
    vi.mocked(mapSale).mockReturnValueOnce({
      success: false,
      error: "Missing required field: id",
    });

    await expect(
      routeRecord({
        entityType: "SALE",
        rawAttributes: {},
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("logs warning for unrecognised entity type (no throw)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      routeRecord({
        entityType: "UNKNOWN" as never,
        rawAttributes: {},
      }),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unrecognised entity type"),
    );

    warnSpy.mockRestore();
  });
});
