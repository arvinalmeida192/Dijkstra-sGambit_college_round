import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchMe,
  login as apiLogin,
  register as apiRegister,
  type AuthSession,
  type AuthUser,
  type LoginRequest,
  type RegisterRequest,
} from '../lib/api/auth'
import {
  clearSession,
  loadSession,
  saveSession,
} from '../lib/authSession'

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  token: string | null
  login: (input: LoginRequest) => Promise<AuthSession>
  register: (input: RegisterRequest) => Promise<AuthSession>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [session, setSession] = useState<AuthSession | null>(null)

  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      const stored = loadSession()
      if (!stored) {
        if (!cancelled) {
          setSession(null)
          setStatus('anonymous')
        }
        return
      }

      try {
        const { user } = await fetchMe(stored.token)
        if (cancelled) return
        const next = { token: stored.token, user }
        saveSession(next)
        setSession(next)
        setStatus('authenticated')
      } catch {
        if (cancelled) return
        // Invalid token or unreachable API — clear and require a fresh login.
        clearSession()
        setSession(null)
        setStatus('anonymous')
      }
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [])

  const applySession = useCallback((next: AuthSession) => {
    saveSession(next)
    setSession(next)
    setStatus('authenticated')
  }, [])

  const login = useCallback(
    async (input: LoginRequest) => {
      const next = await apiLogin(input)
      applySession(next)
      return next
    },
    [applySession],
  )

  const register = useCallback(
    async (input: RegisterRequest) => {
      const next = await apiRegister(input)
      applySession(next)
      return next
    },
    [applySession],
  )

  const logout = useCallback(() => {
    clearSession()
    setSession(null)
    setStatus('anonymous')
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      token: session?.token ?? null,
      login,
      register,
      logout,
    }),
    [status, session, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
