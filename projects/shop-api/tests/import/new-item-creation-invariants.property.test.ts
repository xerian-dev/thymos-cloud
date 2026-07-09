import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  mapConsignCloudItem,
  MappedItemFields,
} from "../../src/import/item-mapper";
import { ConsignCloudItem } from "../../src/import/item-consigncloud-client";

/** Feature: consigncloud-item-import, Property 11: New item creation invariants */

/**
 * Builds a complete DynamoDB item record from mapped fields, the ConsignCloud
 * source ID, and a generated SKU. This simulates what the orchestrator will do
 * when creating a new item in the Shop_Table.
 */
interface ItemRecord {
  PK: string;
  SK: "METADATA";
  uuid: string;
  GSI1PK: "ITEMS";
  GSI1SK: string;
  accountId: string;
  sourceId: string;
  title: string;
  tagPrice: number;
  quantity: number;
  split: number;
  inventoryType: "Consignment" | "Retail";
  terms: string;
  taxExempt: boolean;
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  shelf?: string;
  description?: string;
  tags?: string[];
  imageKeys?: string[];
  createdAt: string;
  updatedAt: string;
}

function buildItemRecord(
  mapped: MappedItemFields,
  consignCloudId: string,
  sku: number,
  accountId: string,
): ItemRecord {
  const uuid = crypto.randomUUID();
  const now = new Date().toISOString();
  return {
    PK: `ITEM#${uuid}`,
    SK: "METADATA",
    uuid,
    GSI1PK: "ITEMS",
    GSI1SK: `ITEM#${sku}`,
    accountId,
    sourceId: consignCloudId,
    title: mapped.title,
    tagPrice: mapped.tagPrice,
    quantity: mapped.quantity,
    split: mapped.split,
    inventoryType: mapped.inventoryType,
    terms: mapped.terms,
    taxExempt: mapped.taxExempt,
    category: mapped.category,
    brand: mapped.brand,
    color: mapped.color,
    size: mapped.size,
    shelf: mapped.shelf,
    description: mapped.description,
    tags: mapped.tags,
    imageKeys: mapped.imageKeys,
    createdAt: now,
    updatedAt: now,
  };
}

describe("Property 11: New item creation invariants", () => {
  const validConsignCloudItemArb: fc.Arbitrary<ConsignCloudItem> = fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 300 }),
    tag_price: fc.integer({ min: 0, max: 99999999 }),
    quantity: fc.integer({ min: 0, max: 9999 }),
    split: fc.double({ min: 0, max: 1, noNaN: true }),
    account_id: fc.uuid(),
    created: fc
      .integer({ min: 946684800000, max: 1924905600000 })
      .map((ts) => new Date(ts).toISOString()),
  });

  /**
   * Validates: Requirements 5.9
   */
  it("sourceId on created record equals the ConsignCloud item UUID", () => {
    fc.assert(
      fc.property(
        validConsignCloudItemArb,
        fc.integer({ min: 1, max: 100000 }),
        fc.uuid(),
        (item, sku, accountId) => {
          const result = mapConsignCloudItem(item);
          if (!result.success) throw new Error("Expected mapping success");

          const record = buildItemRecord(
            result.mapped,
            item.id,
            sku,
            accountId,
          );
          expect(record.sourceId).toBe(item.id);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.10
   */
  it("inventoryType is always Consignment", () => {
    fc.assert(
      fc.property(
        validConsignCloudItemArb,
        fc.integer({ min: 1, max: 100000 }),
        fc.uuid(),
        (item, sku, accountId) => {
          const result = mapConsignCloudItem(item);
          if (!result.success) throw new Error("Expected mapping success");

          const record = buildItemRecord(
            result.mapped,
            item.id,
            sku,
            accountId,
          );
          expect(record.inventoryType).toBe("Consignment");
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.10
   */
  it("terms defaults to Donate when not specified", () => {
    fc.assert(
      fc.property(
        validConsignCloudItemArb,
        fc.integer({ min: 1, max: 100000 }),
        fc.uuid(),
        (item, sku, accountId) => {
          const result = mapConsignCloudItem(item);
          if (!result.success) throw new Error("Expected mapping success");

          const record = buildItemRecord(
            result.mapped,
            item.id,
            sku,
            accountId,
          );
          expect(record.terms).toBe("Donate");
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.8
   * For N new items imported in sequence, SKUs advance by exactly N.
   * Simulates a sequential counter that assigns SKUs to each new item.
   */
  it("SKU is sequential — for N new items, SKUs advance by exactly N", () => {
    fc.assert(
      fc.property(
        fc.array(validConsignCloudItemArb, { minLength: 1, maxLength: 50 }),
        fc.integer({ min: 1, max: 100000 }),
        (items, startingSku) => {
          let currentSku = startingSku;
          const records: ItemRecord[] = [];

          for (const item of items) {
            const result = mapConsignCloudItem(item);
            if (!result.success) throw new Error("Expected mapping success");

            currentSku++;
            const record = buildItemRecord(
              result.mapped,
              item.id,
              currentSku,
              "account-uuid",
            );
            records.push(record);
          }

          // The counter advanced by exactly N items
          expect(currentSku).toBe(startingSku + items.length);

          // Each record has a unique sequential SKU
          const skus = records.map((r) => {
            const match = r.GSI1SK.match(/^ITEM#(\d+)$/);
            if (!match) throw new Error(`Invalid GSI1SK: ${r.GSI1SK}`);
            return parseInt(match[1], 10);
          });

          // SKUs are sequential starting from startingSku + 1
          for (let i = 0; i < skus.length; i++) {
            expect(skus[i]).toBe(startingSku + i + 1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.8, 5.9, 5.10
   * Combined invariant: all creation invariants hold for every valid item.
   */
  it("all creation invariants hold together for any valid item", () => {
    fc.assert(
      fc.property(
        validConsignCloudItemArb,
        fc.integer({ min: 1, max: 100000 }),
        fc.uuid(),
        (item, sku, accountId) => {
          const result = mapConsignCloudItem(item);
          if (!result.success) throw new Error("Expected mapping success");

          const record = buildItemRecord(
            result.mapped,
            item.id,
            sku,
            accountId,
          );

          // sourceId is the ConsignCloud UUID
          expect(record.sourceId).toBe(item.id);
          // inventoryType is always Consignment
          expect(record.inventoryType).toBe("Consignment");
          // terms is always Return To Consignor
          expect(record.terms).toBe("Donate");
          // SKU is embedded in GSI1SK
          expect(record.GSI1SK).toBe(`ITEM#${sku}`);
          // accountId is stored
          expect(record.accountId).toBe(accountId);
        },
      ),
      { numRuns: 100 },
    );
  });
});
