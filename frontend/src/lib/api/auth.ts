import type { UserRole } from '../roles'

/**
 * Auth API client — talks to Phase 07 backend endpoints.
 */

export type AuthUser = {
  id: string
  name: string
  email: string
  role: UserRole
  walletAddress?: string | null
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
    const body = (await response.json()) as {
      message?: string
      error?: string
    }
    const message =
      body.message ?? body.error ?? `Request failed (${response.status}).`
    const code = body.error ?? 'HTTP_ERROR'
    return new AuthApiError(message, code, response.status)
  } catch {
    return new AuthApiError(
      `Request failed (${response.status}).`,
      'HTTP_ERROR',
      response.status,
    )
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const base = apiBaseUrl()
  if (!base) {
    throw new AuthApiError(
      'Auth API is not configured (VITE_API_BASE_URL missing). Start the backend and set the frontend env.',
      'API_UNAVAILABLE',
    )
  }

  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
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

/** POST /api/v1/auth/login */
export function login(input: LoginRequest): Promise<AuthSession> {
  return requestJson<AuthSession>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** POST /api/v1/auth/register */
export function register(input: RegisterRequest): Promise<AuthSession> {
  return requestJson<AuthSession>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** GET /api/v1/auth/me */
export function fetchMe(token: string): Promise<{ user: AuthUser }> {
  return requestJson<{ user: AuthUser }>('/api/v1/auth/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function isAuthApiConfigured(): boolean {
  return Boolean(apiBaseUrl())
}
