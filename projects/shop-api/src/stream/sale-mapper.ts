export interface MappedSale {
  sourceId: string;
  number: number; // CC sale number, parsed to int
  status: "open" | "finalized" | "voided";
  subtotal: number;
  total: number;
  storePortion: number;
  cogs: number;
  change: number;
  memo: string | null;
  refundedAmount: number;
  cashRoundingAdjustment: number;
  lineItemCount: number;
  finalizedAt: string | null;
  voidedAt: string | null;
  parkedAt: string | null;
  createdAt: string;
}

export interface MappedLineItem {
  sourceId: string;
  itemSourceId: string;
  itemSku: string | null;
  itemTitle: string | null;
  salePrice: number;
  consignorPortion: number;
  storePortion: number;
  split: number;
  quantity: number;
  daysOnShelf: number;
  taxedPrice: number;
  taxExempt: boolean;
  refundedQuantity: number;
  totalTax: number;
  discount: number;
  createdAt: string;
}

export type SaleMappingResult =
  | { success: true; sale: MappedSale; lineItems: MappedLineItem[] }
  | { success: false; error: string };

/**
 * Maps a raw DynamoDB Stream record (NewImage) for a sale to the Shop_Table schema.
 * Returns a discriminated union indicating success or failure.
 *
 * All sale statuses (open, finalized, voided) are mapped.
 * Pure function — no side effects, idempotent.
 */
export function mapSale(raw: Record<string, unknown>): SaleMappingResult {
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id) {
    return { success: false, error: "Missing required field: id" };
  }

  const number = typeof raw.number === "string" ? raw.number : "";
  if (!number) {
    return { success: false, error: "Missing required field: number" };
  }

  const parsedNumber = parseInt(number, 10);
  if (isNaN(parsedNumber)) {
    return { success: false, error: "Field 'number' is not a valid integer" };
  }

  const created = typeof raw.created === "string" ? raw.created : "";
  if (!created) {
    return { success: false, error: "Missing required field: created" };
  }

  const status = typeof raw.status === "string" ? raw.status : "open";

  const subtotal = typeof raw.subtotal === "number" ? raw.subtotal : 0;
  const total = typeof raw.total === "number" ? raw.total : 0;
  const storePortion =
    typeof raw.store_portion === "number" ? raw.store_portion : 0;
  const cogs =
    typeof raw.cogs === "number"
      ? raw.cogs
      : typeof raw.consignor_portion === "number"
        ? raw.consignor_portion
        : 0;
  const change = typeof raw.change === "number" ? raw.change : 0;
  const memo = typeof raw.memo === "string" ? raw.memo : null;
  const finalized = typeof raw.finalized === "string" ? raw.finalized : null;
  const voided = typeof raw.voided === "string" ? raw.voided : null;
  const parked = typeof raw.parked === "string" ? raw.parked : null;
  const refundedAmount =
    typeof raw.refunded_amount === "number" ? raw.refunded_amount : 0;
  const cashRoundingAdjustment =
    typeof raw.cash_rounding_adjustment === "number"
      ? raw.cash_rounding_adjustment
      : 0;
  const lineItemCount =
    typeof raw.line_item_count === "number" ? raw.line_item_count : 0;

  const sale: MappedSale = {
    sourceId: id,
    number: parsedNumber,
    status: status as "open" | "finalized" | "voided",
    subtotal,
    total,
    storePortion,
    cogs,
    change,
    memo,
    refundedAmount,
    cashRoundingAdjustment,
    lineItemCount,
    finalizedAt: finalized,
    voidedAt: voided,
    parkedAt: parked,
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

      const appliedTaxes = Array.isArray(lineItem.applied_taxes)
        ? (lineItem.applied_taxes as unknown[])
        : [];
      const totalTax = appliedTaxes.reduce((sum: number, t: unknown) => {
        const tax = t as Record<string, unknown>;
        const amount = typeof tax.amount === "number" ? tax.amount : 0;
        return sum + amount;
      }, 0);

      const itemObj =
        lineItem.item != null &&
        typeof lineItem.item === "object" &&
        !Array.isArray(lineItem.item)
          ? (lineItem.item as Record<string, unknown>)
          : null;

      const sourceId = typeof lineItem.id === "string" ? lineItem.id : "";
      const itemSourceId = itemObj
        ? typeof itemObj.id === "string"
          ? itemObj.id
          : ""
        : "";
      const itemSku = itemObj
        ? typeof itemObj.sku === "string"
          ? itemObj.sku
          : null
        : null;
      const itemTitle = itemObj
        ? typeof itemObj.title === "string"
          ? itemObj.title
          : null
        : null;

      const salePrice =
        typeof lineItem.unit_price === "number" ? lineItem.unit_price : 0;
      const consignorPortion =
        typeof lineItem.consignor_portion === "number"
          ? lineItem.consignor_portion
          : 0;
      const storePortion =
        typeof lineItem.store_portion === "number" ? lineItem.store_portion : 0;
      const split = typeof lineItem.split === "number" ? lineItem.split : 0;
      const quantity =
        typeof lineItem.quantity === "number" ? lineItem.quantity : 0;
      const daysOnShelf =
        typeof lineItem.days_on_shelf === "number" ? lineItem.days_on_shelf : 0;
      const taxedPrice =
        typeof lineItem.taxed_price === "number" ? lineItem.taxed_price : 0;
      const taxExempt =
        typeof lineItem.tax_exempt === "boolean" ? lineItem.tax_exempt : false;
      const refundedQuantity =
        typeof lineItem.refunded_quantity === "number"
          ? lineItem.refunded_quantity
          : 0;
      const lineItemCreated =
        typeof lineItem.created === "string" ? lineItem.created : created;

      return {
        sourceId,
        itemSourceId,
        itemSku,
        itemTitle,
        salePrice,
        consignorPortion,
        storePortion,
        split,
        quantity,
        daysOnShelf,
        taxedPrice,
        taxExempt,
        refundedQuantity,
        totalTax,
        discount: totalDiscount,
        createdAt: lineItemCreated,
      };
    },
  );

  return { success: true, sale, lineItems };
}
