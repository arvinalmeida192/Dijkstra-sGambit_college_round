import { z } from 'zod'
import { badRequest } from '../../utils/errors.js'

const uuid = z.string().uuid()

const httpUrl = z
  .string()
  .trim()
  .url('externalUrl must be a valid URL.')
  .max(2000)
  .refine(
    (value) => /^https?:\/\//i.test(value),
    'externalUrl must use http or https.',
  )

export const REVIEW_DECISIONS = [
  'START_REVIEW',
  'APPROVED',
  'REVISION_REQUESTED',
]

export const createSubmissionSchema = z
  .object({
    notes: z.string().trim().max(5000).optional().nullable(),
    externalUrl: httpUrl.optional().nullable(),
    agreementId: uuid.optional().nullable(),
    // Client-supplied hashes are ignored — documented so callers know not to send them.
    sha256Hash: z.any().optional(),
  })
  .strict()

export const reviewSubmissionSchema = z
  .object({
    decision: z.enum(REVIEW_DECISIONS),
    feedback: z.string().trim().max(5000).optional().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.decision === 'REVISION_REQUESTED' &&
      (!value.feedback || value.feedback.length === 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['feedback'],
        message: 'feedback is required when requesting a revision.',
      })
    }
  })

export function parseBody(schema, body) {
  const result = schema.safeParse(body ?? {})
  if (!result.success) {
    throw badRequest('Invalid request body.', result.error.issues)
  }
  return result.data
}

export function assertUuid(value, label = 'id') {
  const result = uuid.safeParse(value)
  if (!result.success) {
    throw badRequest(`Invalid ${label}.`)
  }
  return result.data
}
