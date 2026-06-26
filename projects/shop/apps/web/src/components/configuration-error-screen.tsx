/**
 * Configuration error screen displayed when Amplify/Cognito
 * configuration is missing or invalid. Prevents any auth operations
 * from being attempted.
 */

interface ConfigurationErrorScreenProps {
  message: string
}

export function ConfigurationErrorScreen({
  message,
}: ConfigurationErrorScreenProps): React.ReactNode {
  return (
    <div
      className="flex min-h-svh items-center justify-center p-6"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="rounded-full bg-destructive/10 p-3 text-destructive">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-foreground">
          Configuration Error
        </h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
