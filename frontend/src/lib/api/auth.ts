import type { UserRole } from '../roles'
import { ApiError, apiRequest, isApiConfigured } from './client'

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

/** @deprecated Prefer ApiError — kept for existing auth form imports. */
export class AuthApiError extends ApiError {
  constructor(message: string, code: string, status?: number) {
    super(message, code, status)
    this.name = 'AuthApiError'
  }
}

function asAuthError(err: unknown): never {
  if (err instanceof ApiError) {
    throw new AuthApiError(err.message, err.code, err.status)
  }
  throw err
}

/** POST /api/v1/auth/login */
export async function login(input: LoginRequest): Promise<AuthSession> {
  try {
    return await apiRequest<AuthSession>('/api/v1/auth/login', {
      method: 'POST',
      body: input,
    })
  } catch (err) {
    asAuthError(err)
  }
}

/** POST /api/v1/auth/register */
export async function register(input: RegisterRequest): Promise<AuthSession> {
  try {
    return await apiRequest<AuthSession>('/api/v1/auth/register', {
      method: 'POST',
      body: input,
    })
  } catch (err) {
    asAuthError(err)
  }
}

/** GET /api/v1/auth/me */
export async function fetchMe(token: string): Promise<{ user: AuthUser }> {
  try {
    return await apiRequest<{ user: AuthUser }>('/api/v1/auth/me', {
      method: 'GET',
      token,
    })
  } catch (err) {
    asAuthError(err)
  }
}

export function isAuthApiConfigured(): boolean {
  return isApiConfigured()
}
