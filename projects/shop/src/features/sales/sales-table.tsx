import * as React from "react";
import type { Sale } from "./sales-types";
import { salesColumns } from "./sales-columns";
import type { SalesTableMeta } from "./sales-columns";
import type { PageSize } from "@/lib/pagination-types";
import { DataTable } from "@/components/shared/data-table";
import { PaginationControls } from "@/components/shared/pagination-controls";

export interface SalesTableProps {
  data: Sale[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  onEdit?: (sale: Sale) => void;
  onDelete?: (sale: Sale) => void;
  onViewUser?: (employeeId: string) => void;
  hasPrevious: boolean;
  hasMore: boolean;
  pageSize: PageSize;
  onNext: () => void;
  onPrevious: () => void;
  onPageSizeChange: (pageSize: PageSize) => void;
}

export function SalesTable({
  data,
  loading,
  error,
  onRetry,
  onEdit,
  onDelete,
  onViewUser,
  hasPrevious,
  hasMore,
  pageSize,
  onNext,
  onPrevious,
  onPageSizeChange,
}: SalesTableProps): React.ReactNode {
  const meta: SalesTableMeta = React.useMemo(
    () => ({ onEdit, onDelete, onViewUser }),
    [onEdit, onDelete, onViewUser],
  );

  return (
    <>
      <DataTable<Sale>
        columns={salesColumns}
        data={data}
        loading={loading}
        error={error}
        onRetry={onRetry}
        aria-label="Sales table"
        meta={meta}
        emptyMessage="No sales found."
        loadingMessage="Loading sales…"
      />
      {!loading && !error && (
        <PaginationControls
          hasPrevious={hasPrevious}
          hasMore={hasMore}
          pageSize={pageSize}
          onNext={onNext}
          onPrevious={onPrevious}
          onPageSizeChange={onPageSizeChange}
          disabled={loading}
        />
      )}
    </>
  );
}
