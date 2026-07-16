import { useCallback, useEffect, useRef, useState } from "react";

import type { PageSize } from "@/lib/pagination-types";
import type {
  Sale,
  CachedPage,
  UsePaginatedSalesResult,
} from "./sales-types";
import { fetchCursorPaginatedSales } from "./sales-api";

export function usePaginatedSales(): UsePaginatedSalesResult {
  const [pageCache, setPageCache] = useState<CachedPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [pageSize, setPageSizeState] = useState<PageSize>(20);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastFetchParamsRef = useRef<{ pageSize: PageSize; cursor?: string }>({
    pageSize: 20,
  });

  const fetchPage = useCallback(
    async (size: PageSize, cursor?: string): Promise<void> => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      lastFetchParamsRef.current = { pageSize: size, cursor };

      setLoading(true);
      setError(null);

      try {
        const data = await fetchCursorPaginatedSales(
          { pageSize: size, cursor },
          { signal: controller.signal },
        );

        if (controller.signal.aborted) {
          return;
        }

        const newPage: CachedPage = {
          sales: data.sales,
          nextCursor: data.nextCursor,
        };

        if (cursor === undefined) {
          setPageCache([newPage]);
          setCurrentPageIndex(0);
        } else {
          setPageCache((prev) => {
            const updated = [...prev, newPage];
            return updated;
          });
          setCurrentPageIndex((prev) => prev + 1);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        if (controller.signal.aborted) {
          return;
        }

        setError(
          err instanceof Error ? err.message : "Unable to load sales",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void fetchPage(pageSize);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goNext = useCallback((): void => {
    const cachedNextPage = pageCache[currentPageIndex + 1];
    if (cachedNextPage) {
      setCurrentPageIndex((prev) => prev + 1);
      return;
    }

    const currentPage = pageCache[currentPageIndex];
    if (currentPage?.nextCursor) {
      void fetchPage(pageSize, currentPage.nextCursor);
    }
  }, [pageCache, currentPageIndex, fetchPage, pageSize]);

  const goPrevious = useCallback((): void => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex((prev) => prev - 1);
    }
  }, [currentPageIndex]);

  const setPageSize = useCallback(
    (size: PageSize): void => {
      setPageSizeState(size);
      setPageCache([]);
      setCurrentPageIndex(0);
      void fetchPage(size);
    },
    [fetchPage],
  );

  const retry = useCallback((): void => {
    const { pageSize: lastSize, cursor: lastCursor } =
      lastFetchParamsRef.current;
    void fetchPage(lastSize, lastCursor);
  }, [fetchPage]);

  const currentPage = pageCache[currentPageIndex] as CachedPage | undefined;
  const sales: Sale[] = currentPage?.sales ?? [];
  const hasMore = currentPage
    ? currentPage.nextCursor !== null || currentPageIndex < pageCache.length - 1
    : false;
  const hasPrevious = currentPageIndex > 0;

  return {
    sales,
    loading,
    error,
    hasMore,
    hasPrevious,
    pageSize,
    goNext,
    goPrevious,
    setPageSize,
    retry,
  };
}
