import {
  ConsignCloudSale,
  ConsignCloudLineItem,
} from "./sale-consigncloud-client";

export interface MappedSaleFields {
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

export interface MappedLineItemFields {
  salePrice: number;
  discount: number;
  consignorPortion: number;
  storePortion: number;
  quantity: number;
  daysOnShelf: number;
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

    const mapped: MappedSaleFields = {
      sourceId: sale.id,
      sourceNumber: sale.number,
      status: "finalized",
      subtotal: sale.subtotal,
      total: sale.total,
      storePortion: sale.store_portion,
      consignorPortion: sale.consignor_portion,
      change: sale.change,
      memo: sale.memo ?? null,
      finalizedAt: sale.finalized ?? null,
      voidedAt: null,
      createdAt: sale.created,
    };

    const lineItems: MappedLineItemFields[] = (sale.line_items ?? []).map(
      (item: ConsignCloudLineItem) => {
        const totalDiscount = item.applied_discounts
          ? item.applied_discounts.reduce((sum, d) => sum + d.amount, 0)
          : 0;
        return {
          salePrice: item.unit_price,
          discount: totalDiscount,
          consignorPortion: item.consignor_portion,
          storePortion: item.store_portion,
          quantity: item.quantity,
          daysOnShelf: item.days_on_shelf,
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
 * Returns true if the sale is finalized (has a finalized timestamp and is not voided).
 * The ConsignCloud API does not return an explicit "status" field — finalization
 * is indicated by a non-null `finalized` timestamp with a null `voided` timestamp.
 */
export function isFinalizedSale(sale: ConsignCloudSale): boolean {
  return sale.finalized !== null && sale.voided === null;
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
