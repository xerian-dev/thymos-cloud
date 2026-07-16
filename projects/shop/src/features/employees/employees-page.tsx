import * as React from "react";
import { DataTable } from "@/components/shared/data-table";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { employeesColumns } from "./employees-columns";
import { usePaginatedEmployees } from "./use-paginated-employees";
import type { Employee } from "./employees-types";
import type { ColumnDef } from "@tanstack/react-table";

/**
 * Read-only employees listing page with cursor-based pagination.
 * Employees are managed by the import pipeline — no create/edit/delete actions.
 */
export function EmployeesPage(): React.ReactNode {
  const {
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
  } = usePaginatedEmployees();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
      </div>

      <DataTable
        columns={employeesColumns as ColumnDef<Employee, unknown>[]}
        data={employees}
        loading={loading}
        error={error}
        onRetry={retry}
        aria-label="Employees table"
        emptyMessage="No employees found."
        loadingMessage="Loading employees…"
      />

      {!loading && !error && (
        <PaginationControls
          hasPrevious={hasPrevious}
          hasMore={hasMore}
          onNext={goNext}
          onPrevious={goPrevious}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
      )}
    </div>
  );
}
