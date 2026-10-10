import type { UserRole } from '../roles'

/**
 * Auth API client boundary for Phase 06.
 * Real auth lives in Phase 07 — until then this module refuses to fabricate success.
 */

export type AuthUser = {
  id: string
  name: string
  email: string
  role: UserRole
}

export type LoginRequest = {
  email: string
  password: string
}

export type RegisterRequest = {
  name: string
  email: string
  password: string
  role: UserRole
}

export type AuthSession = {
  token: string
  user: AuthUser
}

export class AuthApiError extends Error {
  readonly code: string
  readonly status?: number

  constructor(message: string, code: string, status?: number) {
    super(message)
    this.name = 'AuthApiError'
    this.code = code
    this.status = status
  }
}

function apiBaseUrl(): string | undefined {
  const value = import.meta.env.VITE_API_BASE_URL
  if (typeof value !== 'string' || !value.trim()) return undefined
  return value.replace(/\/$/, '')
}

async function parseError(response: Response): Promise<AuthApiError> {
  try {
    const body = (await response.json()) as { message?: string; error?: string }
    const message =
      body.message ?? body.error ?? `Request failed (${response.status}).`
    return new AuthApiError(message, 'HTTP_ERROR', response.status)
  } catch {
    return new AuthApiError(
      `Request failed (${response.status}).`,
      'HTTP_ERROR',
      response.status,
    )
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const base = apiBaseUrl()
  if (!base) {
    throw new AuthApiError(
      'Auth API is not configured yet (VITE_API_BASE_URL missing). Backend authentication arrives in Phase 07 — this is not a successful login.',
      'API_UNAVAILABLE',
    )
  }

  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new AuthApiError(
      'Could not reach the auth API. Check that the backend is running.',
      'NETWORK_ERROR',
    )
  }

  if (!response.ok) {
    throw await parseError(response)
  }

  return (await response.json()) as T
}

/** POST /api/v1/auth/login — requires backend (Phase 07). */
export function login(input: LoginRequest): Promise<AuthSession> {
  return postJson<AuthSession>('/api/v1/auth/login', input)
}

/** POST /api/v1/auth/register — requires backend (Phase 07). */
export function register(input: RegisterRequest): Promise<AuthSession> {
  return postJson<AuthSession>('/api/v1/auth/register', input)
}

export function isAuthApiConfigured(): boolean {
  return Boolean(apiBaseUrl())
}
