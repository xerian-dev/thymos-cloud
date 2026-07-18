import { useCallback, useEffect, useRef, useState } from "react";

import type { ImportStatusResponse, ImportType } from "./imports-types";
import {
  cancelImport as cancelImportApi,
  fetchImportStatus,
  resumeImport as resumeImportApi,
  startImport as startImportApi,
} from "./imports-api";
import { shouldPoll } from "./imports-utils";

export interface UseImportStatusResult {
  status: ImportStatusResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  startImport: (type: ImportType) => Promise<void>;
  resumeImport: (type: ImportType) => Promise<void>;
  cancelImport: (type: ImportType) => Promise<void>;
  actionError: string | null;
  clearActionError: () => void;
}

const POLL_INTERVAL_MS = 10_000;

export function useImportStatus(): UseImportStatusResult {
  const [status, setStatus] = useState<ImportStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef<boolean>(true);

  const fetchStatus = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const data = await fetchImportStatus({ signal });

      if (signal?.aborted) {
        return;
      }

      setStatus(data);
      setError(null);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      if (signal?.aborted) {
        return;
      }

      setError(
        err instanceof Error ? err.message : "Unable to load import status",
      );
    }
  }, []);

  const loadStatus = useCallback(async (): Promise<void> => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);

    await fetchStatus(controller.signal);

    if (!controller.signal.aborted) {
      setLoading(false);
    }
  }, [fetchStatus]);

  const refresh = useCallback((): void => {
    void loadStatus();
  }, [loadStatus]);

  const clearActionError = useCallback((): void => {
    setActionError(null);
  }, []);

  const startImport = useCallback(
    async (type: ImportType): Promise<void> => {
      try {
        await startImportApi(type);
        setActionError(null);
        void loadStatus();
      } catch (err: unknown) {
        if (err instanceof Error) {
          const statusErr = err as Error & { status?: number };
          if (statusErr.status === 409) {
            setActionError(`An import is already running for ${type}`);
          } else {
            setActionError(err.message);
          }
        } else {
          setActionError("Failed to start import");
        }
      }
    },
    [loadStatus],
  );

  const resumeImport = useCallback(
    async (type: ImportType): Promise<void> => {
      const job = status?.[type];
      if (!job) {
        setActionError(`No job found for ${type}`);
        return;
      }

      try {
        await resumeImportApi(type, job.jobId);
        setActionError(null);
        void loadStatus();
      } catch (err: unknown) {
        if (err instanceof Error) {
          setActionError(err.message);
        } else {
          setActionError("Failed to resume import");
        }
      }
    },
    [status, loadStatus],
  );

  const cancelImport = useCallback(
    async (type: ImportType): Promise<void> => {
      const job = status?.[type];
      if (!job) {
        setActionError(`No job found for ${type}`);
        return;
      }

      try {
        await cancelImportApi(type, job.jobId);
        setActionError(null);
        void loadStatus();
      } catch (err: unknown) {
        if (err instanceof Error) {
          setActionError(err.message);
        } else {
          setActionError("Failed to cancel import");
        }
      }
    },
    [status, loadStatus],
  );

  // Initial fetch on mount
  useEffect(() => {
    mountedRef.current = true;
    void loadStatus();

    return () => {
      mountedRef.current = false;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling effect — start/stop based on shouldPoll
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (shouldPoll(status)) {
      intervalRef.current = setInterval(() => {
        if (mountedRef.current) {
          void loadStatus();
        }
      }, POLL_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status, loadStatus]);

  return {
    status,
    loading,
    error,
    refresh,
    startImport,
    resumeImport,
    cancelImport,
    actionError,
    clearActionError,
  };
}
