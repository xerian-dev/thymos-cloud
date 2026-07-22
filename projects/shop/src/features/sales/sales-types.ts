import type { PageSize } from "@/lib/pagination-types";

export interface Sale {
  uuid: string;
  saleNumber: number;
  status: "open" | "finalized" | "voided";
  cashierId: string;
  cashierName?: string;
  subtotal: number;
  total: number;
  storePortion: number;
  consignorPortion: number;
  change: number;
  memo?: string;
  finalizedAt?: string;
  voidedAt?: string;
  sourceId?: string;
  createdAt: string;
}

export interface SaleLineItem {
  saleId: string;
  itemId: string;
  salePrice: number;
  discount: number;
  consignorPortion: number;
  storePortion: number;
}

export interface CreateSaleRequest {
  cashierId: string;
  memo?: string;
  lineItems: Array<{
    itemId: string;
    salePrice: number;
    discount?: number;
  }>;
}

export interface UpdateSaleRequest {
  cashierId?: string;
  memo?: string;
  status?: "finalized" | "voided";
}

export type CreateSaleResult =
  | { success: true; sale: Sale }
  | {
      success: false;
      error: "validation" | "network" | "server" | "timeout";
      fields?: Array<{ field: string; message: string }>;
    };

export type UpdateSaleResult =
  | { success: true; sale: Sale }
  | {
      success: false;
      error:
        | "not_found"
        | "validation"
        | "invalid_transition"
        | "network"
        | "server"
        | "timeout";
    };

export type DeleteSaleResult =
  | { success: true }
  | { success: false; error: "not_found" | "network" | "server" | "timeout" };

export interface CursorPaginatedSalesResponse {
  sales: Sale[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CachedPage {
  sales: Sale[];
  nextCursor: string | null;
}

export interface UsePaginatedSalesResult {
  sales: Sale[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  hasPrevious: boolean;
  pageSize: PageSize;
  goNext: () => void;
  goPrevious: () => void;
  setPageSize: (size: PageSize) => void;
  retry: () => void;
}
