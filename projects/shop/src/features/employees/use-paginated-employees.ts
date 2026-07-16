import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CachedEmployeePage,
  Employee,
  PageSize,
  UsePaginatedEmployeesResult,
} from "./employees-types";
import { fetchPaginatedEmployees } from "./employees-api";

export function usePaginatedEmployees(): UsePaginatedEmployeesResult {
  const [pageCache, setPageCache] = useState<CachedEmployeePage[]>([]);
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
        const data = await fetchPaginatedEmployees(
          { pageSize: size, cursor },
          { signal: controller.signal },
        );

        if (controller.signal.aborted) {
          return;
        }

        const newPage: CachedEmployeePage = {
          employees: data.employees,
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
          err instanceof Error ? err.message : "Unable to load employees",
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

  const currentPage = pageCache[currentPageIndex] as
    | CachedEmployeePage
    | undefined;
  const employees: Employee[] = currentPage?.employees ?? [];
  const hasMore = currentPage
    ? currentPage.nextCursor !== null || currentPageIndex < pageCache.length - 1
    : false;
  const hasPrevious = currentPageIndex > 0;

  return {
    employees,
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
