import { z } from 'zod'
import { badRequest } from '../../utils/errors.js'

const uuid = z.string().uuid()

export const assessSubmissionSchema = z
  .object({
    deliverableType: z.enum(['CODE', 'TEXT', 'VISUAL']).optional(),
    /** Force dual-model compare for TEXT/VISUAL when two models are configured. */
    compare: z.boolean().optional(),
  })
  .strict()

export const benchmarkSchema = z
  .object({
    deliverableType: z.enum(['CODE', 'TEXT', 'VISUAL']),
    /** Fixture prompts — never used to claim a preferred model without review. */
    fixtures: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(100),
          prompt: z.string().trim().min(1).max(20_000),
          expectedStatuses: z
            .array(z.enum(['MET', 'PARTIAL', 'MISSING', 'UNVERIFIED']))
            .optional(),
        }),
      )
      .min(1)
      .max(10),
  })
  .strict()

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

export function assertUuid(value, label = 'id') {
  const result = uuid.safeParse(value)
  if (!result.success) throw badRequest(`Invalid ${label}.`)
  return result.data
}
