/**
 * Adjustment detector for pricing reference updates.
 *
 * Detects when a computed reference price differs from the previous
 * reference price by more than 2%, creates an adjustment event,
 * and applies caps via the adjustment-caps module.
 */

import {
  capDecrease,
  capIncrease,
  shouldAllowIncrease,
} from "../pricing/adjustment-caps.js";

export interface PricingRef {
  referencePrice: number;
  originalBaseline: number;
  sellThroughRate: number;
  medianDaysOnShelf: number;
  sampleSize: number;
  priceRatio: number;
}

export interface ComputedStats {
  referencePrice: number;
  sellThroughRate: number;
  medianDaysOnShelf: number;
  sampleSize: number;
  priceRatio: number;
}

export interface AdjustmentEvent {
  brand: string;
  category: string;
  categoryId: string;
  previousPrice: number;
  newPrice: number;
  direction: "increase" | "decrease";
  percentageChange: number;
  reason: string;
  metrics: {
    sellThroughRate: number;
    medianDaysOnShelf: number;
    sampleSize: number;
    discountFrequency: number;
    priceRatio: number;
  };
}

/**
 * Detects whether a pricing reference update warrants an adjustment event.
 *
 * If the change between previous and current reference price exceeds 2%,
 * an adjustment event is created. Caps are applied to limit the magnitude
 * of changes per cycle.
 *
 * For increases, the increase is only applied if shouldAllowIncrease conditions
 * are met. If not met, the price remains unchanged (no event).
 *
 * @param previous - The existing pricing reference (null if this is a new group)
 * @param current - The newly computed statistics
 * @param brand - The brand name for this group
 * @param category - The category display name
 * @param categoryId - The category UUID
 * @param discountFrequency - The discount frequency for the group
 * @returns An adjustment event if |change| > 2%, or null if no significant change
 */
export function detectAdjustment(
  previous: PricingRef | null,
  current: ComputedStats,
  brand: string,
  category: string,
  categoryId: string,
  discountFrequency: number,
): { event: AdjustmentEvent | null; adjustedPrice: number } {
  // No previous reference — this is a new group, no adjustment to detect
  if (previous === null) {
    return { event: null, adjustedPrice: current.referencePrice };
  }

  const previousPrice = previous.referencePrice;
  const newPrice = current.referencePrice;

  // Calculate percentage change
  if (previousPrice === 0) {
    return { event: null, adjustedPrice: newPrice };
  }

  const changeRatio = Math.abs(newPrice - previousPrice) / previousPrice;

  // If change is <= 2%, no event — price stays as previous
  if (changeRatio <= 0.02) {
    return { event: null, adjustedPrice: previousPrice };
  }

  // Determine direction
  if (newPrice < previousPrice) {
    // Decrease case — apply caps
    const cappedPrice = capDecrease(
      previousPrice,
      newPrice,
      previous.originalBaseline,
    );

    const percentageChange =
      ((cappedPrice - previousPrice) / previousPrice) * 100;
    const reason = buildDecreaseReason(current);

    const event: AdjustmentEvent = {
      brand,
      category,
      categoryId,
      previousPrice,
      newPrice: cappedPrice,
      direction: "decrease",
      percentageChange,
      reason,
      metrics: {
        sellThroughRate: current.sellThroughRate,
        medianDaysOnShelf: current.medianDaysOnShelf,
        sampleSize: current.sampleSize,
        discountFrequency,
        priceRatio: current.priceRatio,
      },
    };

    return { event, adjustedPrice: cappedPrice };
  } else {
    // Increase case — check if increase is allowed
    const increaseAllowed = shouldAllowIncrease(
      current.sellThroughRate,
      current.priceRatio,
      current.medianDaysOnShelf,
      current.sampleSize,
    );

    if (!increaseAllowed) {
      // Increase not allowed — keep previous price, no event
      return { event: null, adjustedPrice: previousPrice };
    }

    // Apply increase cap
    const cappedPrice = capIncrease(previousPrice, newPrice);

    const percentageChange =
      ((cappedPrice - previousPrice) / previousPrice) * 100;
    const reason = buildIncreaseReason(current);

    const event: AdjustmentEvent = {
      brand,
      category,
      categoryId,
      previousPrice,
      newPrice: cappedPrice,
      direction: "increase",
      percentageChange,
      reason,
      metrics: {
        sellThroughRate: current.sellThroughRate,
        medianDaysOnShelf: current.medianDaysOnShelf,
        sampleSize: current.sampleSize,
        discountFrequency,
        priceRatio: current.priceRatio,
      },
    };

    return { event, adjustedPrice: cappedPrice };
  }
}

function buildDecreaseReason(current: ComputedStats): string {
  const parts: string[] = [];

  if (current.sellThroughRate < 0.3) {
    parts.push(
      `low sell-through rate (${(current.sellThroughRate * 100).toFixed(0)}%)`,
    );
  }

  if (current.priceRatio < 0.85) {
    parts.push(
      `items selling well below tag price (ratio ${current.priceRatio.toFixed(2)})`,
    );
  }

  if (current.medianDaysOnShelf > 30) {
    parts.push(
      `slow movement (${current.medianDaysOnShelf.toFixed(0)} median days on shelf)`,
    );
  }

  if (parts.length === 0) {
    parts.push("updated market data indicates lower pricing");
  }

  return `Price decreased due to ${parts.join(", ")}`;
}

function buildIncreaseReason(current: ComputedStats): string {
  return `Price increased due to strong sell-through (${(current.sellThroughRate * 100).toFixed(0)}%), items selling at or above tag price (ratio ${current.priceRatio.toFixed(2)}), and fast movement (${current.medianDaysOnShelf.toFixed(0)} median days on shelf)`;
}
