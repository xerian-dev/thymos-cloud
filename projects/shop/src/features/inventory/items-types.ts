import type { PageSize } from "@/lib/pagination-types";
export type { PageSize, CursorPaginationParams } from "@/lib/pagination-types";

export interface Item {
  uuid: string;
  sku: number;
  accountId: string;
  title: string;
  tagPrice: number;
  quantity: number;
  split: number;
  inventoryType: "Consignment" | "Retail";
  terms: "Return To Consignor" | "Donate" | "Discard";
  taxExempt: boolean;
  createdAt: string;
  updatedAt: string;
  description?: string;
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  shelf?: string;
  details?: string;
  tags?: string[];
  expirationDate?: string;
  imageKeys?: string[];
  createdBy?: string;
  categoryId?: string;
}

export interface CreateItemRequest {
  accountId: string;
  title: string;
  tagPrice: number;
  quantity: number;
  split: number;
  inventoryType: "Consignment" | "Retail";
  terms: "Return To Consignor" | "Donate" | "Discard";
  description?: string;
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  shelf?: string;
  details?: string;
  tags?: string[];
  expirationDate?: string;
  taxExempt?: boolean;
  imageKeys?: string[];
}

export interface UpdateItemRequest {
  accountId: string;
  title: string;
  tagPrice: number;
  quantity: number;
  split: number;
  inventoryType: "Consignment" | "Retail";
  terms: "Return To Consignor" | "Donate" | "Discard";
  description?: string;
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  shelf?: string;
  details?: string;
  tags?: string[];
  expirationDate?: string;
  taxExempt?: boolean;
  imageKeys?: string[];
}

export type CreateItemResult =
  | { success: true; item: Item }
  | {
      success: false;
      error:
        | "validation"
        | "account_not_found"
        | "network"
        | "server"
        | "timeout";
      fields?: Array<{ field: string; message: string }>;
    };

export type UpdateItemResult =
  | { success: true; item: Item }
  | {
      success: false;
      error: "not_found" | "validation" | "network" | "server" | "timeout";
      fields?: Array<{ field: string; message: string }>;
    };

export type DeleteItemResult =
  | { success: true }
  | {
      success: false;
      error: "not_found" | "network" | "server" | "timeout";
    };

export interface CursorPaginatedItemsResponse {
  items: Item[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CachedPage {
  items: Item[];
  nextCursor: string | null;
}

export interface UsePaginatedItemsResult {
  items: Item[];
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
