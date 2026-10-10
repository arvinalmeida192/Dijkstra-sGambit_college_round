import { z } from 'zod'
import { badRequest } from '../../utils/errors.js'

const milestoneTermsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Milestone title must be at least 2 characters.')
    .max(200),
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
  /** Integer token base units / cents — never floats. */
  amount: z.number().int().nonnegative(),
  dueDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD.')
    .optional(),
  reviewWindowDays: z
    .number()
    .int()
    .positive('reviewWindowDays must be a positive integer.')
    .max(365)
    .optional()
    .default(7),
  gracePeriodDays: z
    .number()
    .int()
    .nonnegative('gracePeriodDays must be non-negative.')
    .max(365)
    .optional()
    .default(3),
  maxRevisions: z
    .number()
    .int()
    .positive('maxRevisions must be at least 1.')
    .max(20)
    .optional()
    .default(3),
})

export const agreementTermsSchema = z.object({
  summary: z
    .string()
    .trim()
    .min(1, 'Summary is required.')
    .max(2000),
  milestones: z
    .array(milestoneTermsSchema)
    .min(1, 'At least one milestone is required.')
    .max(50),
  notes: z.string().trim().max(5000).optional().default(''),
})

export const createAgreementSchema = z.object({
  terms: agreementTermsSchema,
})

export const proposeChangeSchema = z.object({
  terms: agreementTermsSchema,
})

export const acceptAgreementSchema = z.object({
  /** Optional; stored for future wallet flows. Does not imply cryptographic proof. */
  signatureRef: z
    .string()
    .trim()
    .max(500)
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
