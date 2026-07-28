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

interface PricingRefRecord {
  brand: string;
  categoryId: string;
  categoryName: string;
  referencePrice: number;
  sellThroughRate: number;
  medianDaysOnShelf: number;
  sampleSize: number;
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
  explanation: string;
  adjustments: {
    referencePrice: number;
    velocityMultiplier: number;
    creatorAdjustment: number;
    colorAdjustment: number;
    sizeAdjustment: number;
  } | null;
  groupInfo: {
    brand: string | null;
    category: string | null;
    sampleSize: number;
    sellThroughRate: number;
    medianDaysOnShelf: number;
  } | null;
}

export async function suggestPrice(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const params = event.queryStringParameters ?? {};

  const brand = params.brand ?? null;
  const categoryId = params.categoryId ?? null;
  const color = params.color ?? null;
  const size = params.size ?? null;
  const createdBy = params.createdBy ?? null;

  // Validate: at least categoryId must be provided
  if (!categoryId) {
    return jsonResponse(400, {
      error: "validation_error",
      fields: ["categoryId is required"],
    });
  }

  try {
    // Step 1: Look up pricing reference — brand×category first, then category-only fallback
    let pricingRef: PricingRefRecord | null = null;
    let referenceSource: "brand_category" | "category_only" = "brand_category";

    if (brand) {
      pricingRef = await getPricingRef(brand, categoryId);
    }

    if (!pricingRef) {
      pricingRef = await getPricingRef("_NONE_", categoryId);
      referenceSource = "category_only";
    }

    // No data available at all
    if (!pricingRef) {
      const noDataResponse: PriceSuggestionResponse = {
        suggestedPrice: null,
        confidence: null,
        explanation: "No pricing data available for this category",
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

    // Step 4: Calculate suggested price
    const calcResult = calculateSuggestedPrice({
      referencePrice: pricingRef.referencePrice,
      velocityMultiplier: pricingRef.velocityMultiplier,
      creatorAdjustment,
      colorAdjustment,
      sizeAdjustment,
    });

    // Step 5: Build explanation
    const explanation = buildExplanation({
      referenceSource,
      brand: pricingRef.brand === "_NONE_" ? null : pricingRef.brand,
      category: pricingRef.categoryName,
      sampleSize: pricingRef.sampleSize,
      velocityMultiplier: pricingRef.velocityMultiplier,
      creatorAdjustment,
      colorAdjustment,
      sizeAdjustment,
      noData: false,
    });

    // Step 6: Classify confidence
    const confidence = classifyConfidence(pricingRef.sampleSize);

    // Step 7: Build response
    const response: PriceSuggestionResponse = {
      suggestedPrice: calcResult.suggestedPrice,
      confidence,
      explanation,
      adjustments: {
        referencePrice: pricingRef.referencePrice,
        velocityMultiplier: calcResult.adjustments.velocityMultiplier,
        creatorAdjustment: calcResult.adjustments.creatorAdjustment,
        colorAdjustment: calcResult.adjustments.colorAdjustment,
        sizeAdjustment: calcResult.adjustments.sizeAdjustment,
      },
      groupInfo: {
        brand: pricingRef.brand === "_NONE_" ? null : pricingRef.brand,
        category: pricingRef.categoryName,
        sampleSize: pricingRef.sampleSize,
        sellThroughRate: pricingRef.sellThroughRate,
        medianDaysOnShelf: pricingRef.medianDaysOnShelf,
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

async function getPricingRef(
  brand: string,
  categoryId: string,
): Promise<PricingRefRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: PRICING_TABLE_NAME,
      Key: {
        PK: `PRICING_REF#${brand}#${categoryId}`,
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
