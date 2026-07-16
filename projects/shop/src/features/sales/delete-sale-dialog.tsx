import * as React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { deleteSale } from "./sales-api";
import type { Sale } from "./sales-types";

export interface DeleteSaleDialogProps {
  open: boolean;
  sale: Sale | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteSaleDialog({
  open,
  sale,
  onClose,
  onSuccess,
}: DeleteSaleDialogProps): React.ReactNode {
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setDeleting(false);
      setError(null);
    }
  }, [open]);

  async function handleConfirm(): Promise<void> {
    if (!sale) return;

    setDeleting(true);
    setError(null);

    const result = await deleteSale(sale.uuid);

    if (result.success) {
      onSuccess();
    } else {
      setDeleting(false);
      setError(
        result.error === "not_found"
          ? "Sale not found. It may have been deleted."
          : "Failed to delete sale. Please try again.",
      );
    }
  }

  if (!sale) return null;

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Sale</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete sale{" "}
            <span className="font-medium text-foreground">
              #{sale.number}
            </span>{" "}
            (status: {sale.status})? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
