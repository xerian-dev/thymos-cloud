export interface Account {
  uuid: string;
  shopUid: number;
  name: string;
  street?: string;
  place?: string;
  postcode?: string;
  canton?: string;
  email?: string;
  telephone?: string;
  commentCount: number;
  tags: string[];
}

export interface CreateAccountRequest {
  accountNumber: number;
  name: string;
  street?: string;
  place?: string;
  postcode?: string;
  canton?: string;
  email?: string;
  telephone?: string;
}

export type CreateAccountResult =
  | { success: true; account: Account }
  | {
      success: false;
      error: "duplicate" | "max_reached" | "network" | "server" | "timeout";
    };

export interface UpdateAccountRequest {
  name: string;
  street?: string;
  place?: string;
  postcode?: string;
  canton?: string;
  email?: string;
  telephone?: string;
}

export type UpdateAccountResult =
  | { success: true; account: Account }
  | {
      success: false;
      error: "not_found" | "network" | "server" | "timeout";
    };

export type DeleteAccountResult =
  | { success: true }
  | {
      success: false;
      error: "not_found" | "network" | "server" | "timeout";
    };

export type PageSize = 20 | 50 | 100;

export interface CursorPaginationParams {
  pageSize: PageSize;
  cursor?: string;
}

export interface CursorPaginatedResponse {
  accounts: Account[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CachedPage {
  accounts: Account[];
  nextCursor: string | null;
}

export interface UseCursorPaginatedAccountsResult {
  accounts: Account[];
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
