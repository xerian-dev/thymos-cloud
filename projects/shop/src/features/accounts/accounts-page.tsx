import * as React from "react";
import { Button } from "@/components/ui/button";
import { AccountsTable } from "./accounts-table";
import { AccountForm } from "./account-form";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { usePaginatedAccounts } from "./use-paginated-accounts";
import { fetchNextAccountNumber } from "./accounts-api";
import type { Account } from "./accounts-types";

export function AccountsPage(): React.ReactNode {
  const {
    accounts,
    loading,
    error,
    hasMore,
    hasPrevious,
    pageSize,
    goNext,
    goPrevious,
    setPageSize,
    retry,
  } = usePaginatedAccounts();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingAccount, setEditingAccount] = React.useState<Account | null>(
    null,
  );
  const [deletingAccount, setDeletingAccount] = React.useState<Account | null>(
    null,
  );
  const [defaultAccountNumber, setDefaultAccountNumber] = React.useState<
    number | null
  >(null);
  const addButtonRef = React.useRef<HTMLButtonElement>(null);

  async function handleOpenAddForm(): Promise<void> {
    setEditingAccount(null);
    try {
      const nextNumber = await fetchNextAccountNumber();
      setDefaultAccountNumber(nextNumber);
    } catch {
      setDefaultAccountNumber(null);
    }
    setFormOpen(true);
  }

  function handleEdit(account: Account): void {
    setEditingAccount(account);
    setDefaultAccountNumber(null);
    setFormOpen(true);
  }

  function handleDelete(account: Account): void {
    setDeletingAccount(account);
  }

  function handleCloseForm(): void {
    setFormOpen(false);
    setEditingAccount(null);
    addButtonRef.current?.focus();
  }

  function handleFormSuccess(): void {
    setFormOpen(false);
    setEditingAccount(null);
    retry();
    addButtonRef.current?.focus();
  }

  function handleCloseDelete(): void {
    setDeletingAccount(null);
  }

  function handleDeleteSuccess(): void {
    setDeletingAccount(null);
    retry();
  }

  const memoizedTable = React.useMemo(
    () => (
      <AccountsTable
        data={accounts}
        loading={loading}
        error={error}
        onRetry={retry}
        onEdit={handleEdit}
        onDelete={handleDelete}
        hasPrevious={hasPrevious}
        hasMore={hasMore}
        pageSize={pageSize}
        onNext={goNext}
        onPrevious={goPrevious}
        onPageSizeChange={setPageSize}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      accounts,
      loading,
      error,
      retry,
      hasPrevious,
      hasMore,
      pageSize,
      goNext,
      goPrevious,
      setPageSize,
    ],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
        <Button ref={addButtonRef} onClick={() => void handleOpenAddForm()}>
          Add Account
        </Button>
      </div>

      {memoizedTable}

      <AccountForm
        open={formOpen}
        onClose={handleCloseForm}
        onSuccess={handleFormSuccess}
        defaultAccountNumber={defaultAccountNumber}
        account={editingAccount}
      />

      <DeleteAccountDialog
        open={deletingAccount != null}
        account={deletingAccount}
        onClose={handleCloseDelete}
        onSuccess={handleDeleteSuccess}
      />
    </div>
  );
}
