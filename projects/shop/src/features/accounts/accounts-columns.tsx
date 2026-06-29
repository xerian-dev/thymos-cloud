import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";
import type { Account } from "./accounts-types";
import { formatShopUid } from "./accounts-utils";

export interface AccountsTableMeta {
  onEdit?: (account: Account) => void;
  onDelete?: (account: Account) => void;
}

export const accountsColumns: ColumnDef<Account>[] = [
  {
    accessorKey: "shopUid",
    header: "Account #",
    cell: ({ row }) => formatShopUid(row.getValue<number>("shopUid")),
    enableSorting: true,
    sortingFn: "basic",
    sortDescFirst: false,
  },
  {
    accessorKey: "name",
    header: "Name",
    enableSorting: true,
    sortingFn: "caseInsensitive",
  },
  {
    accessorKey: "street",
    header: "Street",
    enableSorting: true,
    sortingFn: "caseInsensitive",
  },
  {
    accessorKey: "place",
    header: "Place",
    enableSorting: true,
    sortingFn: "caseInsensitive",
  },
  {
    accessorKey: "postcode",
    header: "Postcode",
    enableSorting: true,
    sortingFn: "caseInsensitive",
  },
  {
    accessorKey: "canton",
    header: "Canton",
    enableSorting: true,
    sortingFn: "caseInsensitive",
  },
  {
    accessorKey: "email",
    header: "Email",
    enableSorting: true,
    sortingFn: "caseInsensitive",
  },
  {
    accessorKey: "telephone",
    header: "Telephone",
    enableSorting: true,
    sortingFn: "caseInsensitive",
  },
  {
    id: "actions",
    header: "",
    enableSorting: false,
    cell: ({ row, table }) => {
      const meta = table.options.meta as AccountsTableMeta | undefined;
      const account = row.original;

      return (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => meta?.onEdit?.(account)}
            className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Edit account ${account.name}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => meta?.onDelete?.(account)}
            className="rounded p-1 text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Delete account ${account.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      );
    },
  },
];
