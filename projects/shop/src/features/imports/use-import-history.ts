import { useCallback, useEffect, useRef, useState } from "react";

import type { PageSize } from "@/lib/pagination-types";
import type {
  HistoryJobSummary,
  ImportHistoryResponse,
  ImportType,
} from "./imports-types";
import { fetchImportHistory } from "./imports-api";
import { createPageStack } from "./import-history-utils";
import type { PageStack } from "./import-history-utils";

export interface UseImportHistoryResult {
  expanded: boolean;
  toggle: () => void;
  jobs: HistoryJobSummary[];
  loading: boolean;
  error: string | null;
  retry: () => void;
  hasMore: boolean;
  hasPrevious: boolean;
  pageSize: PageSize;
  setPageSize: (size: PageSize) => void;
  goNext: () => void;
  goPrevious: () => void;
}

export function useImportHistory(type: ImportType): UseImportHistoryResult {
  const [expanded, setExpanded] = useState<boolean>(false);
  const [jobs, setJobs] = useState<HistoryJobSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [hasPrevious, setHasPrevious] = useState<boolean>(false);
  const [pageSize, setPageSizeState] = useState<PageSize>(20);

  const abortControllerRef = useRef<AbortController | null>(null);
  const pageStackRef = useRef<PageStack>(createPageStack());
  const currentTokenRef = useRef<string | undefined>(undefined);
  const nextTokenRef = useRef<string | undefined>(undefined);
  const pageSizeRef = useRef<PageSize>(pageSize);

  // Keep pageSizeRef in sync
  useEffect(() => {
    pageSizeRef.current = pageSize;
  }, [pageSize]);

  const fetchPage = useCallback(
    async (token?: string): Promise<void> => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const response: ImportHistoryResponse = await fetchImportHistory(
          { type, pageSize: pageSizeRef.current, nextToken: token },
          { signal: controller.signal },
        );

        if (controller.signal.aborted) {
          return;
        }

        setJobs(response.jobs);
        setHasMore(!!response.nextToken);
        nextTokenRef.current = response.nextToken;
        currentTokenRef.current = token;
        setHasPrevious(pageStackRef.current.size() > 0);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        if (controller.signal.aborted) {
          return;
        }

        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Unable to load import history");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [type],
  );

  const toggle = useCallback((): void => {
    setExpanded((prev) => {
      const next = !prev;
      if (next) {
        // Expanding: fetch first page
        pageStackRef.current.clear();
        currentTokenRef.current = undefined;
        nextTokenRef.current = undefined;
        setHasPrevious(false);
        void fetchPage(undefined);
      } else {
        // Collapsing: abort in-flight request, clear state
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        setJobs([]);
        setError(null);
        setHasMore(false);
        setHasPrevious(false);
        setLoading(false);
        pageStackRef.current.clear();
        currentTokenRef.current = undefined;
        nextTokenRef.current = undefined;
      }
      return next;
    });
  }, [fetchPage]);

  const retry = useCallback((): void => {
    void fetchPage(currentTokenRef.current);
  }, [fetchPage]);

  const goNext = useCallback((): void => {
    if (!nextTokenRef.current) return;

    // Push the current token so we can go back.
    // Empty string is a sentinel for "first page" (no token).
    if (currentTokenRef.current !== undefined) {
      pageStackRef.current.push(currentTokenRef.current);
    } else {
      pageStackRef.current.push("");
    }

    void fetchPage(nextTokenRef.current);
  }, [fetchPage]);

  const goPrevious = useCallback((): void => {
    const previousToken = pageStackRef.current.pop();
    if (previousToken === undefined) return;

    // Empty string sentinel means first page (no token)
    const token = previousToken === "" ? undefined : previousToken;
    void fetchPage(token);
  }, [fetchPage]);

  const setPageSize = useCallback(
    (size: PageSize): void => {
      setPageSizeState(size);
      pageSizeRef.current = size;
      // Reset to first page when page size changes
      pageStackRef.current.clear();
      currentTokenRef.current = undefined;
      nextTokenRef.current = undefined;
      setHasPrevious(false);
      if (expanded) {
        void fetchPage(undefined);
      }
    },
    [expanded, fetchPage],
  );

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    expanded,
    toggle,
    jobs,
    loading,
    error,
    retry,
    hasMore,
    hasPrevious,
    pageSize,
    setPageSize,
    goNext,
    goPrevious,
  };
}
