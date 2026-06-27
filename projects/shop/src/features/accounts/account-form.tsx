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
import { createAccount } from "./accounts-api";
import { accountFormSchema } from "./accounts-validation";
import { formatShopUid } from "./accounts-utils";

export interface AccountFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultAccountNumber: number | null;
}

interface FormErrors {
  accountNumber?: string;
  name?: string;
  address?: string;
  telephone?: string;
  general?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  duplicate: "Account number is already in use",
  max_reached: "Maximum account number (9999999) has been reached",
  network: "Connection failed. Check your internet connection.",
  server: "An unexpected error occurred. Please try again.",
  timeout: "Request timed out. Please try again.",
};

export function AccountForm({
  open,
  onClose,
  onSuccess,
  defaultAccountNumber,
}: AccountFormProps): React.ReactNode {
  const [accountNumber, setAccountNumber] = React.useState("");
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [telephone, setTelephone] = React.useState("");
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  const accountNumberRef = React.useRef<HTMLInputElement>(null);

  // Reset form state when dialog opens
  React.useEffect(() => {
    if (open) {
      const defaultValue =
        defaultAccountNumber !== null
          ? formatShopUid(defaultAccountNumber)
          : "";
      setAccountNumber(defaultValue);
      setName("");
      setAddress("");
      setTelephone("");
      setErrors({});
      setSubmitting(false);

      // Focus first input within 100ms
      const timer = setTimeout(() => {
        accountNumberRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, defaultAccountNumber]);

  function handleAccountNumberBlur(): void {
    const parsed = parseInt(accountNumber, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 9999999) {
      setAccountNumber(formatShopUid(parsed));
    }
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    // Parse account number from string to integer
    const parsedAccountNumber = parseInt(accountNumber, 10);

    // Validate with Zod schema
    const result = accountFormSchema.safeParse({
      accountNumber: isNaN(parsedAccountNumber)
        ? undefined
        : parsedAccountNumber,
      name,
      address,
      telephone,
    });

    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FormErrors;
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      // If accountNumber field has issues due to NaN/undefined, provide a clear message
      if (!fieldErrors.accountNumber && isNaN(parsedAccountNumber)) {
        fieldErrors.accountNumber = "Account number is required";
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    const apiResult = await createAccount({
      accountNumber: result.data.accountNumber,
      name: result.data.name,
      address: result.data.address,
      telephone: result.data.telephone,
    });

    if (apiResult.success) {
      onSuccess();
    } else {
      setSubmitting(false);
      setErrors({
        general: ERROR_MESSAGES[apiResult.error] ?? ERROR_MESSAGES.server,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent aria-describedby="account-form-description">
        <DialogHeader>
          <DialogTitle>Add Account</DialogTitle>
          <DialogDescription id="account-form-description">
            Create a new consigner account.
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
              <Label htmlFor="account-number">Account Number</Label>
              <Input
                ref={accountNumberRef}
                id="account-number"
                name="accountNumber"
                type="text"
                inputMode="numeric"
                maxLength={7}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                onBlur={handleAccountNumberBlur}
                aria-invalid={errors.accountNumber ? true : undefined}
                aria-describedby={
                  errors.accountNumber ? "account-number-error" : undefined
                }
                disabled={submitting}
              />
              {errors.accountNumber && (
                <p
                  id="account-number-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.accountNumber}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="name">
                Name <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "name-error" : undefined}
                aria-required="true"
                disabled={submitting}
              />
              {errors.name && (
                <p
                  id="name-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.name}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                name="address"
                type="text"
                maxLength={500}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                aria-invalid={errors.address ? true : undefined}
                aria-describedby={errors.address ? "address-error" : undefined}
                disabled={submitting}
              />
              {errors.address && (
                <p
                  id="address-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.address}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="telephone">Telephone</Label>
              <Input
                id="telephone"
                name="telephone"
                type="text"
                maxLength={30}
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                aria-invalid={errors.telephone ? true : undefined}
                aria-describedby={
                  errors.telephone ? "telephone-error" : undefined
                }
                disabled={submitting}
              />
              {errors.telephone && (
                <p
                  id="telephone-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.telephone}
                </p>
              )}
            </div>

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
                {submitting ? "Creating…" : "Create Account"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
