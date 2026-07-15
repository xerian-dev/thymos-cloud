import * as React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { PageSize } from "@/lib/pagination-types";

export type { PageSize } from "@/lib/pagination-types";

export interface PaginationControlsProps {
  hasPrevious: boolean;
  hasMore: boolean;
  onNext: () => void;
  onPrevious: () => void;
  pageSize: PageSize;
  onPageSizeChange: (pageSize: PageSize) => void;
  disabled?: boolean;
}

const PAGE_SIZE_OPTIONS: PageSize[] = [20, 50, 100];

export function PaginationControls({
  hasPrevious,
  hasMore,
  onNext,
  onPrevious,
  pageSize,
  onPageSizeChange,
  disabled = false,
}: PaginationControlsProps): React.ReactNode {
  const handlePrevious = (): void => {
    if (hasPrevious && !disabled) {
      onPrevious();
    }
  };

  const handleNext = (): void => {
    if (hasMore && !disabled) {
      onNext();
    }
  };

  const handlePageSizeChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ): void => {
    const newSize = Number(event.target.value) as PageSize;
    onPageSizeChange(newSize);
  };

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-4 px-2 py-3"
    >
      <div className="flex items-center gap-2">
        <Label htmlFor="page-size-select">Rows per page</Label>
        <select
          id="page-size-select"
          value={pageSize}
          onChange={handlePageSizeChange}
          disabled={disabled}
          className="h-8 rounded-lg border border-border bg-background px-2 text-sm focus:border-ring focus:ring-3 focus:ring-ring/50 focus:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrevious}
          disabled={!hasPrevious || disabled}
          aria-disabled={!hasPrevious || disabled}
          aria-label="Go to previous page"
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleNext}
          disabled={!hasMore || disabled}
          aria-disabled={!hasMore || disabled}
          aria-label="Go to next page"
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
