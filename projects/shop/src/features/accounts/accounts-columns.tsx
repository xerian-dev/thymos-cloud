import type { ColumnDef } from "@tanstack/react-table";
import type { Account } from "./accounts-types";
import { formatShopUid } from "./accounts-utils";

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
    accessorKey: "address",
    header: "Address",
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
    accessorKey: "commentCount",
    header: "Comments",
    enableSorting: false,
    cell: ({ row }) => String(row.getValue<number>("commentCount")),
  },
  {
    accessorKey: "tags",
    header: "Tags",
    enableSorting: false,
    cell: ({ row }) => (row.getValue<string[]>("tags") ?? []).join(", "),
  },
];
