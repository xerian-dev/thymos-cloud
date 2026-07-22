import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";
import type { Sale } from "./sales-types";
import {
  formatChfCents,
  formatSaleDate,
  getStatusVariant,
} from "./sales-utils";

export interface SalesTableMeta {
  onEdit?: (sale: Sale) => void;
  onDelete?: (sale: Sale) => void;
  onViewUser?: (employeeId: string) => void;
}

export const salesColumns: ColumnDef<Sale>[] = [
  {
    accessorKey: "saleNumber",
    header: "Sale #",
    cell: ({ row }) => row.getValue<number>("saleNumber"),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue<Sale["status"]>("status");
      return (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusVariant(status)}`}
        >
          {status}
        </span>
      );
    },
  },
  {
    accessorKey: "cashierName",
    header: "Cashier",
    cell: ({ row, table }) => {
      const meta = table.options.meta as SalesTableMeta | undefined;
      const sale = row.original;
      const cashierName = row.getValue<string | undefined>("cashierName");

      if (!cashierName) {
        return <span className="text-muted-foreground">Unknown</span>;
      }

      return (
        <button
          type="button"
          onClick={() => meta?.onViewUser?.(sale.cashierId)}
          className="text-primary underline-offset-4 hover:underline cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded"
          aria-label={`View details for ${cashierName}`}
        >
          {cashierName}
        </button>
      );
    },
  },
  {
    accessorKey: "total",
    header: "Total",
    cell: ({ row }) => formatChfCents(row.getValue<number>("total")),
  },
  {
    accessorKey: "finalizedAt",
    header: "Finalized At",
    cell: ({ row }) =>
      formatSaleDate(row.getValue<string | undefined>("finalizedAt")),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row, table }) => {
      const meta = table.options.meta as SalesTableMeta | undefined;
      const sale = row.original;

      return (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => meta?.onEdit?.(sale)}
            className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Edit sale ${sale.saleNumber}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => meta?.onDelete?.(sale)}
            className="rounded p-1 text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Delete sale ${sale.saleNumber}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      );
    },
  },
];
