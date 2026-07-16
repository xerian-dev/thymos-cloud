import type { PageSize } from "@/lib/pagination-types";
export type { PageSize, CursorPaginationParams } from "@/lib/pagination-types";

export interface Employee {
  uuid: string;
  name: string;
  sourceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CursorPaginatedEmployeesResponse {
  employees: Employee[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CachedEmployeePage {
  employees: Employee[];
  nextCursor: string | null;
}

export interface UsePaginatedEmployeesResult {
  employees: Employee[];
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
