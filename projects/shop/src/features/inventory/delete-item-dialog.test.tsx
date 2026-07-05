import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DeleteItemDialog } from "./delete-item-dialog";
import type { Item } from "./items-types";
import type { DeleteItemResult } from "./items-types";

vi.mock("./items-api", () => ({
  deleteItem: vi.fn(),
}));

import { deleteItem } from "./items-api";

const mockDeleteItem = vi.mocked(deleteItem);

const mockItem: Item = {
  uuid: "abc-123",
  sku: 42,
  accountId: "acc-001",
  title: "Vintage Lamp",
  tagPrice: 59.99,
  quantity: 1,
  split: 60,
  inventoryType: "Consignment",
  terms: "Return To Consignor",
  taxExempt: false,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

describe("DeleteItemDialog", () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when item is null", () => {
    const { container } = render(
      <DeleteItemDialog
        open={true}
        item={null}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("displays item title and SKU in confirmation message", () => {
    render(
      <DeleteItemDialog
        open={true}
        item={mockItem}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    expect(screen.getByText("Delete Item")).toBeInTheDocument();
    expect(screen.getByText("Vintage Lamp")).toBeInTheDocument();
    expect(screen.getByText(/SKU: 42/)).toBeInTheDocument();
  });

  it("calls deleteItem and onSuccess on successful confirmation", async () => {
    mockDeleteItem.mockResolvedValue({ success: true } as DeleteItemResult);

    render(
      <DeleteItemDialog
        open={true}
        item={mockItem}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockDeleteItem).toHaveBeenCalledWith("abc-123");
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it("shows not_found error message on failure", async () => {
    mockDeleteItem.mockResolvedValue({ success: false, error: "not_found" });

    render(
      <DeleteItemDialog
        open={true}
        item={mockItem}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        screen.getByText("Item not found. It may have been deleted."),
      ).toBeInTheDocument();
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("shows network error message on failure", async () => {
    mockDeleteItem.mockResolvedValue({ success: false, error: "network" });

    render(
      <DeleteItemDialog
        open={true}
        item={mockItem}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        screen.getByText("Connection failed. Check your internet connection."),
      ).toBeInTheDocument();
    });
  });

  it("shows server error message on failure", async () => {
    mockDeleteItem.mockResolvedValue({ success: false, error: "server" });

    render(
      <DeleteItemDialog
        open={true}
        item={mockItem}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        screen.getByText("An unexpected error occurred. Please try again."),
      ).toBeInTheDocument();
    });
  });

  it("shows timeout error message on failure", async () => {
    mockDeleteItem.mockResolvedValue({ success: false, error: "timeout" });

    render(
      <DeleteItemDialog
        open={true}
        item={mockItem}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        screen.getByText("Request timed out. Please try again."),
      ).toBeInTheDocument();
    });
  });

  it("disables confirm button while deleting", async () => {
    let resolveDelete: (value: DeleteItemResult) => void;
    mockDeleteItem.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );

    render(
      <DeleteItemDialog
        open={true}
        item={mockItem}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    });

    resolveDelete!({ success: true });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("does not close dialog on error", async () => {
    mockDeleteItem.mockResolvedValue({ success: false, error: "server" });

    render(
      <DeleteItemDialog
        open={true}
        item={mockItem}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        screen.getByText("An unexpected error occurred. Please try again."),
      ).toBeInTheDocument();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("displays error with role=alert for accessibility", async () => {
    mockDeleteItem.mockResolvedValue({ success: false, error: "not_found" });

    render(
      <DeleteItemDialog
        open={true}
        item={mockItem}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
