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
import { deleteAccount } from "./accounts-api";
import { formatShopUid } from "./accounts-utils";
import type { Account } from "./accounts-types";

export interface DeleteAccountDialogProps {
  open: boolean;
  account: Account | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteAccountDialog({
  open,
  account,
  onClose,
  onSuccess,
}: DeleteAccountDialogProps): React.ReactNode {
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setDeleting(false);
      setError(null);
    }
  }, [open]);

  async function handleConfirm(): Promise<void> {
    if (!account) return;

    setDeleting(true);
    setError(null);

    const result = await deleteAccount(account.shopUid);

    if (result.success) {
      onSuccess();
    } else {
      setDeleting(false);
      setError(
        result.error === "not_found"
          ? "Account not found."
          : "Failed to delete account. Please try again.",
      );
    }
  }

  if (!account) return null;

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Account</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete account{" "}
            <span className="font-medium text-foreground">
              {formatShopUid(account.shopUid)}
            </span>{" "}
            ({account.name})? This action cannot be undone.
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
