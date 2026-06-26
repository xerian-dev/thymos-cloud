import type { ReactNode } from "react"
import { Check, X } from "lucide-react"
import { validatePassword } from "./password-validation"

export interface PasswordStrengthIndicatorProps {
  password: string
}

export function PasswordStrengthIndicator({
  password,
}: PasswordStrengthIndicatorProps): ReactNode {
  const { rules } = validatePassword(password)

  return (
    <ul className="space-y-1 text-sm" aria-label="Password requirements">
      {rules.map((rule) => (
        <li key={rule.id} className="flex items-center gap-2">
          {rule.satisfied ? (
            <Check
              className="h-4 w-4 shrink-0 text-green-600"
              aria-hidden="true"
            />
          ) : (
            <X
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <span
            className={
              rule.satisfied ? "text-green-600" : "text-muted-foreground"
            }
          >
            {rule.label}
          </span>
        </li>
      ))}
    </ul>
  )
}
