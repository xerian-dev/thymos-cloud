import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DynamoDB client
const mockSend = vi.fn();
vi.mock("./dynamodb-client", () => ({
  docClient: { send: (...args: unknown[]) => mockSend(...args) },
  TABLE_NAME: "test-table",
}));

// Mock source-id-lookup
const mockFindBySourceId = vi.fn();
vi.mock("./source-id-lookup", () => ({
  findBySourceId: (...args: unknown[]) => mockFindBySourceId(...args),
}));

// Mock sequence-service
const mockGetNextSequenceNumber = vi.fn();
const mockSeedSequenceCounter = vi.fn();
vi.mock("./sequence-service", () => ({
  getNextSequenceNumber: (...args: unknown[]) =>
    mockGetNextSequenceNumber(...args),
  seedSequenceCounter: (...args: unknown[]) =>
    mockSeedSequenceCounter(...args),
}));

// Mock crypto.randomUUID for deterministic tests
vi.mock("node:crypto", () => ({
  randomUUID: () => "test-uuid-1234",
}));

import { upsertItem } from "./upsert-service";
import type { MappedItem } from "./item-mapper";

const baseMapped: MappedItem = {
  title: "Test Item",
  tagPrice: 25.0,
  quantity: 1,
  split: 60,
  inventoryType: "Consignment",
  terms: "Donate",
  taxExempt: false,
  status: "active",
  sourceId: "item-source-123",
  createdAt: "2024-01-15T10:30:00Z",
};

describe("upsertItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips item when account source ID is present but account not found", async () => {
    // First call: item lookup (not found)
    // Second call: account lookup (not found)
    mockFindBySourceId
      .mockResolvedValueOnce(undefined) // item lookup by sourceId
      .mockResolvedValueOnce(undefined); // account lookup

    const raw = { id: "item-source-123", account_id: "acc-source-999" };
    const result = await upsertItem(baseMapped, raw);
    expect(result).toEqual({ action: "skipped" });
  });

  it("uses CC SKU directly when raw.sku is a positive integer string", async () => {
    mockFindBySourceId.mockResolvedValue(undefined); // item not existing
    mockSend.mockResolvedValue({}); // PutCommand succeeds
    mockSeedSequenceCounter.mockResolvedValue(undefined);

    const raw = { id: "item-source-123", sku: "42" };
    const result = await upsertItem(baseMapped, raw);

    expect(result).toEqual({ action: "created" });
    expect(mockGetNextSequenceNumber).not.toHaveBeenCalled();
    expect(mockSeedSequenceCounter).toHaveBeenCalledWith("ITEM", 42);

    // Verify the PutCommand was called with sku: 42 and correct GSI1SK
    const putCall = mockSend.mock.calls[0][0];
    expect(putCall.input.Item.sku).toBe(42);
    expect(putCall.input.Item.GSI1SK).toBe("ITEM#0000042");
    expect(putCall.input.Item.sourceSku).toBe("42");
  });

  it("falls back to sequence counter when raw.sku is non-numeric", async () => {
    mockFindBySourceId.mockResolvedValue(undefined);
    mockGetNextSequenceNumber.mockResolvedValue(100);
    mockSend.mockResolvedValue({});

    const raw = { id: "item-source-123", sku: "abc" };
    const result = await upsertItem(baseMapped, raw);

    expect(result).toEqual({ action: "created" });
    expect(mockGetNextSequenceNumber).toHaveBeenCalledWith("ITEM");
    expect(mockSeedSequenceCounter).not.toHaveBeenCalled();
  });

  it("writes GSI2 and GSI3 keys when account and category are resolved", async () => {
    mockFindBySourceId
      .mockResolvedValueOnce(undefined) // item lookup (not existing)
      .mockResolvedValueOnce({
        PK: "ACCOUNT#acc-uuid-123",
        SK: "METADATA",
      }) // account lookup
      .mockResolvedValueOnce({
        PK: "CATEGORY#cat-uuid-456",
        SK: "METADATA",
      }); // category lookup
    mockGetNextSequenceNumber.mockResolvedValue(1);
    mockSend.mockResolvedValue({});

    const raw = {
      id: "item-source-123",
      account_id: "acc-source-1",
      category: { id: "cat-source-1", name: "Clothing" },
    };
    const result = await upsertItem(baseMapped, raw);

    expect(result).toEqual({ action: "created" });
    const putCall = mockSend.mock.calls[0][0];
    expect(putCall.input.Item.GSI2PK).toBe("ACCOUNT#acc-uuid-123");
    expect(putCall.input.Item.GSI2SK).toMatch(/^ITEM#/);
    expect(putCall.input.Item.GSI3PK).toBe("CATEGORY#cat-uuid-456");
    expect(putCall.input.Item.GSI3SK).toMatch(/^ITEM#/);
  });

  it("update path includes status and new optional fields", async () => {
    mockFindBySourceId.mockResolvedValueOnce({
      PK: "ITEM#existing-uuid",
      SK: "METADATA",
    });
    mockSend.mockResolvedValue({});

    const mappedWithFields: MappedItem = {
      ...baseMapped,
      status: "parked",
      location: "Main Floor",
      details: "Some details",
      scheduleStart: "2024-03-01T00:00:00Z",
      expirationDate: "2024-12-31T23:59:59Z",
      lastSold: "2024-02-15T14:00:00Z",
      lastViewed: "2024-06-01T10:00:00Z",
      labelPrintedAt: "2024-01-20T09:00:00Z",
      daysOnShelf: 42,
      deleted: "2024-05-10T12:00:00Z",
    };

    const raw = { id: "item-source-123" };
    const result = await upsertItem(mappedWithFields, raw);

    expect(result).toEqual({ action: "updated" });
    const updateCall = mockSend.mock.calls[0][0];
    const expr = updateCall.input.UpdateExpression;
    expect(expr).toContain("#st = :status");
    expect(expr).toContain("#loc = :location");
    expect(expr).toContain("details = :details");
    expect(expr).toContain("scheduleStart = :scheduleStart");
    expect(expr).toContain("expirationDate = :expirationDate");
    expect(expr).toContain("lastSold = :lastSold");
    expect(expr).toContain("lastViewed = :lastViewed");
    expect(expr).toContain("labelPrintedAt = :labelPrintedAt");
    expect(expr).toContain("daysOnShelf = :daysOnShelf");
    expect(expr).toContain("deleted = :deleted");
    expect(updateCall.input.ExpressionAttributeValues[":status"]).toBe(
      "parked",
    );
    expect(updateCall.input.ExpressionAttributeValues[":location"]).toBe(
      "Main Floor",
    );
  });

  it("proceeds without accountId when no account source ID is present", async () => {
    mockFindBySourceId.mockResolvedValue(undefined);
    mockGetNextSequenceNumber.mockResolvedValue(1);
    mockSend.mockResolvedValue({});

    const raw = { id: "item-source-123" }; // No account_id or account.id
    const result = await upsertItem(baseMapped, raw);

    expect(result).toEqual({ action: "created" });
    const putCall = mockSend.mock.calls[0][0];
    expect(putCall.input.Item.accountId).toBe("");
    expect(putCall.input.Item.GSI2PK).toBeUndefined();
  });
});
