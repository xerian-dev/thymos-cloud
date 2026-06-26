export interface PasswordRule {
  id: string
  label: string
  test: (password: string) => boolean
}

export interface PasswordValidationResult {
  rules: Array<{ id: string; label: string; satisfied: boolean }>
  allSatisfied: boolean
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: "min-length",
    label: "At least 8 characters",
    test: (p) => p.length >= 8,
  },
  {
    id: "uppercase",
    label: "At least one uppercase letter",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: "lowercase",
    label: "At least one lowercase letter",
    test: (p) => /[a-z]/.test(p),
  },
  { id: "digit", label: "At least one digit", test: (p) => /\d/.test(p) },
  {
    id: "special",
    label: "At least one special character",
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
] as const

export function validatePassword(password: string): PasswordValidationResult {
  const rules = PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    satisfied: rule.test(password),
  }))
  return { rules, allSatisfied: rules.every((r) => r.satisfied) }
}
