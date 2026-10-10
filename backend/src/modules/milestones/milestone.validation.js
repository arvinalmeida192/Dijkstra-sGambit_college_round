import { z } from 'zod'
import { badRequest } from '../../utils/errors.js'
import { MILESTONE_STATUSES } from './milestone.transitions.js'

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD.')

export const createMilestoneSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Title must be at least 2 characters.')
    .max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  deliverables: z
    .string()
    .trim()
    .min(1, 'Deliverables are required.')
    .max(5000),
  acceptanceCriteria: z
    .string()
    .trim()
    .min(1, 'Acceptance criteria are required.')
    .max(5000),
  amount: z.number().int().nonnegative(),
  dueDate: dateOnly.optional().nullable(),
  reviewWindowDays: z
    .number()
    .int()
    .positive()
    .max(365)
    .optional()
    .nullable(),
  agreementId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().nonnegative().optional(),
})

export const updateMilestoneSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, 'Title must be at least 2 characters.')
      .max(200)
      .optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    deliverables: z
      .string()
      .trim()
      .min(1, 'Deliverables are required.')
      .max(5000)
      .optional(),
    acceptanceCriteria: z
      .string()
      .trim()
      .min(1, 'Acceptance criteria are required.')
      .max(5000)
      .optional(),
    amount: z.number().int().nonnegative().optional(),
    dueDate: dateOnly.optional().nullable(),
    reviewWindowDays: z
      .number()
      .int()
      .positive()
      .max(365)
      .optional()
      .nullable(),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.',
  })

export const updateStatusSchema = z.object({
  status: z.enum(MILESTONE_STATUSES),
  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function assertUuid(value, label = 'id') {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw badRequest(`Invalid ${label}.`)
  }
  return value
}
