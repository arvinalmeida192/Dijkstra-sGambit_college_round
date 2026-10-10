import { z } from 'zod'
import { badRequest } from '../../utils/errors.js'

const uuid = z.string().uuid()

const txHash = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'txHash must be a 0x-prefixed 32-byte hex string.')

export const reportPaymentSchema = z
  .object({
    txHash,
  })
  .strict()

export function assertUuid(value, label = 'id') {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) {
    throw badRequest(`Invalid ${label}.`)
  }
  return parsed.data
}

export function parseBody(schema, body) {
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success) {
    throw badRequest('Invalid request body.', parsed.error.issues)
  }
  return parsed.data
}
