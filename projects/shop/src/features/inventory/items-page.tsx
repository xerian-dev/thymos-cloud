import * as React from "react";
import { Button } from "@/components/ui/button";
import { ItemsTable } from "./items-table";
import { ItemForm } from "./item-form";
import { DeleteItemDialog } from "./delete-item-dialog";
import { usePaginatedItems } from "./use-paginated-items";
import { fetchNextSku } from "./items-api";
import type { Item } from "./items-types";

export function ItemsPage(): React.ReactNode {
  const {
    items,
    loading,
    error,
    hasMore,
    hasPrevious,
    pageSize,
    goNext,
    goPrevious,
    setPageSize,
    retry,
  } = usePaginatedItems();

  const [formOpen, setFormOpen] = React.useState(false);
  const [formMode, setFormMode] = React.useState<"create" | "edit">("create");
  const [editItem, setEditItem] = React.useState<Item | null>(null);
  const [nextSku, setNextSku] = React.useState<number | undefined>(undefined);
  const [deleteItem, setDeleteItem] = React.useState<Item | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  const addButtonRef = React.useRef<HTMLButtonElement>(null);

  async function handleAddItem(): Promise<void> {
    setEditItem(null);
    setFormMode("create");
    try {
      const result = await fetchNextSku();
      setNextSku(result.nextSku);
    } catch {
      setNextSku(undefined);
    }
    setFormOpen(true);
  }

  function handleEdit(item: Item): void {
    setEditItem(item);
    setFormMode("edit");
    setNextSku(undefined);
    setFormOpen(true);
  }

  function handleDelete(item: Item): void {
    setDeleteItem(item);
    setDeleteDialogOpen(true);
  }

  function handleCloseForm(): void {
    setFormOpen(false);
    setEditItem(null);
    addButtonRef.current?.focus();
  }

  function handleFormSuccess(): void {
    setFormOpen(false);
    setEditItem(null);
    retry();
    addButtonRef.current?.focus();
  }

  function handleCloseDelete(): void {
    setDeleteDialogOpen(false);
    setDeleteItem(null);
  }

  function handleDeleteSuccess(): void {
    setDeleteDialogOpen(false);
    setDeleteItem(null);
    retry();
  }

  const memoizedTable = React.useMemo(
    () => (
      <ItemsTable
        data={items}
        loading={loading}
        error={error}
        onRetry={retry}
        onEdit={handleEdit}
        onDelete={handleDelete}
        hasPrevious={hasPrevious}
        hasMore={hasMore}
        pageSize={pageSize}
        onNext={goNext}
        onPrevious={goPrevious}
        onPageSizeChange={setPageSize}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      items,
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
        <h1 className="text-2xl font-bold tracking-tight">Items</h1>
        <Button ref={addButtonRef} onClick={() => void handleAddItem()}>
          Add Item
        </Button>
      </div>

      {memoizedTable}

      <ItemForm
        open={formOpen}
        onClose={handleCloseForm}
        onSuccess={handleFormSuccess}
        mode={formMode}
        item={editItem ?? undefined}
        nextSku={nextSku}
      />

      <DeleteItemDialog
        open={deleteDialogOpen}
        item={deleteItem}
        onClose={handleCloseDelete}
        onSuccess={handleDeleteSuccess}
      />
    </div>
  );
}
