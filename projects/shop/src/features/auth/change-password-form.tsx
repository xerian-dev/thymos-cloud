import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordStrengthIndicator } from "./password-strength-indicator";
import { validatePassword } from "./password-validation";

export interface ChangePasswordFormProps {
  onSubmit: (newPassword: string) => void;
  isLoading: boolean;
  error: string | null;
}

interface FormErrors {
  newPassword?: string;
  confirmPassword?: string;
}

const PASSWORD_MAX_LENGTH = 128;

export function ChangePasswordForm({
  onSubmit,
  isLoading,
  error,
}: ChangePasswordFormProps): React.ReactNode {
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [formErrors, setFormErrors] = React.useState<FormErrors>({});

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const errors: FormErrors = {};

    const validation = validatePassword(newPassword);
    if (!validation.allSatisfied) {
      errors.newPassword = "Password does not meet all requirements";
    }

    if (newPassword !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    if (errors.newPassword || errors.confirmPassword) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    onSubmit(newPassword);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            aria-invalid={formErrors.newPassword ? true : undefined}
            aria-describedby={
              formErrors.newPassword ? "new-password-error" : undefined
            }
            disabled={isLoading}
          />
          {formErrors.newPassword && (
            <p
              id="new-password-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {formErrors.newPassword}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <Input
            id="confirm-password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={formErrors.confirmPassword ? true : undefined}
            aria-describedby={
              formErrors.confirmPassword ? "confirm-password-error" : undefined
            }
            disabled={isLoading}
          />
          {formErrors.confirmPassword && (
            <p
              id="confirm-password-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {formErrors.confirmPassword}
            </p>
          )}
        </div>

        <PasswordStrengthIndicator password={newPassword} />

        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading ? "Changing password…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
