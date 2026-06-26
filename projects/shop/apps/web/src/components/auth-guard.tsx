import type { ReactNode } from "react"
import { Navigate, Outlet } from "react-router"
import { useAuth } from "@/providers/auth-provider"

export function AuthGuard(): ReactNode {
  const { state } = useAuth()

  if (state.status === "loading") {
    return (
      <div
        role="status"
        aria-label="Loading"
        className="flex h-screen items-center justify-center"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    )
  }

  if (state.status === "unauthenticated" || state.status === "error") {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
