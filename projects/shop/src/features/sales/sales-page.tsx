import * as React from "react";
import { Button } from "@/components/ui/button";
import { SalesTable } from "./sales-table";
import { SaleForm } from "./sale-form";
import { DeleteSaleDialog } from "./delete-sale-dialog";
import { UserDetailPanel } from "@/components/shared/user-detail-panel";
import { usePaginatedSales } from "./use-paginated-sales";
import type { Sale } from "./sales-types";

export function SalesPage(): React.ReactNode {
  const {
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
  } = usePaginatedSales();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingSale, setEditingSale] = React.useState<Sale | null>(null);
  const [deletingSale, setDeletingSale] = React.useState<Sale | null>(null);
  const [userPanelOpen, setUserPanelOpen] = React.useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = React.useState<
    string | null
  >(null);

  const addButtonRef = React.useRef<HTMLButtonElement>(null);

  function handleOpenAddForm(): void {
    setEditingSale(null);
    setFormOpen(true);
  }

  function handleEdit(sale: Sale): void {
    setEditingSale(sale);
    setFormOpen(true);
  }

  function handleDelete(sale: Sale): void {
    setDeletingSale(sale);
  }

  function handleCloseForm(): void {
    setFormOpen(false);
    setEditingSale(null);
    addButtonRef.current?.focus();
  }

  function handleFormSuccess(): void {
    setFormOpen(false);
    setEditingSale(null);
    retry();
    addButtonRef.current?.focus();
  }

  function handleCloseDelete(): void {
    setDeletingSale(null);
  }

  function handleDeleteSuccess(): void {
    setDeletingSale(null);
    retry();
  }

  function handleViewUser(employeeId: string): void {
    setSelectedEmployeeId(employeeId);
    setUserPanelOpen(true);
  }

  function handleCloseUserPanel(): void {
    setUserPanelOpen(false);
    setSelectedEmployeeId(null);
  }

  const memoizedTable = React.useMemo(
    () => (
      <SalesTable
        data={sales}
        loading={loading}
        error={error}
        onRetry={retry}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onViewUser={handleViewUser}
        hasPrevious={hasPrevious}
        hasMore={hasMore}
        pageSize={pageSize}
        onNext={goNext}
        onPrevious={goPrevious}
        onPageSizeChange={setPageSize}
      />
    ),
    [
      sales,
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
        <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
        <Button ref={addButtonRef} onClick={handleOpenAddForm}>
          Add Sale
        </Button>
      </div>

      {memoizedTable}

      <SaleForm
        open={formOpen}
        onClose={handleCloseForm}
        onSuccess={handleFormSuccess}
        mode={editingSale ? "edit" : "create"}
        sale={editingSale ?? undefined}
      />

      <DeleteSaleDialog
        open={deletingSale != null}
        sale={deletingSale}
        onClose={handleCloseDelete}
        onSuccess={handleDeleteSuccess}
      />

      <UserDetailPanel
        open={userPanelOpen}
        onClose={handleCloseUserPanel}
        employeeId={selectedEmployeeId}
      />
    </div>
  );
}
