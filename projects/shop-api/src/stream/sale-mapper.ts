export interface MappedSale {
  sourceNumber: string;
  status: "finalized";
  subtotal: number;
  total: number;
  storePortion: number;
  consignorPortion: number;
  change: number;
  memo: string | null;
  finalizedAt: string | null;
  voidedAt: null;
  sourceId: string;
  createdAt: string;
}

export interface MappedLineItem {
  salePrice: number;
  discount: number;
  consignorPortion: number;
  storePortion: number;
  quantity: number;
  daysOnShelf: number;
}

export type SaleMappingResult =
  | { success: true; sale: MappedSale; lineItems: MappedLineItem[] }
  | { success: false; error: string };

/**
 * Returns true if the sale is finalized (has a finalized timestamp and is not voided).
 * Only finalized, non-voided sales should be synced to the Shop_Table.
 */
export function isFinalizedSale(raw: Record<string, unknown>): boolean {
  return raw.finalized != null && raw.voided == null;
}

/**
 * Maps a raw DynamoDB Stream record (NewImage) for a sale to the Shop_Table schema.
 * Returns a discriminated union indicating success or failure.
 *
 * Pure function — no side effects, idempotent.
 */
export function mapSale(raw: Record<string, unknown>): SaleMappingResult {
  if (!isFinalizedSale(raw)) {
    return { success: false, error: "Sale is not finalized or is voided" };
  }

  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id) {
    return { success: false, error: "Missing required field: id" };
  }

  const number = typeof raw.number === "string" ? raw.number : "";
  if (!number) {
    return { success: false, error: "Missing required field: number" };
  }

  const created = typeof raw.created === "string" ? raw.created : "";
  if (!created) {
    return { success: false, error: "Missing required field: created" };
  }

  const subtotal = typeof raw.subtotal === "number" ? raw.subtotal : 0;
  const total = typeof raw.total === "number" ? raw.total : 0;
  const storePortion =
    typeof raw.store_portion === "number" ? raw.store_portion : 0;
  const consignorPortion =
    typeof raw.consignor_portion === "number" ? raw.consignor_portion : 0;
  const change = typeof raw.change === "number" ? raw.change : 0;
  const memo = typeof raw.memo === "string" ? raw.memo : null;
  const finalized = typeof raw.finalized === "string" ? raw.finalized : null;

  const sale: MappedSale = {
    sourceId: id,
    sourceNumber: number,
    status: "finalized",
    subtotal,
    total,
    storePortion,
    consignorPortion,
    change,
    memo,
    finalizedAt: finalized,
    voidedAt: null,
    createdAt: created,
  };

  const rawLineItems = Array.isArray(raw.line_items) ? raw.line_items : [];

  const lineItems: MappedLineItem[] = (rawLineItems as unknown[]).map(
    (item: unknown) => {
      const lineItem = item as Record<string, unknown>;

      const appliedDiscounts = Array.isArray(lineItem.applied_discounts)
        ? (lineItem.applied_discounts as unknown[])
        : [];
      const totalDiscount = appliedDiscounts.reduce(
        (sum: number, d: unknown) => {
          const discount = d as Record<string, unknown>;
          const amount =
            typeof discount.amount === "number" ? discount.amount : 0;
          return sum + amount;
        },
        0,
      );

      const salePrice =
        typeof lineItem.unit_price === "number" ? lineItem.unit_price : 0;
      const consignorPortion =
        typeof lineItem.consignor_portion === "number"
          ? lineItem.consignor_portion
          : 0;
      const storePortion =
        typeof lineItem.store_portion === "number"
          ? lineItem.store_portion
          : 0;
      const quantity =
        typeof lineItem.quantity === "number" ? lineItem.quantity : 0;
      const daysOnShelf =
        typeof lineItem.days_on_shelf === "number"
          ? lineItem.days_on_shelf
          : 0;

      return {
        salePrice,
        discount: totalDiscount,
        consignorPortion,
        storePortion,
        quantity,
        daysOnShelf,
      };
    },
  );

  return { success: true, sale, lineItems };
}
