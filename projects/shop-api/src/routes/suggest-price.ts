import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, PRICING_TABLE_NAME } from "../dynamodb-client.js";
import { jsonResponse, errorResponse } from "../response.js";
import { calculateSuggestedPrice } from "../pricing/price-calculator.js";
import { buildExplanation } from "../pricing/explanation-builder.js";
import { classifyConfidence } from "../pricing/confidence-level.js";

/** Tier 2 uses medianTagPrice discounted by 10% as the reference price */
const UNSOLD_DISCOUNT_FACTOR = 0.9;

interface PricingRefRecord {
  brand: string;
  categoryId?: string;
  categoryName?: string;
  description?: string;
  referencePrice: number;
  medianTagPrice: number;
  medianSalePrice: number;
  sellThroughRate: number;
  medianDaysOnShelf: number;
  sampleSize: number;
  totalItems: number;
  unsoldCount: number;
  velocityMultiplier: number;
  colorAdjustments?: Record<string, number>;
  sizeAdjustments?: Record<string, number>;
}

interface EmployeePricingRecord {
  employeeId: string;
  creatorAdjustment: number;
  sampleSize: number;
}

interface PriceSuggestionResponse {
  suggestedPrice: number | null;
  confidence: "high" | "medium" | "low" | null;
  source: "sold" | "unsold" | null;
  explanation: string;
  warning: string | null;
  adjustments: {
    referencePrice: number;
    velocityMultiplier: number;
    creatorAdjustment: number;
    colorAdjustment: number;
    sizeAdjustment: number;
  } | null;
  groupInfo: {
    brand: string | null;
    description: string | null;
    category: string | null;
    sampleSize: number;
    sellThroughRate: number;
    medianDaysOnShelf: number;
    fallbackLevel: number;
  } | null;
}

interface FallbackResult {
  ref: PricingRefRecord | null;
  level: number;
  source: "sold" | "unsold";
}

export async function suggestPrice(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const params = event.queryStringParameters ?? {};

  const brand = params.brand ?? null;
  const categoryId = params.categoryId ?? null;
  const description = params.description ?? null;
  const color = params.color ?? null;
  const size = params.size ?? null;
  const createdBy = params.createdBy ?? null;

  // Validate: at least one of categoryId or description must be provided
  if (!categoryId && !description) {
    return jsonResponse(400, {
      error: "validation_error",
      fields: ["At least one of categoryId or description is required"],
    });
  }

  try {
    // Step 1: Resolve pricing reference via 6-level fallback chain
    const {
      ref: pricingRef,
      level: fallbackLevel,
      source,
    } = await resolvePriceRef(brand, description, categoryId);

    // No data available at all
    if (!pricingRef) {
      const noDataResponse: PriceSuggestionResponse = {
        suggestedPrice: null,
        confidence: null,
        source: null,
        explanation: "No pricing data available for this category",
        warning: null,
        adjustments: null,
        groupInfo: null,
      };
      return jsonResponse(200, noDataResponse);
    }

    // Step 2: Look up employee pricing if createdBy is provided
    let creatorAdjustment = 1.0;
    if (createdBy) {
      const employeePricing = await getEmployeePricing(createdBy);
      if (employeePricing && employeePricing.sampleSize >= 10) {
        creatorAdjustment = employeePricing.creatorAdjustment;
      }
    }

    // Step 3: Determine color and size adjustments
    const colorAdjustment =
      color && pricingRef.colorAdjustments?.[color]
        ? pricingRef.colorAdjustments[color]
        : 1.0;

    const sizeAdjustment =
      size && pricingRef.sizeAdjustments?.[size]
        ? pricingRef.sizeAdjustments[size]
        : 1.0;

    // Step 4: Determine reference price (Tier 2 uses discounted medianTagPrice)
    const referencePrice =
      source === "unsold"
        ? pricingRef.medianTagPrice * UNSOLD_DISCOUNT_FACTOR
        : pricingRef.referencePrice;

    // Step 5: Calculate suggested price
    const calcResult = calculateSuggestedPrice({
      referencePrice,
      velocityMultiplier: pricingRef.velocityMultiplier,
      creatorAdjustment,
      colorAdjustment,
      sizeAdjustment,
    });

    // Step 6: Build explanation
    const explanation = buildExplanation({
      fallbackLevel,
      source,
      brand: pricingRef.brand === "_NONE_" ? null : pricingRef.brand,
      category: pricingRef.categoryName ?? "",
      description: pricingRef.description ?? null,
      sampleSize: pricingRef.sampleSize,
      unsoldCount: pricingRef.unsoldCount,
      velocityMultiplier: pricingRef.velocityMultiplier,
      creatorAdjustment,
      colorAdjustment,
      sizeAdjustment,
      noData: false,
    });

    // Step 7: Classify confidence (Tier 2 is always "low")
    const confidence: "high" | "medium" | "low" =
      source === "unsold" ? "low" : classifyConfidence(pricingRef.sampleSize);

    // Step 8: Build warning for Tier 2 (unsold items)
    const warning: string | null =
      source === "unsold"
        ? `Price based on unsold items. Similar items in this group haven't sold yet — consider pricing below CHF ${pricingRef.medianTagPrice.toFixed(2)} (median tag price of unsold items).`
        : null;

    // Step 9: Build response
    const response: PriceSuggestionResponse = {
      suggestedPrice: calcResult.suggestedPrice,
      confidence,
      source,
      explanation,
      warning,
      adjustments: {
        referencePrice,
        velocityMultiplier: calcResult.adjustments.velocityMultiplier,
        creatorAdjustment: calcResult.adjustments.creatorAdjustment,
        colorAdjustment: calcResult.adjustments.colorAdjustment,
        sizeAdjustment: calcResult.adjustments.sizeAdjustment,
      },
      groupInfo: {
        brand: pricingRef.brand === "_NONE_" ? null : pricingRef.brand,
        description: pricingRef.description ?? null,
        category: pricingRef.categoryName ?? null,
        sampleSize: pricingRef.sampleSize,
        sellThroughRate: pricingRef.sellThroughRate,
        medianDaysOnShelf: pricingRef.medianDaysOnShelf,
        fallbackLevel,
      },
    };

    return jsonResponse(200, response);
  } catch (error: unknown) {
    console.error("suggestPrice error", {
      message: error instanceof Error ? error.message : "Unknown error",
      name: error instanceof Error ? error.name : undefined,
    });
    return errorResponse();
  }
}

/**
 * Resolves the pricing reference by following the 6-level fallback chain.
 *
 * Tier 1 (sold items — strong signal):
 *   1. brand × description (sampleSize > 0)
 *   2. description-only (sampleSize > 0)
 *   3. brand × categoryId (sampleSize > 0)
 *   4. category-only (sampleSize > 0)
 *
 * Tier 2 (unsold items — weak signal):
 *   5. brand × description (unsoldCount > 0)
 *   6. description-only (unsoldCount > 0)
 */
async function resolvePriceRef(
  brand: string | null,
  description: string | null,
  categoryId: string | null,
): Promise<FallbackResult> {
  // Tier 1: sold items
  if (description) {
    if (brand) {
      const ref = await getPricingRefByKey(
        `PRICING_REF#${brand}#DESC#${description}`,
      );
      if (ref && ref.sampleSize > 0) return { ref, level: 1, source: "sold" };
    }
    const ref = await getPricingRefByKey(
      `PRICING_REF#_NONE_#DESC#${description}`,
    );
    if (ref && ref.sampleSize > 0) return { ref, level: 2, source: "sold" };
  }

  if (categoryId) {
    if (brand) {
      const ref = await getPricingRefByKey(
        `PRICING_REF#${brand}#${categoryId}`,
      );
      if (ref && ref.sampleSize > 0) return { ref, level: 3, source: "sold" };
    }
    const ref = await getPricingRefByKey(`PRICING_REF#_NONE_#${categoryId}`);
    if (ref && ref.sampleSize > 0) return { ref, level: 4, source: "sold" };
  }

  // Tier 2: unsold items
  if (description) {
    if (brand) {
      const ref = await getPricingRefByKey(
        `PRICING_REF#${brand}#DESC#${description}`,
      );
      if (ref && ref.unsoldCount > 0)
        return { ref, level: 5, source: "unsold" };
    }
    const ref = await getPricingRefByKey(
      `PRICING_REF#_NONE_#DESC#${description}`,
    );
    if (ref && ref.unsoldCount > 0) return { ref, level: 6, source: "unsold" };
  }

  return { ref: null, level: 0, source: "sold" };
}

async function getPricingRefByKey(
  pk: string,
): Promise<PricingRefRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: PRICING_TABLE_NAME,
      Key: {
        PK: pk,
        SK: "METADATA",
      },
    }),
  );

  if (!result.Item) {
    return null;
  }

  return result.Item as unknown as PricingRefRecord;
}

async function getEmployeePricing(
  employeeId: string,
): Promise<EmployeePricingRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: PRICING_TABLE_NAME,
      Key: {
        PK: `EMPLOYEE_PRICING#${employeeId}`,
        SK: "METADATA",
      },
    }),
  );

  if (!result.Item) {
    return null;
  }

  return result.Item as unknown as EmployeePricingRecord;
}
