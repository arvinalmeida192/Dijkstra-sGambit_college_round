import { z } from 'zod'
import { badRequest } from '../../utils/errors.js'

const uuid = z.string().uuid()

const httpUrl = z
  .string()
  .trim()
  .url('externalUrl must be a valid URL.')
  .max(2000)
  .refine((value) => /^https?:\/\//i.test(value), {
    message: 'externalUrl must start with http:// or https://.',
  })

export const openDisputeSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(3, 'Reason must be at least 3 characters.')
      .max(2000),
    claimSummary: z.string().trim().max(5000).optional().nullable(),
    /** Optional verified payment row for an on-chain DisputeOpened event. */
    openPaymentId: uuid.optional().nullable(),
  })
  .strict()

export const evidenceSchema = z
  .object({
    notes: z.string().trim().max(5000).optional().nullable(),
    externalUrl: httpUrl.optional().nullable(),
  })
  .strict()

export const decisionSchema = z
  .object({
    decision: z.enum([
      'RELEASE_TO_FREELANCER',
      'REFUND_TO_CLIENT',
      'SPLIT',
    ]),
    rationale: z
      .string()
      .trim()
      .min(1, 'Rationale is required.')
      .max(5000),
    /** App cents released to freelancer when decision is SPLIT. */
    splitReleaseToFreelancer: z.number().int().nonnegative().optional(),
    /** Optional verified payment row for on-chain resolve / release / refund. */
    resolvePaymentId: uuid.optional().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === 'SPLIT' && value.splitReleaseToFreelancer == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['splitReleaseToFreelancer'],
        message: 'splitReleaseToFreelancer is required for SPLIT decisions.',
      })
    }
  })

export function assertUuid(value, label = 'id') {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw badRequest(`Invalid ${label}.`)
  return parsed.data
}

export function parseBody(schema, body) {
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success) {
    throw badRequest('Invalid request body.', parsed.error.issues)
  }
  return parsed.data
}
