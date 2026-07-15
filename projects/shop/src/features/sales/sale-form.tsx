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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSale, updateSale } from "./sales-api";
import { saleFormSchema } from "./sales-validation";
import type { Sale } from "./sales-types";

export interface SaleFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: "create" | "edit";
  sale?: Sale;
}

interface FormErrors {
  cashierId?: string;
  memo?: string;
  status?: string;
  general?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  validation: "Please check the form fields and try again.",
  invalid_transition: "Cannot change sale status. Invalid transition.",
  not_found: "Sale not found. It may have been deleted.",
  network: "Connection failed. Check your internet connection.",
  server: "An unexpected error occurred. Please try again.",
  timeout: "Request timed out. Please try again.",
};

export function SaleForm({
  open,
  onClose,
  onSuccess,
  mode,
  sale,
}: SaleFormProps): React.ReactNode {
  const isEditMode = mode === "edit";

  const [cashierId, setCashierId] = React.useState("");
  const [memo, setMemo] = React.useState("");
  const [status, setStatus] = React.useState<"finalized" | "voided" | "">("");
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  const cashierRef = React.useRef<HTMLInputElement>(null);

  // Reset form state when dialog opens
  React.useEffect(() => {
    if (open) {
      if (isEditMode && sale) {
        setCashierId(sale.cashierId);
        setMemo(sale.memo ?? "");
        setStatus(sale.status === "open" ? "" : sale.status);
      } else {
        setCashierId("");
        setMemo("");
        setStatus("");
      }
      setErrors({});
      setSubmitting(false);

      // Focus first editable input
      const timer = setTimeout(() => {
        cashierRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, isEditMode, sale]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const formData: Record<string, unknown> = {
      cashierId,
      memo: memo || undefined,
    };

    if (isEditMode && status) {
      formData.status = status;
    }

    const result = saleFormSchema.safeParse(formData);

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

    if (isEditMode && sale) {
      const apiResult = await updateSale(sale.uuid, {
        cashierId: result.data.cashierId,
        memo: result.data.memo,
        status: result.data.status,
      });

      if (apiResult.success) {
        onSuccess();
      } else {
        setSubmitting(false);
        setErrors({
          general: ERROR_MESSAGES[apiResult.error] ?? ERROR_MESSAGES.server,
        });
      }
    } else {
      const apiResult = await createSale({
        cashierId: result.data.cashierId,
        memo: result.data.memo,
        lineItems: [],
      });

      if (apiResult.success) {
        onSuccess();
      } else {
        setSubmitting(false);
        if (apiResult.error === "validation" && apiResult.fields) {
          const fieldErrors: FormErrors = {};
          for (const fieldError of apiResult.fields) {
            const field = fieldError.field as keyof FormErrors;
            if (field && !fieldErrors[field]) {
              fieldErrors[field] = fieldError.message;
            }
          }
          setErrors(fieldErrors);
        } else {
          setErrors({
            general: ERROR_MESSAGES[apiResult.error] ?? ERROR_MESSAGES.server,
          });
        }
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent aria-describedby="sale-form-description">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Sale" : "Create Sale"}
          </DialogTitle>
          <DialogDescription id="sale-form-description">
            {isEditMode
              ? "Update the sale details."
              : "Create a new sale record."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="flex flex-col gap-4">
            {errors.general && (
              <p role="alert" className="text-sm text-destructive">
                {errors.general}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="cashier-id">
                Cashier <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </Label>
              <Input
                ref={cashierRef}
                id="cashier-id"
                name="cashierId"
                type="text"
                value={cashierId}
                onChange={(e) => setCashierId(e.target.value)}
                aria-invalid={errors.cashierId ? true : undefined}
                aria-describedby={
                  errors.cashierId ? "cashier-id-error" : undefined
                }
                aria-required="true"
                disabled={submitting}
                placeholder="Employee ID"
              />
              {errors.cashierId && (
                <p
                  id="cashier-id-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.cashierId}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="memo">Memo</Label>
              <Textarea
                id="memo"
                name="memo"
                maxLength={500}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                aria-invalid={errors.memo ? true : undefined}
                aria-describedby={errors.memo ? "memo-error" : undefined}
                disabled={submitting}
                placeholder="Optional memo (max 500 characters)"
              />
              {errors.memo && (
                <p
                  id="memo-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.memo}
                </p>
              )}
            </div>

            {isEditMode && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={status}
                  onValueChange={(value) =>
                    setStatus(value as "finalized" | "voided")
                  }
                  disabled={submitting}
                >
                  <SelectTrigger
                    id="status"
                    className="w-full"
                    aria-invalid={errors.status ? true : undefined}
                    aria-describedby={
                      errors.status ? "status-error" : undefined
                    }
                  >
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="finalized">Finalized</SelectItem>
                    <SelectItem value="voided">Voided</SelectItem>
                  </SelectContent>
                </Select>
                {errors.status && (
                  <p
                    id="status-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {errors.status}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
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
                    : "Create Sale"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
