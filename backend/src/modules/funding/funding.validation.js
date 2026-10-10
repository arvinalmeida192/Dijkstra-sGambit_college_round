import { z } from 'zod'
import { badRequest } from '../../utils/errors.js'

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function assertUuid(value, label = 'id') {
  if (typeof value !== 'string' || !uuidRegex.test(value)) {
    throw badRequest(`Invalid ${label}.`)
  }
  return value
}

export const createOrderSchema = z
  .object({
    currency: z.string().trim().default('INR').optional(),
  })
  .strict()

export const verifyPaymentSchema = z
  .object({
    orderId: z.string().trim().min(1, 'orderId is required.'),
    paymentId: z.string().trim().min(1, 'paymentId is required.'),
    signature: z.string().trim().min(1, 'signature is required.'),
  })
  .strict()

export const releaseMilestoneSchema = z
  .object({
    notes: z.string().trim().max(1000).optional(),
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

