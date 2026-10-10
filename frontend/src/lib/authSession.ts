import type { AuthSession, AuthUser } from './api/auth'

const STORAGE_KEY = 'fairwork.auth.session'

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuthSession>
    if (
      typeof parsed.token !== 'string' ||
      !parsed.token ||
      !parsed.user ||
      typeof parsed.user !== 'object'
    ) {
      return null
    }
    const user = parsed.user as AuthUser
    if (!user.id || !user.email || !user.role) return null
    return { token: parsed.token, user }
  } catch {
    return null
  }
}

export function saveSession(session: AuthSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY)
}
