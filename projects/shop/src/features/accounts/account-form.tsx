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
  street?: string;
  place?: string;
  postcode?: string;
  canton?: string;
  email?: string;
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
  const [street, setStreet] = React.useState("");
  const [place, setPlace] = React.useState("");
  const [postcode, setPostcode] = React.useState("");
  const [canton, setCanton] = React.useState("");
  const [email, setEmail] = React.useState("");
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
      setStreet("");
      setPlace("");
      setPostcode("");
      setCanton("");
      setEmail("");
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
      street,
      place,
      postcode,
      canton,
      email,
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
      street: result.data.street,
      place: result.data.place,
      postcode: result.data.postcode,
      canton: result.data.canton,
      email: result.data.email,
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
              <Label htmlFor="street">Street</Label>
              <Input
                id="street"
                name="street"
                type="text"
                maxLength={200}
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                aria-invalid={errors.street ? true : undefined}
                aria-describedby={errors.street ? "street-error" : undefined}
                disabled={submitting}
              />
              {errors.street && (
                <p
                  id="street-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.street}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="place">Place</Label>
              <Input
                id="place"
                name="place"
                type="text"
                maxLength={100}
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                aria-invalid={errors.place ? true : undefined}
                aria-describedby={errors.place ? "place-error" : undefined}
                disabled={submitting}
              />
              {errors.place && (
                <p
                  id="place-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.place}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="postcode">Postcode</Label>
              <Input
                id="postcode"
                name="postcode"
                type="text"
                maxLength={20}
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                aria-invalid={errors.postcode ? true : undefined}
                aria-describedby={
                  errors.postcode ? "postcode-error" : undefined
                }
                disabled={submitting}
              />
              {errors.postcode && (
                <p
                  id="postcode-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.postcode}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="canton">Canton</Label>
              <Input
                id="canton"
                name="canton"
                type="text"
                maxLength={50}
                value={canton}
                onChange={(e) => setCanton(e.target.value)}
                aria-invalid={errors.canton ? true : undefined}
                aria-describedby={errors.canton ? "canton-error" : undefined}
                disabled={submitting}
              />
              {errors.canton && (
                <p
                  id="canton-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.canton}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="text"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? "email-error" : undefined}
                disabled={submitting}
              />
              {errors.email && (
                <p
                  id="email-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.email}
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
