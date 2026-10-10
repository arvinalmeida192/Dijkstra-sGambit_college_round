import { z } from 'zod'
import { badRequest } from '../../utils/errors.js'

function isValidDateString(val) {
  if (!val || typeof val !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(val)) return false
  const [y, m, d] = val.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

const milestoneTermsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Milestone title must be at least 2 characters.')
    .max(200),
  description: z.string().trim().max(5000).optional(),
  deliverables: z
    .string()
    .trim()
    .min(1, 'Deliverables are required.')
    .max(5000)
    .optional(),
  deliverable: z.string().trim().max(5000).optional(),
  acceptanceCriteria: z
    .string()
    .trim()
    .max(5000)
    .optional(),
  /** Integer token base units / cents — never floats. Positive payment amount. */
  amount: z
    .number({ required_error: 'Milestone amount is required.' })
    .int('Milestone amount must be an integer in cents.')
    .positive('Milestone payment amount must be greater than zero.'),
  dueDate: z
    .string({ required_error: 'Milestone dueDate is required.' })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD.')
    .refine(isValidDateString, 'dueDate must be a valid calendar date.'),
  reviewWindowDays: z
    .number()
    .int()
    .positive('reviewWindowDays must be a positive integer.')
    .max(365)
    .optional(),
})

export const agreementTermsSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, 'Agreement title must be at least 2 characters.')
      .max(200)
      .optional(),
    summary: z.string().trim().max(5000).optional(),
    scope: z.string().trim().max(5000).optional(),
    description: z.string().trim().max(5000).optional(),
    finalDeliverable: z.string().trim().max(5000).optional(),
    completionCriteria: z.string().trim().max(5000).optional(),
    totalPayment: z
      .number()
      .int('Total payment must be an integer in cents.')
      .positive('Total agreed payment must be greater than zero.')
      .optional(),
    finalDueDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'finalDueDate must be YYYY-MM-DD.')
      .refine(isValidDateString, 'finalDueDate must be a valid calendar date.')
      .optional(),
    milestones: z
      .array(milestoneTermsSchema)
      .min(1, 'At least one milestone is required.')
      .max(50),
    notes: z.string().trim().max(5000).optional().default(''),
  })
  .superRefine((data, ctx) => {
    // 1. Overall Agreement Title / Summary requirement
    const effectiveTitle = data.title || data.summary
    if (!effectiveTitle || effectiveTitle.trim().length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['summary'],
        message:
          'Agreement title or summary is required (at least 2 characters).',
      })
    }

    if (!data.milestones || data.milestones.length === 0) {
      return
    }

    // Validate deliverables on each milestone (either deliverables, deliverable, or description)
    data.milestones.forEach((m, idx) => {
      const hasDeliverable =
        (m.deliverables && m.deliverables.trim().length > 0) ||
        (m.deliverable && m.deliverable.trim().length > 0) ||
        (m.description && m.description.trim().length > 0)
      if (!hasDeliverable) {
        ctx.addIssue({
          code: 'custom',
          path: ['milestones', idx, 'deliverables'],
          message: 'Milestone deliverable or description is required.',
        })
      }
    })

    // 2. Sum of all milestone payments vs totalPayment
    const totalAllocated = data.milestones.reduce(
      (acc, m) => acc + (typeof m.amount === 'number' ? m.amount : 0),
      0,
    )

    if (data.totalPayment != null) {
      if (totalAllocated > data.totalPayment) {
        ctx.addIssue({
          code: 'custom',
          path: ['totalPayment'],
          message: `Milestone payment allocations (${totalAllocated}) cannot exceed the total agreed payment (${data.totalPayment}).`,
        })
      } else if (totalAllocated !== data.totalPayment) {
        ctx.addIssue({
          code: 'custom',
          path: ['totalPayment'],
          message: `The sum of all milestone payments (${totalAllocated}) must equal the total agreed payment (${data.totalPayment}).`,
        })
      }
    }

    // 3. Chronological milestone dates
    for (let i = 0; i < data.milestones.length; i++) {
      const curDue = data.milestones[i].dueDate
      if (i > 0) {
        const prevDue = data.milestones[i - 1].dueDate
        if (curDue && prevDue && curDue < prevDue) {
          ctx.addIssue({
            code: 'custom',
            path: ['milestones', i, 'dueDate'],
            message: `Milestone ${i + 1} due date (${curDue}) cannot be earlier than milestone ${i} due date (${prevDue}).`,
          })
        }
      }
    }

    // 4. Final project due date must be on or after the last milestone's due date
    if (data.finalDueDate != null && data.milestones.length > 0) {
      const lastMilestone = data.milestones[data.milestones.length - 1]
      if (lastMilestone?.dueDate && data.finalDueDate < lastMilestone.dueDate) {
        ctx.addIssue({
          code: 'custom',
          path: ['finalDueDate'],
          message: `Final project due date (${data.finalDueDate}) must be on or after the last milestone's due date (${lastMilestone.dueDate}).`,
        })
      }
    }
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
