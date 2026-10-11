import { z } from 'zod'
import { badRequest } from '../../utils/errors.js'

const optionalHttpUrl = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined
  return value
}, z.string().trim().url('Enter a valid http(s) URL.').optional())

export const createProjectSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters.').max(200),
  description: z
    .string()
    .trim()
    .max(5000, 'Description is too long.')
    .optional()
    .default(''),
  externalUrl: optionalHttpUrl,
})

export const createInvitationSchema = z.object({
  email: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined
    return String(value).trim().toLowerCase()
  }, z.string().email('Enter a valid email address.').optional()),
  message: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined
    return String(value).trim()
  }, z.string().max(1000, 'Invitation message is too long.').optional()),
})

export const listProjectsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export function parseBody(schema, body) {
  const result = schema.safeParse(body ?? {})
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))
    throw badRequest('Invalid request body.', details)
  }
  return result.data
}

export function parseQuery(schema, query) {
  const result = schema.safeParse(query ?? {})
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))
    throw badRequest('Invalid query parameters.', details)
  }
  return result.data
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function assertUuid(value, label = 'id') {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw badRequest(`Invalid ${label}.`)
  }
  return value
}
