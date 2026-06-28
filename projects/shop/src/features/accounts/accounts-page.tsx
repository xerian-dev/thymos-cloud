import * as React from "react";
import { Button } from "@/components/ui/button";
import { AccountsTable } from "./accounts-table";
import { AccountForm } from "./account-form";
import { useAccounts } from "./use-accounts";
import { fetchNextAccountNumber } from "./accounts-api";
import type { Account } from "./accounts-types";

export function AccountsPage(): React.ReactNode {
  const { accounts, loading, error, refresh } = useAccounts();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingAccount, setEditingAccount] = React.useState<Account | null>(
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

  function handleCloseForm(): void {
    setFormOpen(false);
    setEditingAccount(null);
    addButtonRef.current?.focus();
  }

  function handleSuccess(): void {
    setFormOpen(false);
    setEditingAccount(null);
    refresh();
    addButtonRef.current?.focus();
  }

  const memoizedTable = React.useMemo(
    () => (
      <AccountsTable
        data={accounts}
        loading={loading}
        error={error}
        onRetry={refresh}
        onEdit={handleEdit}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accounts, loading, error, refresh],
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
        onSuccess={handleSuccess}
        defaultAccountNumber={defaultAccountNumber}
        account={editingAccount}
      />
    </div>
  );
}
