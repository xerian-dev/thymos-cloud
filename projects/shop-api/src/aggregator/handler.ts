import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { computeVelocityMultiplier } from "../pricing/velocity-multiplier.js";
import { groupItemsByBrandCategory } from "./grouping.js";
import type { AggregatorItem } from "./grouping.js";
import { computeEmployeeAccuracy } from "./employee-accuracy.js";
import type { EmployeeSaleRecord } from "./employee-accuracy.js";
import { detectAdjustment } from "./adjustment-detector.js";
import type { PricingRef, ComputedStats } from "./adjustment-detector.js";

const TABLE_NAME = process.env.TABLE_NAME ?? "";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

interface ItemRecord {
  PK: string;
  uuid: string;
  brand?: string;
  categoryId?: string;
  categoryName?: string;
  tagPrice?: number;
  status?: string;
  color?: string;
  size?: string;
  createdBy?: string;
  lastSold?: string;
  daysOnShelf?: number;
  inventoryType?: string;
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
  categoryId: string;
  categoryName: string;
  referencePrice: number;
  previousReferencePrice?: number;
  originalBaseline?: number;
  medianTagPrice: number;
  medianSalePrice: number;
  sellThroughRate: number;
  medianDaysOnShelf: number;
  discountFrequency: number;
  sampleSize: number;
  velocityMultiplier: number;
  lowConfidence: boolean;
  colorAdjustments?: Record<string, number>;
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
        TableName: TABLE_NAME,
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
        const key = `${ref.brand}#${ref.categoryId}`;
        refs.set(key, ref);
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  return refs;
}

function buildAggregatorItems(
  items: ItemRecord[],
  lineItemsByItemId: Map<string, LineItemRecord>,
): AggregatorItem[] {
  const aggregatorItems: AggregatorItem[] = [];

  for (const item of items) {
    if (!item.categoryId) {
      continue;
    }

    const lineItem = lineItemsByItemId.get(item.uuid);
    const salePrice =
      item.status === "sold" && lineItem?.salePrice != null
        ? lineItem.salePrice / 100
        : null;

    const discounted =
      item.status === "sold" &&
      lineItem?.discount != null &&
      lineItem.discount > 0;

    aggregatorItems.push({
      brand: item.brand ?? null,
      categoryId: item.categoryId,
      categoryName: item.categoryName ?? item.categoryId,
      tagPrice: item.tagPrice ?? 0,
      salePrice,
      status: item.status ?? "active",
      daysOnShelf: item.daysOnShelf ?? null,
      color: item.color ?? null,
      size: item.size ?? null,
      createdBy: item.createdBy ?? null,
      soldAt: item.lastSold ?? null,
      discounted,
    });
  }

  return aggregatorItems;
}

function buildEmployeeSaleRecords(
  items: ItemRecord[],
  lineItemsByItemId: Map<string, LineItemRecord>,
  sixMonthsAgo: Date,
): Map<string, EmployeeSaleRecord[]> {
  const employeeMap = new Map<string, EmployeeSaleRecord[]>();

  for (const item of items) {
    if (item.status !== "sold" || !item.createdBy || !item.lastSold) {
      continue;
    }

    const soldDate = new Date(item.lastSold);
    if (soldDate < sixMonthsAgo) {
      continue;
    }

    const lineItem = lineItemsByItemId.get(item.uuid);
    if (!lineItem?.salePrice) {
      continue;
    }

    const record: EmployeeSaleRecord = {
      employeeId: item.createdBy,
      employeeName: item.createdBy,
      tagPrice: item.tagPrice ?? 0,
      salePrice: lineItem.salePrice / 100,
      soldAt: item.lastSold,
    };

    const existing = employeeMap.get(item.createdBy);
    if (existing) {
      existing.push(record);
    } else {
      employeeMap.set(item.createdBy, [record]);
    }
  }

  return employeeMap;
}

export async function handler(): Promise<void> {
  const startTime = Date.now();
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoIso = sixMonthsAgo.toISOString();

  console.log(
    `[Aggregator] Starting pricing aggregation. Window: ${sixMonthsAgoIso} to ${now.toISOString()}`,
  );

  // Step 1: Scan all items
  const allItems = await scanAllItems();
  console.log(`[Aggregator] Scanned ${allItems.length} items`);

  // Step 2: Scan sale line items from last 6 months
  const saleLineItems = await scanAllSaleLineItems(sixMonthsAgoIso);
  console.log(
    `[Aggregator] Scanned ${saleLineItems.length} sale line items in window`,
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

  // Filter items to 6-month window for sold items (all items needed for sell-through)
  const windowItems = allItems.filter((item) => {
    if (item.status === "sold") {
      return item.lastSold != null && item.lastSold >= sixMonthsAgoIso;
    }
    // Non-sold items contribute to total count for sell-through calculation
    return true;
  });

  // Step 3: Build AggregatorItem array and group by brand×category
  const aggregatorItems = buildAggregatorItems(windowItems, lineItemsByItemId);
  const groupStats = groupItemsByBrandCategory(aggregatorItems);
  console.log(`[Aggregator] Computed statistics for ${groupStats.size} groups`);

  // Step 4: Compute employee accuracy
  const employeeSaleRecords = buildEmployeeSaleRecords(
    allItems,
    lineItemsByItemId,
    sixMonthsAgo,
  );
  console.log(
    `[Aggregator] Computing accuracy for ${employeeSaleRecords.size} employees`,
  );

  // Step 5: Read existing pricing reference records
  const existingRefs = await readExistingPricingRefs();
  console.log(
    `[Aggregator] Read ${existingRefs.size} existing pricing references`,
  );

  let groupsProcessed = 0;
  let recordsWritten = 0;
  let adjustmentEventsWritten = 0;

  // Step 6-9: Process each group
  for (const [groupKey, stats] of groupStats) {
    try {
      const previousRef = existingRefs.get(groupKey) ?? null;

      // Compute price ratio for this group
      const priceRatio =
        stats.medianTagPrice > 0
          ? stats.medianSalePrice / stats.medianTagPrice
          : 1;

      // Build the previous pricing ref in the shape expected by detectAdjustment
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

      // Build current computed stats for adjustment detection
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
        stats.categoryName,
        stats.categoryId,
        stats.discountFrequency,
      );

      // The adjusted price is the new reference price
      const newReferencePrice = adjustedPrice;

      const originalBaseline =
        previousRef?.originalBaseline ??
        previousRef?.referencePrice ??
        newReferencePrice;

      // Compute velocity multiplier for storage
      const velocityMultiplier = computeVelocityMultiplier(
        stats.sellThroughRate,
        priceRatio,
        stats.medianDaysOnShelf,
        stats.sampleSize,
      );

      const computedAt = now.toISOString();

      // Step 7: Write PRICING_REF record
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `PRICING_REF#${stats.brand}#${stats.categoryId}`,
            SK: "METADATA",
            GSI1PK: "PRICING_REFS",
            GSI1SK: `PRICING_REF#${stats.brand}#${stats.categoryId}`,
            brand: stats.brand,
            categoryId: stats.categoryId,
            categoryName: stats.categoryName,
            referencePrice: newReferencePrice,
            previousReferencePrice: previousRef?.referencePrice ?? null,
            originalBaseline,
            medianTagPrice: stats.medianTagPrice,
            medianSalePrice: stats.medianSalePrice,
            sellThroughRate: stats.sellThroughRate,
            medianDaysOnShelf: stats.medianDaysOnShelf,
            discountFrequency: stats.discountFrequency,
            sampleSize: stats.sampleSize,
            velocityMultiplier,
            lowConfidence: stats.sampleSize < 5,
            colorAdjustments: stats.colorAdjustments,
            sizeAdjustments: stats.sizeAdjustments,
            computedAt,
            updatedAt: computedAt,
          },
        }),
      );
      recordsWritten++;

      // Step 9: Write ADJUSTMENT_EVENT if detected
      if (adjustmentEvent) {
        const adjustmentId = crypto.randomUUID();
        const timestamp = computedAt;

        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: `ADJUSTMENT#${adjustmentId}`,
              SK: "METADATA",
              GSI1PK: "ADJUSTMENTS",
              GSI1SK: `ADJUSTMENT#${timestamp}`,
              id: adjustmentId,
              brand: adjustmentEvent.brand,
              category: adjustmentEvent.category,
              categoryId: adjustmentEvent.categoryId,
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
      console.error(`[Aggregator] Error processing group ${groupKey}:`, error);
      // Continue to next group — be resilient
    }
  }

  // Step 8: Write EMPLOYEE_PRICING records
  let employeeRecordsWritten = 0;
  for (const [employeeId, records] of employeeSaleRecords) {
    try {
      const result = computeEmployeeAccuracy(records, now);

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `EMPLOYEE_PRICING#${employeeId}`,
            SK: "METADATA",
            employeeId: result.employeeId,
            employeeName: result.employeeName,
            pricingAccuracy: result.pricingAccuracy,
            sampleSize: result.sampleSize,
            creatorAdjustment: result.creatorAdjustment,
            computedAt: now.toISOString(),
          },
        }),
      );
      employeeRecordsWritten++;
    } catch (error) {
      console.error(
        `[Aggregator] Error writing employee pricing for ${employeeId}:`,
        error,
      );
    }
  }

  recordsWritten += employeeRecordsWritten;

  // Step 10: Log execution metrics
  const duration = Date.now() - startTime;
  console.log(`[Aggregator] Completed pricing aggregation:`);
  console.log(`  Groups processed: ${groupsProcessed}`);
  console.log(`  Pricing refs written: ${groupsProcessed}`);
  console.log(`  Employee records written: ${employeeRecordsWritten}`);
  console.log(`  Adjustment events written: ${adjustmentEventsWritten}`);
  console.log(
    `  Total records written: ${recordsWritten + adjustmentEventsWritten}`,
  );
  console.log(`  Duration: ${duration}ms`);
}
