import { Amplify } from "aws-amplify"
import { RouterProvider } from "react-router"
import { getAmplifyConfig } from "@/config/amplify-config"
import { router } from "@/config/routes"
import { ErrorBoundary } from "@/components/error-boundary"
import { ConfigurationErrorScreen } from "@/components/configuration-error-screen"
import { AuthProvider } from "@/providers/auth-provider"

const configResult = getAmplifyConfig()

if (configResult.success) {
  Amplify.configure({
    Auth: configResult.config,
  })
}

/**
 * Root application component.
 * Validates Amplify configuration, initializes the SDK, and renders
 * the router wrapped in AuthProvider and a top-level ErrorBoundary.
 */
export function App(): React.ReactNode {
  if (!configResult.success) {
    return (
      <ErrorBoundary>
        <ConfigurationErrorScreen message={configResult.error} />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ErrorBoundary>
  )
}
