import * as React from "react"
import { useNavigate } from "react-router"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { useAuth } from "@/providers/auth-provider"

export interface LoginFormErrors {
  email?: string
  password?: string
  general?: string
}

const EMAIL_MAX_LENGTH = 254
const PASSWORD_MAX_LENGTH = 128

function validateFields(
  email: string,
  password: string
): LoginFormErrors | null {
  const errors: LoginFormErrors = {}

  if (email.trim().length === 0) {
    errors.email = "Email is required"
  }

  if (password.trim().length === 0) {
    errors.password = "Password is required"
  }

  if (errors.email || errors.password) {
    return errors
  }

  return null
}

export function LoginScreen(): React.ReactNode {
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [errors, setErrors] = React.useState<LoginFormErrors>({})
  const [submitting, setSubmitting] = React.useState(false)

  const { state, signIn } = useAuth()
  const navigate = useNavigate()

  // React to auth state changes after submission
  React.useEffect(() => {
    if (!submitting) return

    if (state.status === "authenticated") {
      setSubmitting(false)
      navigate("/inventory", { replace: true })
    }

    if (state.status === "error" && state.error) {
      setErrors({ general: state.error })
      setPassword("")
      setSubmitting(false)
    }
  }, [state.status, state.error, submitting, navigate])

  const isLoading = submitting && state.status === "loading"

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    const validationErrors = validateFields(email, password)
    if (validationErrors) {
      setErrors(validationErrors)
      return
    }

    setErrors({})
    setSubmitting(true)
    void signIn(email, password)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-4">
              {errors.general && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.general}
                </p>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={EMAIL_MAX_LENGTH}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  disabled={isLoading}
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
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={PASSWORD_MAX_LENGTH}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={
                    errors.password ? "password-error" : undefined
                  }
                  disabled={isLoading}
                />
                {errors.password && (
                  <p
                    id="password-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {errors.password}
                  </p>
                )}
              </div>

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? "Signing in…" : "Sign in"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
