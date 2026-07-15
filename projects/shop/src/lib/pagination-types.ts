export type PageSize = 20 | 50 | 100;

export interface CursorPaginationParams {
  pageSize: PageSize;
  cursor?: string;
}
