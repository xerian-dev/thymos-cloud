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
import { deleteItem } from "./items-api";
import type { Item } from "./items-types";

export interface DeleteItemDialogProps {
  open: boolean;
  item: Item | null;
  onClose: () => void;
  onSuccess: () => void;
}

function getErrorMessage(
  error: "not_found" | "network" | "server" | "timeout",
): string {
  switch (error) {
    case "not_found":
      return "Item not found. It may have been deleted.";
    case "network":
      return "Connection failed. Check your internet connection.";
    case "timeout":
      return "Request timed out. Please try again.";
    case "server":
      return "An unexpected error occurred. Please try again.";
  }
}

export function DeleteItemDialog({
  open,
  item,
  onClose,
  onSuccess,
}: DeleteItemDialogProps): React.ReactNode {
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setDeleting(false);
      setError(null);
    }
  }, [open]);

  async function handleConfirm(): Promise<void> {
    if (!item) return;

    setDeleting(true);
    setError(null);

    const result = await deleteItem(item.uuid);

    if (result.success) {
      onSuccess();
    } else {
      setDeleting(false);
      setError(getErrorMessage(result.error));
    }
  }

  if (!item) return null;

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Item</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete item{" "}
            <span className="font-medium text-foreground">{item.title}</span>{" "}
            (SKU: {item.sku})? This action cannot be undone.
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
