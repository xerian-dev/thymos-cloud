import * as React from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import type { Account, PageSize } from "./accounts-types";
import { accountsColumns } from "./accounts-columns";
import type { AccountsTableMeta } from "./accounts-columns";
import { PaginationControls } from "./pagination-controls";

export interface AccountsTableProps {
  data: Account[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  onEdit?: (account: Account) => void;
  onDelete?: (account: Account) => void;
  hasPrevious: boolean;
  hasMore: boolean;
  pageSize: PageSize;
  onNext: () => void;
  onPrevious: () => void;
  onPageSizeChange: (pageSize: PageSize) => void;
}

export function AccountsTable({
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
}: AccountsTableProps): React.ReactNode {
  const meta: AccountsTableMeta = React.useMemo(
    () => ({ onEdit, onDelete }),
    [onEdit, onDelete],
  );

  const table = useReactTable({
    data,
    columns: accountsColumns,
    getCoreRowModel: getCoreRowModel(),
    meta,
  });

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-destructive text-sm">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground text-sm">Loading accounts…</p>
      </div>
    );
  }

  return (
    <div
      className="w-full overflow-x-auto"
      role="region"
      aria-label="Accounts table"
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-border">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className="px-4 py-2 text-left text-sm font-medium text-foreground"
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td
                colSpan={accountsColumns.length}
                className="px-4 py-8 text-center text-sm text-muted-foreground"
              >
                No accounts found.
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border last:border-b-0"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <PaginationControls
        hasPrevious={hasPrevious}
        hasMore={hasMore}
        pageSize={pageSize}
        onNext={onNext}
        onPrevious={onPrevious}
        onPageSizeChange={onPageSizeChange}
        disabled={loading}
      />
    </div>
  );
}
