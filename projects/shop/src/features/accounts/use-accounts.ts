import { useCallback, useEffect, useState } from "react";

import type { Account } from "./accounts-types";
import { fetchAccounts } from "./accounts-api";

export interface UseAccountsResult {
  accounts: Account[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAccounts(): UseAccountsResult {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchAccounts();
      setAccounts(data.accounts);
    } catch {
      setAccounts([]);
      setError("Unable to load accounts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  return { accounts, loading, error, refresh: loadAccounts };
}
