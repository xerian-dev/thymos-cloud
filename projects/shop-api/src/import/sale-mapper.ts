import {
  ConsignCloudSale,
  ConsignCloudLineItem,
} from "./sale-consigncloud-client";

export interface MappedSaleFields {
  sourceId: string;
  number: number; // CC sale number, parsed to int
  status: "open" | "finalized" | "voided";
  subtotal: number; // cents
  total: number; // cents
  storePortion: number; // cents
  cogs: number; // cents (cost of goods sold)
  change: number; // cents
  memo: string | null;
  refundedAmount: number; // cents
  cashRoundingAdjustment: number; // cents
  lineItemCount: number;
  finalizedAt: string | null;
  voidedAt: string | null;
  parkedAt: string | null;
  createdAt: string; // ISO 8601
}

export interface MappedLineItemFields {
  sourceId: string; // CC line item UUID
  itemSourceId: string; // CC item UUID for resolution
  itemSku: string | null; // CC item SKU (vital)
  itemTitle: string | null; // Item title snapshot
  salePrice: number; // cents (unit_price)
  consignorPortion: number; // cents
  storePortion: number; // cents
  split: number; // decimal 0-1
  quantity: number;
  daysOnShelf: number;
  taxedPrice: number; // cents
  taxExempt: boolean;
  refundedQuantity: number;
  totalTax: number; // cents (sum of applied_taxes amounts)
  discount: number; // cents (sum of applied_discounts amounts)
  createdAt: string; // ISO 8601
}

export type SaleMappingResult =
  | {
      success: true;
      mapped: MappedSaleFields;
      lineItems: MappedLineItemFields[];
    }
  | { success: false; error: string };

export interface SaleKeys {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
}

/**
 * Maps a ConsignCloud sale and its line items to the Shop_Table schema.
 * Returns a discriminated union indicating success or failure.
 *
 * All sale statuses (open, finalized, voided) are mapped.
 */
export function mapConsignCloudSale(
  sale: ConsignCloudSale & { line_items?: ConsignCloudLineItem[] },
): SaleMappingResult {
  try {
    if (!sale.id) {
      return { success: false, error: "Missing required field: id" };
    }

    if (!sale.number) {
      return { success: false, error: "Missing required field: number" };
    }

    if (!sale.created) {
      return { success: false, error: "Missing required field: created" };
    }

    const parsedNumber: number = parseInt(sale.number, 10);
    if (isNaN(parsedNumber)) {
      return {
        success: false,
        error: "Field 'number' is not a valid integer",
      };
    }

    const mapped: MappedSaleFields = {
      sourceId: sale.id,
      number: parsedNumber,
      status: sale.status as "open" | "finalized" | "voided",
      subtotal: sale.subtotal,
      total: sale.total,
      storePortion: sale.store_portion,
      cogs: sale.cogs ?? sale.consignor_portion,
      change: sale.change,
      memo: sale.memo ?? null,
      refundedAmount: sale.refunded_amount ?? 0,
      cashRoundingAdjustment: sale.cash_rounding_adjustment ?? 0,
      lineItemCount: sale.line_item_count ?? 0,
      finalizedAt: sale.finalized ?? null,
      voidedAt: sale.voided ?? null,
      parkedAt: sale.parked ?? null,
      createdAt: sale.created,
    };

    const lineItems: MappedLineItemFields[] = (sale.line_items ?? []).map(
      (item: ConsignCloudLineItem) => {
        const totalDiscount: number = item.applied_discounts
          ? item.applied_discounts.reduce((sum: number, d) => sum + d.amount, 0)
          : 0;

        const totalTax: number = item.applied_taxes
          ? item.applied_taxes.reduce((sum: number, t) => sum + t.amount, 0)
          : 0;

        return {
          sourceId: item.id,
          itemSourceId: item.item?.id ?? "",
          itemSku: item.item?.sku ?? null,
          itemTitle: item.item?.title ?? null,
          salePrice: item.unit_price,
          consignorPortion: item.consignor_portion,
          storePortion: item.store_portion,
          split: item.split,
          quantity: item.quantity,
          daysOnShelf: item.days_on_shelf,
          taxedPrice: item.taxed_price,
          taxExempt: item.tax_exempt,
          refundedQuantity: item.refunded_quantity,
          totalTax,
          discount: totalDiscount,
          createdAt: item.created,
        };
      },
    );

    return { success: true, mapped, lineItems };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown mapping error";
    return { success: false, error: message };
  }
}

/**
 * Builds DynamoDB key attributes for a Sale record.
 * Number is zero-padded to 7 digits in GSI1SK.
 */
export function buildSaleKeys(uuid: string, number: number): SaleKeys {
  const paddedNumber: string = String(number).padStart(7, "0");
  return {
    PK: `SALE#${uuid}`,
    SK: "METADATA",
    GSI1PK: "SALES",
    GSI1SK: `SALE#${paddedNumber}`,
  };
}

/**
 * Builds the sort key for a Sale Line Item record.
 * Index is zero-padded to 4 digits.
 */
export function buildLineItemSk(index: number): string {
  return `LINE_ITEM#${String(index).padStart(4, "0")}`;
}
