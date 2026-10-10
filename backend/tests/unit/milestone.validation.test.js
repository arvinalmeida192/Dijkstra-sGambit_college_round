import { describe, expect, it } from 'vitest'
import {
  createMilestoneSchema,
  parseBody,
  updateMilestoneSchema,
  updateStatusSchema,
} from '../../src/modules/milestones/milestone.validation.js'

const valid = {
  title: 'Design',
  deliverables: 'Figma file',
  acceptanceCriteria: 'Approved mockups',
  amount: 25000,
  dueDate: '2026-11-15',
  reviewWindowDays: 5,
}

describe('milestone validation', () => {
  it('accepts a valid create body', () => {
    const data = parseBody(createMilestoneSchema, valid)
    expect(data.amount).toBe(25000)
    expect(data.dueDate).toBe('2026-11-15')
  })

  it('rejects float amounts', () => {
    expect(() =>
      parseBody(createMilestoneSchema, { ...valid, amount: 10.5 }),
    ).toThrow()
  })

  it('rejects empty update bodies', () => {
    expect(() => parseBody(updateMilestoneSchema, {})).toThrow()
  })

  it('accepts status updates with optional note', () => {
    const data = parseBody(updateStatusSchema, {
      status: 'REVISION_REQUESTED',
      note: 'Need tighter spacing',
    })
    expect(data.status).toBe('REVISION_REQUESTED')
    expect(data.note).toBe('Need tighter spacing')
  })

  it('rejects unknown statuses', () => {
    expect(() =>
      parseBody(updateStatusSchema, { status: 'DONE' }),
    ).toThrow()
  })
})
