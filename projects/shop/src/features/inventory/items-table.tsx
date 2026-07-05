import * as React from "react";
import type { Item, PageSize } from "./items-types";
import { itemsColumns } from "./items-columns";
import type { ItemsTableMeta } from "./items-columns";
import { DataTable } from "@/components/shared/data-table";
import { PaginationControls } from "@/components/shared/pagination-controls";

export interface ItemsTableProps {
  data: Item[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  onEdit?: (item: Item) => void;
  onDelete?: (item: Item) => void;
  hasPrevious: boolean;
  hasMore: boolean;
  pageSize: PageSize;
  onNext: () => void;
  onPrevious: () => void;
  onPageSizeChange: (pageSize: PageSize) => void;
}

export function ItemsTable({
  data,
  loading,
  error,
  onRetry,
  onEdit,
  onDelete,
  hasPrevious,
  hasMore,
  pageSize,
  onNext,
  onPrevious,
  onPageSizeChange,
}: ItemsTableProps): React.ReactNode {
  const meta: ItemsTableMeta = React.useMemo(
    () => ({ onEdit, onDelete }),
    [onEdit, onDelete],
  );

  return (
    <>
      <DataTable<Item>
        columns={itemsColumns}
        data={data}
        loading={loading}
        error={error}
        onRetry={onRetry}
        aria-label="Items table"
        meta={meta}
        emptyMessage="No items found."
        loadingMessage="Loading items…"
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
