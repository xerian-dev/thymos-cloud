import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  fetchAuthSession,
  getCurrentUser,
} from "aws-amplify/auth"

export interface AuthUser {
  email: string
  name?: string
  groups: string[]
}

export interface AuthState {
  status: "loading" | "authenticated" | "unauthenticated" | "error"
  user: AuthUser | null
  error: string | null
}

export interface AuthContextValue {
  state: AuthState
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Check every 4 minutes — Amplify refreshes tokens at 5 min before expiry */
const TOKEN_REFRESH_INTERVAL_MS = 4 * 60 * 1000

function parseUserFromIdToken(idToken: {
  payload: Record<string, unknown>
}): AuthUser {
  const payload = idToken.payload
  const email = (payload["email"] as string) ?? ""
  const name = payload["name"] as string | undefined
  const groups = (payload["cognito:groups"] as string[] | undefined) ?? []

  return {
    email,
    name: name || undefined,
    groups,
  }
}

export function mapAuthError(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name

    if (name === "NotAuthorizedException" || name === "UserNotFoundException") {
      return "Incorrect email or password"
    }

    if (name === "NetworkError" || error.message.includes("network")) {
      return "Unable to connect. Check your internet connection."
    }

    if (
      name === "ServiceUnavailableException" ||
      name === "InternalErrorException" ||
      name === "TooManyRequestsException"
    ) {
      return "Service temporarily unavailable. Please try again."
    }
  }

  return "Something went wrong. Please try again."
}

interface AuthProviderProps {
  children: ReactNode
  onSessionExpired?: () => void
}

export function AuthProvider({
  children,
  onSessionExpired,
}: AuthProviderProps): ReactNode {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    error: null,
  })

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onSessionExpiredRef = useRef(onSessionExpired)
  onSessionExpiredRef.current = onSessionExpired

  const clearRefreshTimer = useCallback((): void => {
    if (refreshTimerRef.current !== null) {
      clearInterval(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
  }, [])

  const startRefreshTimer = useCallback((): void => {
    clearRefreshTimer()
    refreshTimerRef.current = setInterval(() => {
      void (async () => {
        try {
          const session = await fetchAuthSession({ forceRefresh: true })
          const idToken = session.tokens?.idToken

          if (!idToken) {
            clearRefreshTimer()
            setState({
              status: "unauthenticated",
              user: null,
              error: null,
            })
            onSessionExpiredRef.current?.()
            return
          }

          const user = parseUserFromIdToken(idToken)
          setState({
            status: "authenticated",
            user,
            error: null,
          })
        } catch {
          clearRefreshTimer()
          setState({
            status: "unauthenticated",
            user: null,
            error: null,
          })
          onSessionExpiredRef.current?.()
        }
      })()
    }, TOKEN_REFRESH_INTERVAL_MS)
  }, [clearRefreshTimer])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        await getCurrentUser()
        const session = await fetchAuthSession()
        const idToken = session.tokens?.idToken

        if (cancelled) return

        if (!idToken) {
          setState({
            status: "unauthenticated",
            user: null,
            error: null,
          })
          return
        }

        const user = parseUserFromIdToken(idToken)
        setState({
          status: "authenticated",
          user,
          error: null,
        })
        startRefreshTimer()
      } catch {
        if (cancelled) return
        setState({
          status: "unauthenticated",
          user: null,
          error: null,
        })
      }
    })()

    return () => {
      cancelled = true
      clearRefreshTimer()
    }
  }, [startRefreshTimer, clearRefreshTimer])

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      setState((prev) => ({
        ...prev,
        status: "loading",
        error: null,
      }))

      try {
        await amplifySignIn({
          username: email,
          password,
          options: {
            authFlowType: "USER_SRP_AUTH",
          },
        })

        const session = await fetchAuthSession()
        const idToken = session.tokens?.idToken

        if (!idToken) {
          setState({
            status: "error",
            user: null,
            error: "Something went wrong. Please try again.",
          })
          return
        }

        const user = parseUserFromIdToken(idToken)
        setState({
          status: "authenticated",
          user,
          error: null,
        })
        startRefreshTimer()
      } catch (error: unknown) {
        const message = mapAuthError(error)
        setState({
          status: "error",
          user: null,
          error: message,
        })
      }
    },
    [startRefreshTimer]
  )

  const signOut = useCallback(async (): Promise<void> => {
    clearRefreshTimer()

    try {
      await amplifySignOut()
    } catch {
      // Requirement 8.7: If logout fails, still clear local state and redirect
    }

    setState({
      status: "unauthenticated",
      user: null,
      error: null,
    })
  }, [clearRefreshTimer])

  const contextValue: AuthContextValue = {
    state,
    signIn,
    signOut,
  }

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
