import type { PageSize } from "@/lib/pagination-types";
import type { HistoryJobSummary } from "./imports-types";

const VALID_PAGE_SIZES: readonly PageSize[] = [20, 50, 100];
const VALID_IMPORT_TYPES = ["items", "sales", "accounts"] as const;

/**
 * Validates and normalises a pageSize value.
 * Returns the input if it is 20, 50, or 100; otherwise returns 20.
 */
export function normalizePageSize(value: unknown): PageSize {
  if (
    typeof value === "number" &&
    VALID_PAGE_SIZES.includes(value as PageSize)
  ) {
    return value as PageSize;
  }
  return 20;
}

/**
 * Validates that a type string is a valid ImportType.
 * Returns true if type is "items", "sales", or "accounts".
 */
export function isValidImportType(type: string): boolean {
  return (VALID_IMPORT_TYPES as readonly string[]).includes(type);
}

/**
 * Sorts jobs by lastUpdatedAt descending (most recent first).
 * Returns a new sorted array without mutating the input.
 */
export function sortJobsByDate(
  jobs: HistoryJobSummary[],
): HistoryJobSummary[] {
  return [...jobs].sort(
    (a, b) =>
      new Date(b.lastUpdatedAt).getTime() -
      new Date(a.lastUpdatedAt).getTime(),
  );
}

/**
 * Manages a page cursor stack for backward navigation.
 * Push a cursor when moving forward; pop when moving back.
 */
export interface PageStack {
  push: (cursor: string) => void;
  pop: () => string | undefined;
  peek: () => string | undefined;
  size: () => number;
  clear: () => void;
}

export function createPageStack(): PageStack {
  const stack: string[] = [];

  return {
    push(cursor: string): void {
      stack.push(cursor);
    },
    pop(): string | undefined {
      return stack.pop();
    },
    peek(): string | undefined {
      return stack.length > 0 ? stack[stack.length - 1] : undefined;
    },
    size(): number {
      return stack.length;
    },
    clear(): void {
      stack.length = 0;
    },
  };
}
