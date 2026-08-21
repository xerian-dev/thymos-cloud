/**
 * Compute Prices handler.
 *
 * Scans all items and sale line items from the shop table, applies canonical
 * mappings from S3, groups by brand × description, computes pricing statistics
 * and adjustment detection, then writes PRICING_REF and ADJUSTMENT_EVENT records
 * to the pricing table.
 *
 * Triggered weekly by EventBridge or on-demand via POST /api/pricing/compute.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { computeVelocityMultiplier } from "../pricing/velocity-multiplier.js";
import { groupItems, canonicalizeBrand } from "./grouping.js";
import type { ComputeItem } from "./grouping.js";
import { loadCanonicalMappings } from "./mappings-loader.js";
import type { CanonicalMappings } from "./mappings-loader.js";
import { detectAdjustment } from "./adjustment-detector.js";
import type { PricingRef, ComputedStats } from "./adjustment-detector.js";

const TABLE_NAME = process.env.TABLE_NAME ?? "";
const PRICING_TABLE_NAME = process.env.PRICING_TABLE_NAME ?? "";
const BUCKET_NAME = process.env.BUCKET_NAME ?? "";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

interface ItemRecord {
  PK: string;
  uuid: string;
  brand?: string;
  description?: string;
  tagPrice?: number;
  status?: string;
  color?: string;
  size?: string;
  lastSold?: string;
  daysOnShelf?: number;
}

interface LineItemRecord {
  PK: string;
  SK: string;
  itemId?: string;
  salePrice?: number;
  discount?: number;
  createdAt?: string;
}

interface ExistingPricingRef {
  PK: string;
  SK: string;
  brand: string;
  description: string;
  referencePrice: number;
  previousReferencePrice?: number;
  originalBaseline?: number;
  medianTagPrice: number;
  medianSalePrice: number;
  sellThroughRate: number;
  medianDaysOnShelf: number;
  discountFrequency: number;
  sampleSize: number;
  totalItems?: number;
  unsoldCount?: number;
  velocityMultiplier: number;
  lowConfidence: boolean;
  colorAdjustments?: Record<string, number>;
  patternAdjustments?: Record<string, number>;
  sizeAdjustments?: Record<string, number>;
  computedAt: string;
}

async function scanAllItems(): Promise<ItemRecord[]> {
  const items: ItemRecord[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "begins_with(PK, :prefix) AND SK = :sk",
        ExpressionAttributeValues: {
          ":prefix": "ITEM#",
          ":sk": "METADATA",
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    if (result.Items) {
      items.push(...(result.Items as unknown as ItemRecord[]));
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  return items;
}

async function scanAllSaleLineItems(
  sixMonthsAgo: string,
): Promise<LineItemRecord[]> {
  const lineItems: LineItemRecord[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression:
          "begins_with(PK, :prefix) AND begins_with(SK, :skPrefix) AND createdAt >= :since",
        ExpressionAttributeValues: {
          ":prefix": "SALE#",
          ":skPrefix": "LINE_ITEM#",
          ":since": sixMonthsAgo,
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    if (result.Items) {
      lineItems.push(...(result.Items as unknown as LineItemRecord[]));
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  return lineItems;
}

async function readExistingPricingRefs(): Promise<
  Map<string, ExistingPricingRef>
> {
  const refs = new Map<string, ExistingPricingRef>();
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: PRICING_TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: {
          ":pk": "PRICING_REFS",
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    if (result.Items) {
      for (const item of result.Items) {
        const ref = item as unknown as ExistingPricingRef;
        const key = `${ref.brand}#${ref.description}`;
        refs.set(key, ref);
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  return refs;
}

function buildComputeItems(
  items: ItemRecord[],
  lineItemsByItemId: Map<string, LineItemRecord>,
  mappings: CanonicalMappings,
): ComputeItem[] {
  const computeItems: ComputeItem[] = [];

  for (const item of items) {
    // Apply description mapping — description is mandatory
    const rawDescription = item.description ?? "";
    const canonicalDescription =
      mappings.description.get(rawDescription) ?? rawDescription;

    if (!canonicalDescription || canonicalDescription.trim() === "") {
      continue; // Exclude items without a description
    }

    // Apply brand mapping
    const rawBrand = item.brand ?? "";
    const mappedBrand = mappings.brand.get(rawBrand) ?? rawBrand;
    const brand = canonicalizeBrand(mappedBrand);

    // Apply color mapping
    const rawColor = item.color ?? "";
    const canonicalColor = rawColor
      ? (mappings.color.get(rawColor) ?? null)
      : null;

    // Extract pattern from color mapping
    const canonicalPattern = rawColor
      ? (mappings.pattern.get(rawColor) ?? null)
      : null;

    // Apply size mapping
    const rawSize = item.size ?? "";
    const canonicalSize = rawSize
      ? (mappings.size.get(rawSize) ?? rawSize)
      : null;

    // Resolve sale data
    const lineItem = lineItemsByItemId.get(item.uuid);
    const salePrice =
      item.status === "sold" && lineItem?.salePrice != null
        ? lineItem.salePrice / 100
        : null;

    const discounted =
      item.status === "sold" &&
      lineItem?.discount != null &&
      lineItem.discount > 0;

    computeItems.push({
      brand,
      description: canonicalDescription,
      tagPrice: item.tagPrice ?? 0,
      salePrice,
      status: item.status ?? "active",
      daysOnShelf: item.daysOnShelf ?? null,
      color: canonicalColor,
      pattern: canonicalPattern,
      size: canonicalSize,
      discounted,
    });
  }

  return computeItems;
}

export async function handler(): Promise<void> {
  const startTime = Date.now();
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoIso = sixMonthsAgo.toISOString();

  console.log(
    `[ComputePrices] Starting. Window: ${sixMonthsAgoIso} to ${now.toISOString()}`,
  );

  // Step 1: Scan all items
  const allItems = await scanAllItems();
  console.log(`[ComputePrices] Scanned ${allItems.length} items`);

  // Step 2: Scan sale line items from last 6 months
  const saleLineItems = await scanAllSaleLineItems(sixMonthsAgoIso);
  console.log(
    `[ComputePrices] Scanned ${saleLineItems.length} sale line items in window`,
  );

  // Step 3: Load canonical mappings from S3
  const mappings = await loadCanonicalMappings(BUCKET_NAME);
  console.log(
    `[ComputePrices] Loaded mappings — brand: ${mappings.brand.size}, description: ${mappings.description.size}, color: ${mappings.color.size}, pattern: ${mappings.pattern.size}, size: ${mappings.size.size}`,
  );

  // Build lookup: itemId → most recent line item (for salePrice)
  const lineItemsByItemId = new Map<string, LineItemRecord>();
  for (const li of saleLineItems) {
    if (!li.itemId) {
      continue;
    }
    const existing = lineItemsByItemId.get(li.itemId);
    if (
      !existing ||
      (li.createdAt && existing.createdAt && li.createdAt > existing.createdAt)
    ) {
      lineItemsByItemId.set(li.itemId, li);
    }
  }

  // Step 4: Filter items to 6-month window for sold items
  const windowItems = allItems.filter((item) => {
    if (item.status === "sold") {
      return item.lastSold != null && item.lastSold >= sixMonthsAgoIso;
    }
    return true;
  });

  // Step 5: Build compute items (apply mappings in-memory)
  const computeItems = buildComputeItems(
    windowItems,
    lineItemsByItemId,
    mappings,
  );
  console.log(
    `[ComputePrices] ${computeItems.length} items eligible (have description)`,
  );

  // Step 6: Group by brand × description
  const groupStats = groupItems(computeItems);
  console.log(
    `[ComputePrices] Computed statistics for ${groupStats.size} groups`,
  );

  // Step 7: Read existing pricing references
  const existingRefs = await readExistingPricingRefs();
  console.log(
    `[ComputePrices] Read ${existingRefs.size} existing pricing references`,
  );

  let groupsProcessed = 0;
  let recordsWritten = 0;
  let adjustmentEventsWritten = 0;

  // Step 8–11: Process each group
  for (const [groupKey, stats] of groupStats) {
    try {
      const previousRef = existingRefs.get(groupKey) ?? null;

      // Compute price ratio
      const priceRatio =
        stats.medianTagPrice > 0
          ? stats.medianSalePrice / stats.medianTagPrice
          : 1;

      // Build previous pricing ref for adjustment detection
      const previousPricingRef: PricingRef | null = previousRef
        ? {
            referencePrice: previousRef.referencePrice,
            originalBaseline:
              previousRef.originalBaseline ?? previousRef.referencePrice,
            sellThroughRate: previousRef.sellThroughRate,
            medianDaysOnShelf: previousRef.medianDaysOnShelf,
            sampleSize: previousRef.sampleSize,
            priceRatio:
              previousRef.medianTagPrice > 0
                ? previousRef.medianSalePrice / previousRef.medianTagPrice
                : 1,
          }
        : null;

      // Build current stats for adjustment detection
      const currentStats: ComputedStats = {
        referencePrice: stats.medianSalePrice,
        sellThroughRate: stats.sellThroughRate,
        medianDaysOnShelf: stats.medianDaysOnShelf,
        sampleSize: stats.sampleSize,
        priceRatio,
      };

      // Detect adjustment (applies caps, checks conditions)
      const { event: adjustmentEvent, adjustedPrice } = detectAdjustment(
        previousPricingRef,
        currentStats,
        stats.brand,
        stats.description,
        stats.discountFrequency,
      );

      const newReferencePrice = adjustedPrice;
      const originalBaseline =
        previousRef?.originalBaseline ??
        previousRef?.referencePrice ??
        newReferencePrice;

      // Compute velocity multiplier
      const velocityMultiplier = computeVelocityMultiplier(
        stats.sellThroughRate,
        priceRatio,
        stats.medianDaysOnShelf,
        stats.sampleSize,
      );

      const computedAt = now.toISOString();

      // Write PRICING_REF record
      await docClient.send(
        new PutCommand({
          TableName: PRICING_TABLE_NAME,
          Item: {
            PK: `PRICING_REF#${stats.brand}#${stats.description}`,
            SK: "METADATA",
            GSI1PK: "PRICING_REFS",
            GSI1SK: `PRICING_REF#${stats.brand}#${stats.description}`,
            brand: stats.brand,
            description: stats.description,
            referencePrice: newReferencePrice,
            previousReferencePrice: previousRef?.referencePrice ?? null,
            originalBaseline,
            medianTagPrice: stats.medianTagPrice,
            medianSalePrice: stats.medianSalePrice,
            sellThroughRate: stats.sellThroughRate,
            medianDaysOnShelf: stats.medianDaysOnShelf,
            discountFrequency: stats.discountFrequency,
            sampleSize: stats.sampleSize,
            totalItems: stats.totalItems,
            unsoldCount: stats.unsoldCount,
            velocityMultiplier,
            lowConfidence: stats.sampleSize < 5,
            colorAdjustments: stats.colorAdjustments,
            patternAdjustments: stats.patternAdjustments,
            sizeAdjustments: stats.sizeAdjustments,
            computedAt,
            updatedAt: computedAt,
          },
        }),
      );
      recordsWritten++;

      // Write ADJUSTMENT_EVENT if detected
      if (adjustmentEvent) {
        const adjustmentId = crypto.randomUUID();
        const timestamp = computedAt;

        await docClient.send(
          new PutCommand({
            TableName: PRICING_TABLE_NAME,
            Item: {
              PK: `ADJUSTMENT#${adjustmentId}`,
              SK: "METADATA",
              GSI1PK: "ADJUSTMENTS",
              GSI1SK: `ADJUSTMENT#${timestamp}`,
              id: adjustmentId,
              brand: adjustmentEvent.brand,
              description: adjustmentEvent.description,
              previousPrice: adjustmentEvent.previousPrice,
              newPrice: adjustmentEvent.newPrice,
              direction: adjustmentEvent.direction,
              percentageChange: adjustmentEvent.percentageChange,
              reason: adjustmentEvent.reason,
              metrics: adjustmentEvent.metrics,
              timestamp,
            },
          }),
        );
        adjustmentEventsWritten++;
      }

      groupsProcessed++;
    } catch (error) {
      console.error(
        `[ComputePrices] Error processing group ${groupKey}:`,
        error,
      );
    }
  }

  // Log execution metrics
  const duration = Date.now() - startTime;
  console.log(`[ComputePrices] Completed:`);
  console.log(`  Groups processed: ${groupsProcessed}`);
  console.log(`  Pricing refs written: ${recordsWritten}`);
  console.log(`  Adjustment events written: ${adjustmentEventsWritten}`);
  console.log(`  Duration: ${duration}ms`);
}
