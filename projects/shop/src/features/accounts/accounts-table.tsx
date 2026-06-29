import * as React from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type Column,
} from "@tanstack/react-table";
import type { Account } from "./accounts-types";
import { accountsColumns } from "./accounts-columns";
import type { AccountsTableMeta } from "./accounts-columns";

export interface AccountsTableProps {
  data: Account[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  onEdit?: (account: Account) => void;
  onDelete?: (account: Account) => void;
}

function getAriaSortValue(
  column: Column<Account>,
  sorting: SortingState,
): "ascending" | "descending" | "none" | undefined {
  if (!column.getCanSort()) {
    return undefined;
  }
  const sortEntry = sorting.find((s) => s.id === column.id);
  if (!sortEntry) {
    return "none";
  }
  return sortEntry.desc ? "descending" : "ascending";
}

function SortIndicator({
  column,
}: {
  column: Column<Account>;
}): React.ReactNode {
  const sorted = column.getIsSorted();
  if (!sorted) {
    return <span className="text-muted-foreground/50 ml-1">⇅</span>;
  }
  return (
    <span className="ml-1" aria-hidden="true">
      {sorted === "asc" ? "▲" : "▼"}
    </span>
  );
}

export function AccountsTable({
  data,
  loading,
  error,
  onRetry,
  onEdit,
  onDelete,
}: AccountsTableProps): React.ReactNode {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const meta: AccountsTableMeta = React.useMemo(
    () => ({ onEdit, onDelete }),
    [onEdit, onDelete],
  );

  const table = useReactTable({
    data,
    columns: accountsColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableMultiSort: false,
    meta,
    sortingFns: {
      caseInsensitive: (rowA, rowB, columnId) => {
        const a = String(rowA.getValue(columnId) ?? "").toLowerCase();
        const b = String(rowB.getValue(columnId) ?? "").toLowerCase();
        return a < b ? -1 : a > b ? 1 : 0;
      },
    },
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
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-border">
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const ariaSort = getAriaSortValue(header.column, sorting);

                return (
                  <th
                    key={header.id}
                    scope="col"
                    className="px-4 py-2 text-left text-sm font-medium text-foreground"
                    {...(ariaSort !== undefined
                      ? { "aria-sort": ariaSort }
                      : {})}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        className="flex cursor-pointer items-center gap-1 bg-transparent font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        <SortIndicator column={header.column} />
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </th>
                );
              })}
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
    </div>
  );
}
