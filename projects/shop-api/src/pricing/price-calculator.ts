/**
 * Price calculator.
 *
 * Computes a suggested tag price by composing the reference price with
 * velocity, creator, color, and size adjustment multipliers, then
 * applying Swiss rounding (CHF 0.05).
 */

import { roundToSwiss5 } from "./swiss-rounding.js";

/**
 * Input parameters for the price calculation.
 */
export interface PriceCalculationInput {
  referencePrice: number; // Base price from pricing reference (CHF)
  velocityMultiplier?: number; // 0.90-1.10, default 1.0
  creatorAdjustment?: number; // multiplier, default 1.0
  colorAdjustment?: number; // multiplier, default 1.0
  sizeAdjustment?: number; // multiplier, default 1.0
}

/**
 * Result of a price calculation.
 */
export interface PriceCalculationResult {
  suggestedPrice: number; // Final price, rounded to CHF 0.05
  rawPrice: number; // Price before rounding
  adjustments: {
    velocityMultiplier: number;
    creatorAdjustment: number;
    colorAdjustment: number;
    sizeAdjustment: number;
  };
}

/**
 * Calculates the suggested tag price by composing the reference price
 * with all adjustment multipliers and applying Swiss rounding.
 *
 * Formula: referencePrice × velocityMultiplier × creatorAdjustment × colorAdjustment × sizeAdjustment
 *
 * @param params - The calculation input parameters
 * @returns The calculation result with suggested price, raw price, and applied adjustments
 */
export function calculateSuggestedPrice(
  params: PriceCalculationInput,
): PriceCalculationResult {
  const velocityMultiplier = params.velocityMultiplier ?? 1.0;
  const creatorAdjustment = params.creatorAdjustment ?? 1.0;
  const colorAdjustment = params.colorAdjustment ?? 1.0;
  const sizeAdjustment = params.sizeAdjustment ?? 1.0;

  const rawPrice =
    params.referencePrice *
    velocityMultiplier *
    creatorAdjustment *
    colorAdjustment *
    sizeAdjustment;

  const suggestedPrice = roundToSwiss5(rawPrice);

  return {
    suggestedPrice,
    rawPrice,
    adjustments: {
      velocityMultiplier,
      creatorAdjustment,
      colorAdjustment,
      sizeAdjustment,
    },
  };
}
