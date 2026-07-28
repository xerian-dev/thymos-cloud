import { useCallback, useEffect, useRef, useState } from "react";

import type { AdjustmentEvent, AdjustmentFilters } from "./pricing-types";
import { fetchAdjustments } from "./pricing-api";

export interface UseAdjustmentsParams {
  filters: AdjustmentFilters;
  pageSize?: number;
}

export interface UseAdjustmentsResult {
  adjustments: AdjustmentEvent[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

const DEFAULT_PAGE_SIZE = 20;

export function useAdjustments(
  params: UseAdjustmentsParams,
): UseAdjustmentsResult {
  const { filters, pageSize = DEFAULT_PAGE_SIZE } = params;

  const [adjustments, setAdjustments] = useState<AdjustmentEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const cursorRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (cursor: string | undefined, append: boolean): Promise<void> => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchAdjustments(
          { filters, pageSize, cursor },
          controller.signal,
        );

        if (controller.signal.aborted) {
          return;
        }

        if (result.success) {
          if (append) {
            setAdjustments((prev) => [...prev, ...result.data.adjustments]);
          } else {
            setAdjustments(result.data.adjustments);
          }
          cursorRef.current = result.data.nextCursor;
          setHasMore(result.data.hasMore);
        } else {
          setError(
            result.error === "network"
              ? "Network error — check your connection"
              : result.error === "timeout"
                ? "Request timed out"
                : "Unable to load adjustments",
          );
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        if (controller.signal.aborted) {
          return;
        }

        setError("Unable to load adjustments");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [filters, pageSize],
  );

  useEffect(() => {
    cursorRef.current = null;
    setAdjustments([]);
    void fetchPage(undefined, false);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchPage]);

  const loadMore = useCallback((): void => {
    if (isLoading || !hasMore || !cursorRef.current) {
      return;
    }
    void fetchPage(cursorRef.current, true);
  }, [isLoading, hasMore, fetchPage]);

  const refresh = useCallback((): void => {
    cursorRef.current = null;
    setAdjustments([]);
    void fetchPage(undefined, false);
  }, [fetchPage]);

  return {
    adjustments,
    isLoading,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}
