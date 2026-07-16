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
  },
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "street",
    header: "Street",
  },
  {
    accessorKey: "place",
    header: "Place",
  },
  {
    accessorKey: "postcode",
    header: "Postcode",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "telephone",
    header: "Telephone",
  },
  {
    accessorKey: "createdBy",
    header: "Created By",
    cell: ({ row }) => {
      const createdBy = row.original.createdBy;
      return createdBy?.name ?? "";
    },
  },
  {
    id: "actions",
    header: "",
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
