export class ApiError extends Error {
  readonly code: string
  readonly status?: number

  constructor(message: string, code: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export function getApiBaseUrl(): string | undefined {
  const value = import.meta.env.VITE_API_BASE_URL
  if (typeof value !== 'string' || !value.trim()) return undefined
  return value.replace(/\/$/, '')
}

export function isApiConfigured(): boolean {
  return Boolean(getApiBaseUrl())
}

type RequestOptions = {
  method?: string
  body?: unknown
  token?: string | null
  /** Skip JSON Content-Type when there is no body. */
  headers?: Record<string, string>
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      message?: string
      error?: string
    }
    return new ApiError(
      body.message ?? body.error ?? `Request failed (${response.status}).`,
      body.error ?? 'HTTP_ERROR',
      response.status,
    )
  } catch {
    return new ApiError(
      `Request failed (${response.status}).`,
      'HTTP_ERROR',
      response.status,
    )
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const base = getApiBaseUrl()
  if (!base) {
    throw new ApiError(
      'API is not configured (VITE_API_BASE_URL missing).',
      'API_UNAVAILABLE',
    )
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(
      'Could not reach the API. Check that the backend is running.',
      'NETWORK_ERROR',
    )
  }

  if (!response.ok) {
    throw await parseError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

type FormRequestOptions = {
  method?: string
  formData: FormData
  token?: string | null
}

/** Multipart upload — do not set Content-Type (browser sets boundary). */
export async function apiFormRequest<T>(
  path: string,
  options: FormRequestOptions,
): Promise<T> {
  const base = getApiBaseUrl()
  if (!base) {
    throw new ApiError(
      'API is not configured (VITE_API_BASE_URL missing).',
      'API_UNAVAILABLE',
    )
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      method: options.method ?? 'POST',
      headers,
      body: options.formData,
    })
  } catch {
    throw new ApiError(
      'Could not reach the API. Check that the backend is running.',
      'NETWORK_ERROR',
    )
  }

  if (!response.ok) {
    throw await parseError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

type BlobRequestOptions = {
  method?: string
  token?: string | null
}

/** Authenticated binary download (private evidence files). */
export async function apiBlobRequest(
  path: string,
  options: BlobRequestOptions = {},
): Promise<{ blob: Blob; headers: Headers }> {
  const base = getApiBaseUrl()
  if (!base) {
    throw new ApiError(
      'API is not configured (VITE_API_BASE_URL missing).',
      'API_UNAVAILABLE',
    )
  }

  const headers: Record<string, string> = {
    Accept: '*/*',
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      method: options.method ?? 'GET',
      headers,
    })
  } catch {
    throw new ApiError(
      'Could not reach the API. Check that the backend is running.',
      'NETWORK_ERROR',
    )
  }

  if (!response.ok) {
    throw await parseError(response)
  }

  const blob = await response.blob()
  return { blob, headers: response.headers }
}
