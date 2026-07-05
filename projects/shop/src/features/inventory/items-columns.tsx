import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";
import type { Item } from "./items-types";
import { formatChf } from "./items-utils";

export interface ItemsTableMeta {
  onEdit?: (item: Item) => void;
  onDelete?: (item: Item) => void;
}

export const itemsColumns: ColumnDef<Item, unknown>[] = [
  {
    accessorKey: "sku",
    header: "SKU",
  },
  {
    accessorKey: "title",
    header: "Title",
  },
  {
    accessorKey: "accountId",
    header: "Account",
  },
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ row }) => row.original.category ?? "",
  },
  {
    accessorKey: "tagPrice",
    header: "Tag Price",
    cell: ({ row }) => formatChf(row.original.tagPrice),
  },
  {
    accessorKey: "quantity",
    header: "Quantity",
  },
  {
    accessorKey: "inventoryType",
    header: "Inventory Type",
  },
  {
    id: "actions",
    header: "",
    cell: ({ row, table }) => {
      const meta = table.options.meta as ItemsTableMeta | undefined;
      const item = row.original;

      return (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => meta?.onEdit?.(item)}
            className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="Edit item"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => meta?.onDelete?.(item)}
            className="rounded p-1 text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label="Delete item"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      );
    },
  },
];
