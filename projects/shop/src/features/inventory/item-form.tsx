import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createItem, updateItem } from "./items-api";
import { itemFormSchema } from "./items-validation";
import { ImageUpload } from "./image-upload";
import { fetchAccounts } from "../accounts/accounts-api";
import type { Account } from "../accounts/accounts-types";
import type { Item, CreateItemRequest, UpdateItemRequest } from "./items-types";

export interface ItemFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: "create" | "edit";
  item?: Item;
  nextSku?: number;
}

interface FormErrors {
  accountId?: string;
  title?: string;
  tagPrice?: string;
  quantity?: string;
  split?: string;
  inventoryType?: string;
  terms?: string;
  description?: string;
  details?: string;
  tags?: string;
  expirationDate?: string;
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  shelf?: string;
  general?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  account_not_found: "Account not found",
  validation: "Please correct the errors below.",
  not_found: "Item not found. It may have been deleted.",
  network: "Connection failed. Check your internet connection.",
  server: "An unexpected error occurred. Please try again.",
  timeout: "Request timed out. Please try again.",
};

const INVENTORY_TYPES = ["Consignment", "Retail"] as const;
const TERMS_OPTIONS = ["Return To Consignor", "Donate", "Discard"] as const;

function getDefaultFormState() {
  return {
    accountId: "",
    title: "",
    category: "",
    description: "",
    brand: "",
    color: "",
    size: "",
    details: "",
    imageKeys: [] as string[],
    quantity: "1",
    tagPrice: "",
    tags: "",
    inventoryType: "Consignment" as string,
    hasExpiration: false,
    expirationDate: "",
    shelf: "",
    split: "",
    terms: "Return To Consignor" as string,
    taxExempt: false,
  };
}

export function ItemForm({
  open,
  onClose,
  onSuccess,
  mode,
  item,
  nextSku,
}: ItemFormProps): React.ReactNode {
  const isEditMode = mode === "edit";

  const [formState, setFormState] = React.useState(getDefaultFormState());
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [accountSearch, setAccountSearch] = React.useState("");
  const [showAccountDropdown, setShowAccountDropdown] = React.useState(false);

  const titleRef = React.useRef<HTMLInputElement>(null);
  const accountInputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Load accounts for the dropdown
  React.useEffect(() => {
    if (open) {
      fetchAccounts()
        .then((data) => setAccounts(data.accounts))
        .catch(() => setAccounts([]));
    }
  }, [open]);

  // Reset form state when dialog opens
  React.useEffect(() => {
    if (open) {
      if (isEditMode && item) {
        setFormState({
          accountId: item.accountId,
          title: item.title,
          category: item.category ?? "",
          description: item.description ?? "",
          brand: item.brand ?? "",
          color: item.color ?? "",
          size: item.size ?? "",
          details: item.details ?? "",
          imageKeys: item.imageKeys ?? [],
          quantity: String(item.quantity),
          tagPrice: String(item.tagPrice),
          tags: item.tags?.join(", ") ?? "",
          inventoryType: item.inventoryType,
          hasExpiration: !!item.expirationDate,
          expirationDate: item.expirationDate ?? "",
          shelf: item.shelf ?? "",
          split: String(item.split),
          terms: item.terms,
          taxExempt: item.taxExempt,
        });
        setAccountSearch(getAccountDisplayName(item.accountId));
      } else {
        setFormState(getDefaultFormState());
        setAccountSearch("");
      }
      setErrors({});
      setSubmitting(false);
      setShowAccountDropdown(false);

      const timer = setTimeout(() => {
        if (isEditMode) {
          titleRef.current?.focus();
        } else {
          accountInputRef.current?.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, isEditMode, item]);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowAccountDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function getAccountDisplayName(accountId: string): string {
    const account = accounts.find((a) => a.uuid === accountId);
    return account ? `${account.accountNumber} - ${account.name}` : accountId;
  }

  const filteredAccounts = React.useMemo(() => {
    if (!accountSearch) return accounts;
    const lower = accountSearch.toLowerCase();
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(lower) ||
        String(a.accountNumber).includes(lower),
    );
  }, [accounts, accountSearch]);

  function handleAccountSelect(account: Account): void {
    setFormState((prev) => ({ ...prev, accountId: account.uuid }));
    setAccountSearch(`${account.accountNumber} - ${account.name}`);
    setShowAccountDropdown(false);
  }

  function updateField(field: string, value: string | boolean | string[]) {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    // Parse numeric fields
    const tagPriceNum = parseFloat(formState.tagPrice);
    const quantityNum = parseInt(formState.quantity, 10);
    const splitNum = parseInt(formState.split, 10);

    // Parse tags from comma-separated string
    const tagsArray = formState.tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const validationInput = {
      accountId: formState.accountId,
      title: formState.title,
      tagPrice: isNaN(tagPriceNum) ? undefined : tagPriceNum,
      quantity: isNaN(quantityNum) ? undefined : quantityNum,
      split: isNaN(splitNum) ? undefined : splitNum,
      inventoryType: formState.inventoryType,
      terms: formState.terms,
      ...(formState.description && { description: formState.description }),
      ...(formState.details && { details: formState.details }),
      ...(tagsArray.length > 0 && { tags: tagsArray }),
      ...(formState.hasExpiration &&
        formState.expirationDate && {
          expirationDate: formState.expirationDate,
        }),
    };

    const result = itemFormSchema.safeParse(validationInput);

    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FormErrors;
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    const requestBody: CreateItemRequest | UpdateItemRequest = {
      accountId: formState.accountId,
      title: formState.title,
      tagPrice: tagPriceNum,
      quantity: quantityNum,
      split: splitNum,
      inventoryType: formState.inventoryType as "Consignment" | "Retail",
      terms: formState.terms as "Return To Consignor" | "Donate" | "Discard",
      ...(formState.description && { description: formState.description }),
      ...(formState.category && { category: formState.category }),
      ...(formState.brand && { brand: formState.brand }),
      ...(formState.color && { color: formState.color }),
      ...(formState.size && { size: formState.size }),
      ...(formState.shelf && { shelf: formState.shelf }),
      ...(formState.details && { details: formState.details }),
      ...(tagsArray.length > 0 && { tags: tagsArray }),
      ...(formState.hasExpiration &&
        formState.expirationDate && {
          expirationDate: formState.expirationDate,
        }),
      taxExempt: formState.taxExempt,
      ...(formState.imageKeys.length > 0 && {
        imageKeys: formState.imageKeys,
      }),
    };

    if (isEditMode && item) {
      const apiResult = await updateItem(item.uuid, requestBody);
      if (apiResult.success) {
        onSuccess();
      } else {
        setSubmitting(false);
        handleApiError(apiResult);
      }
    } else {
      const apiResult = await createItem(requestBody);
      if (apiResult.success) {
        setFormState(getDefaultFormState());
        setAccountSearch("");
        onSuccess();
      } else {
        setSubmitting(false);
        handleApiError(apiResult);
      }
    }
  }

  function handleApiError(apiResult: {
    success: false;
    error: string;
    fields?: Array<{ field: string; message: string }>;
  }): void {
    if (apiResult.error === "validation" && apiResult.fields) {
      const fieldErrors: FormErrors = {};
      for (const fieldError of apiResult.fields) {
        const key = fieldError.field as keyof FormErrors;
        if (key && !fieldErrors[key]) {
          fieldErrors[key] = fieldError.message;
        }
      }
      setErrors(fieldErrors);
    } else if (apiResult.error === "account_not_found") {
      setErrors({ accountId: ERROR_MESSAGES.account_not_found });
    } else {
      setErrors({
        general: ERROR_MESSAGES[apiResult.error] ?? ERROR_MESSAGES.server,
      });
    }
  }

  const skuDisplay = isEditMode ? item?.sku : nextSku;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        aria-describedby="item-form-description"
      >
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Item" : "Add Item"}</DialogTitle>
          <DialogDescription id="item-form-description">
            {isEditMode
              ? "Update the item details."
              : "Create a new inventory item."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="flex flex-col gap-4">
            {errors.general && (
              <div
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <div className="flex items-center justify-between">
                  <span>{errors.general}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setErrors((prev) => ({ ...prev, general: undefined }))
                    }
                    className="text-destructive hover:text-destructive/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded"
                    aria-label="Dismiss error"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Item Attributes */}
              <div className="flex flex-col gap-4">
                {/* Account (searchable dropdown) */}
                <div className="relative flex flex-col gap-2" ref={dropdownRef}>
                  <Label htmlFor="item-account">
                    Account <span aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </Label>
                  <Input
                    ref={accountInputRef}
                    id="item-account"
                    type="text"
                    value={accountSearch}
                    onChange={(e) => {
                      setAccountSearch(e.target.value);
                      setShowAccountDropdown(true);
                      if (!e.target.value) {
                        updateField("accountId", "");
                      }
                    }}
                    onFocus={() => setShowAccountDropdown(true)}
                    placeholder="Search accounts..."
                    aria-invalid={errors.accountId ? true : undefined}
                    aria-describedby={
                      errors.accountId ? "item-account-error" : undefined
                    }
                    aria-expanded={showAccountDropdown}
                    aria-autocomplete="list"
                    aria-controls="account-listbox"
                    role="combobox"
                    disabled={submitting}
                    aria-required="true"
                  />
                  {showAccountDropdown && filteredAccounts.length > 0 && (
                    <ul
                      id="account-listbox"
                      role="listbox"
                      className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
                    >
                      {filteredAccounts.map((account) => (
                        <li
                          key={account.uuid}
                          role="option"
                          aria-selected={formState.accountId === account.uuid}
                          className="cursor-pointer rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
                          onClick={() => handleAccountSelect(account)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              handleAccountSelect(account);
                            }
                          }}
                          tabIndex={0}
                        >
                          {account.accountNumber} - {account.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  {errors.accountId && (
                    <p
                      id="item-account-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {errors.accountId}
                    </p>
                  )}
                </div>

                {/* Title */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-title">
                    Title <span aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </Label>
                  <Input
                    ref={titleRef}
                    id="item-title"
                    type="text"
                    maxLength={200}
                    value={formState.title}
                    onChange={(e) => updateField("title", e.target.value)}
                    aria-invalid={errors.title ? true : undefined}
                    aria-describedby={
                      errors.title ? "item-title-error" : undefined
                    }
                    aria-required="true"
                    disabled={submitting}
                  />
                  {errors.title && (
                    <p
                      id="item-title-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {errors.title}
                    </p>
                  )}
                </div>

                {/* SKU (read-only) */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-sku">SKU</Label>
                  <Input
                    id="item-sku"
                    type="text"
                    value={skuDisplay != null ? String(skuDisplay) : "—"}
                    readOnly
                    disabled
                    aria-label="SKU (read-only)"
                  />
                </div>

                {/* Category */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-category">Category</Label>
                  <Input
                    id="item-category"
                    type="text"
                    value={formState.category}
                    onChange={(e) => updateField("category", e.target.value)}
                    disabled={submitting}
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-description">Description</Label>
                  <textarea
                    id="item-description"
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    maxLength={2000}
                    value={formState.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    aria-invalid={errors.description ? true : undefined}
                    aria-describedby={
                      errors.description ? "item-description-error" : undefined
                    }
                    disabled={submitting}
                  />
                  {errors.description && (
                    <p
                      id="item-description-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {errors.description}
                    </p>
                  )}
                </div>

                {/* Brand */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-brand">Brand</Label>
                  <Input
                    id="item-brand"
                    type="text"
                    value={formState.brand}
                    onChange={(e) => updateField("brand", e.target.value)}
                    disabled={submitting}
                  />
                </div>

                {/* Color */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-color">Color</Label>
                  <Input
                    id="item-color"
                    type="text"
                    value={formState.color}
                    onChange={(e) => updateField("color", e.target.value)}
                    disabled={submitting}
                  />
                </div>

                {/* Size */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-size">Size</Label>
                  <Input
                    id="item-size"
                    type="text"
                    value={formState.size}
                    onChange={(e) => updateField("size", e.target.value)}
                    disabled={submitting}
                  />
                </div>

                {/* Details (rich text - textarea for now) */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-details">Details</Label>
                  <textarea
                    id="item-details"
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    maxLength={5000}
                    value={formState.details}
                    onChange={(e) => updateField("details", e.target.value)}
                    aria-invalid={errors.details ? true : undefined}
                    aria-describedby={
                      errors.details ? "item-details-error" : undefined
                    }
                    disabled={submitting}
                  />
                  {errors.details && (
                    <p
                      id="item-details-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {errors.details}
                    </p>
                  )}
                </div>

                {/* Image Upload */}
                <div className="flex flex-col gap-2">
                  <Label>Images</Label>
                  <ImageUpload
                    value={formState.imageKeys}
                    onChange={(keys) => updateField("imageKeys", keys)}
                  />
                </div>
              </div>

              {/* Right Column: Inventory/Pricing */}
              <div className="flex flex-col gap-4">
                {/* Quantity */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-quantity">
                    Quantity <span aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </Label>
                  <Input
                    id="item-quantity"
                    type="number"
                    min={1}
                    max={9999}
                    value={formState.quantity}
                    onChange={(e) => updateField("quantity", e.target.value)}
                    aria-invalid={errors.quantity ? true : undefined}
                    aria-describedby={
                      errors.quantity ? "item-quantity-error" : undefined
                    }
                    aria-required="true"
                    disabled={submitting}
                  />
                  {errors.quantity && (
                    <p
                      id="item-quantity-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {errors.quantity}
                    </p>
                  )}
                </div>

                {/* Tag Price */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-tag-price">
                    Tag Price (CHF) <span aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </Label>
                  <Input
                    id="item-tag-price"
                    type="number"
                    min={0}
                    max={999999.99}
                    step="0.01"
                    value={formState.tagPrice}
                    onChange={(e) => updateField("tagPrice", e.target.value)}
                    aria-invalid={errors.tagPrice ? true : undefined}
                    aria-describedby={
                      errors.tagPrice ? "item-tag-price-error" : undefined
                    }
                    aria-required="true"
                    disabled={submitting}
                  />
                  {errors.tagPrice && (
                    <p
                      id="item-tag-price-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {errors.tagPrice}
                    </p>
                  )}
                </div>

                {/* Tags */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-tags">Tags (comma-separated)</Label>
                  <Input
                    id="item-tags"
                    type="text"
                    value={formState.tags}
                    onChange={(e) => updateField("tags", e.target.value)}
                    placeholder="e.g. vintage, designer, sale"
                    aria-invalid={errors.tags ? true : undefined}
                    aria-describedby={
                      errors.tags ? "item-tags-error" : undefined
                    }
                    disabled={submitting}
                  />
                  {errors.tags && (
                    <p
                      id="item-tags-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {errors.tags}
                    </p>
                  )}
                </div>

                {/* Inventory Type */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-inventory-type">
                    Inventory Type <span aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </Label>
                  <select
                    id="item-inventory-type"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={formState.inventoryType}
                    onChange={(e) =>
                      updateField("inventoryType", e.target.value)
                    }
                    aria-invalid={errors.inventoryType ? true : undefined}
                    aria-describedby={
                      errors.inventoryType
                        ? "item-inventory-type-error"
                        : undefined
                    }
                    aria-required="true"
                    disabled={submitting}
                  >
                    {INVENTORY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  {errors.inventoryType && (
                    <p
                      id="item-inventory-type-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {errors.inventoryType}
                    </p>
                  )}
                </div>

                {/* Expiration Date (toggle + picker) */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="item-has-expiration"
                      checked={formState.hasExpiration}
                      onChange={(e) => {
                        updateField("hasExpiration", e.target.checked);
                        if (!e.target.checked) {
                          updateField("expirationDate", "");
                        }
                      }}
                      className="h-4 w-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      disabled={submitting}
                    />
                    <Label htmlFor="item-has-expiration">Expiration Date</Label>
                  </div>
                  {formState.hasExpiration && (
                    <Input
                      id="item-expiration-date"
                      type="date"
                      value={formState.expirationDate}
                      onChange={(e) =>
                        updateField("expirationDate", e.target.value)
                      }
                      aria-label="Expiration date"
                      aria-invalid={errors.expirationDate ? true : undefined}
                      aria-describedby={
                        errors.expirationDate
                          ? "item-expiration-date-error"
                          : undefined
                      }
                      disabled={submitting}
                    />
                  )}
                  {errors.expirationDate && (
                    <p
                      id="item-expiration-date-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {errors.expirationDate}
                    </p>
                  )}
                </div>

                {/* Shelf */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-shelf">Shelf</Label>
                  <Input
                    id="item-shelf"
                    type="text"
                    value={formState.shelf}
                    onChange={(e) => updateField("shelf", e.target.value)}
                    disabled={submitting}
                  />
                </div>

                {/* Split */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-split">
                    Split (% to consignor) <span aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </Label>
                  <Input
                    id="item-split"
                    type="number"
                    min={0}
                    max={100}
                    value={formState.split}
                    onChange={(e) => updateField("split", e.target.value)}
                    aria-invalid={errors.split ? true : undefined}
                    aria-describedby={
                      errors.split ? "item-split-error" : undefined
                    }
                    aria-required="true"
                    disabled={submitting}
                  />
                  {errors.split && (
                    <p
                      id="item-split-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {errors.split}
                    </p>
                  )}
                </div>

                {/* Terms */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="item-terms">
                    Terms <span aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </Label>
                  <select
                    id="item-terms"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={formState.terms}
                    onChange={(e) => updateField("terms", e.target.value)}
                    aria-invalid={errors.terms ? true : undefined}
                    aria-describedby={
                      errors.terms ? "item-terms-error" : undefined
                    }
                    aria-required="true"
                    disabled={submitting}
                  >
                    {TERMS_OPTIONS.map((term) => (
                      <option key={term} value={term}>
                        {term}
                      </option>
                    ))}
                  </select>
                  {errors.terms && (
                    <p
                      id="item-terms-error"
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {errors.terms}
                    </p>
                  )}
                </div>

                {/* Tax Exempt */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="item-tax-exempt"
                    checked={formState.taxExempt}
                    onChange={(e) => updateField("taxExempt", e.target.checked)}
                    className="h-4 w-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    disabled={submitting}
                  />
                  <Label htmlFor="item-tax-exempt">Tax Exempt</Label>
                </div>
              </div>
            </div>

            {/* Submit buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? isEditMode
                    ? "Saving…"
                    : "Creating…"
                  : isEditMode
                    ? "Save Changes"
                    : "Create Item"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
