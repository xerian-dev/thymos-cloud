import * as React from "react";
import type { AdjustmentFilters } from "./pricing-types";

export interface AdjustmentReportFiltersProps {
  filters: AdjustmentFilters;
  onFiltersChange: (filters: AdjustmentFilters) => void;
}

export function AdjustmentReportFilters({
  filters,
  onFiltersChange,
}: AdjustmentReportFiltersProps): React.ReactNode {
  function handleDirectionChange(
    e: React.ChangeEvent<HTMLSelectElement>,
  ): void {
    const value = e.target.value;
    onFiltersChange({
      ...filters,
      direction:
        value === "increase" || value === "decrease" ? value : undefined,
    });
  }

  function handleBrandChange(e: React.ChangeEvent<HTMLInputElement>): void {
    onFiltersChange({
      ...filters,
      brand: e.target.value || undefined,
    });
  }

  function handleCategoryChange(e: React.ChangeEvent<HTMLInputElement>): void {
    onFiltersChange({
      ...filters,
      category: e.target.value || undefined,
    });
  }

  function handleFromDateChange(e: React.ChangeEvent<HTMLInputElement>): void {
    onFiltersChange({
      ...filters,
      fromDate: e.target.value || undefined,
    });
  }

  function handleToDateChange(e: React.ChangeEvent<HTMLInputElement>): void {
    onFiltersChange({
      ...filters,
      toDate: e.target.value || undefined,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-direction"
          className="text-sm font-medium text-gray-700"
        >
          Direction
        </label>
        <select
          id="filter-direction"
          value={filters.direction ?? "all"}
          onChange={handleDirectionChange}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          <option value="all">All</option>
          <option value="increase">Increase</option>
          <option value="decrease">Decrease</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-brand"
          className="text-sm font-medium text-gray-700"
        >
          Brand
        </label>
        <input
          id="filter-brand"
          type="text"
          value={filters.brand ?? ""}
          onChange={handleBrandChange}
          placeholder="Filter by brand"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-category"
          className="text-sm font-medium text-gray-700"
        >
          Category
        </label>
        <input
          id="filter-category"
          type="text"
          value={filters.category ?? ""}
          onChange={handleCategoryChange}
          placeholder="Filter by category"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-from-date"
          className="text-sm font-medium text-gray-700"
        >
          From
        </label>
        <input
          id="filter-from-date"
          type="date"
          value={filters.fromDate ?? ""}
          onChange={handleFromDateChange}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-to-date"
          className="text-sm font-medium text-gray-700"
        >
          To
        </label>
        <input
          id="filter-to-date"
          type="date"
          value={filters.toDate ?? ""}
          onChange={handleToDateChange}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
      </div>
    </div>
  );
}
