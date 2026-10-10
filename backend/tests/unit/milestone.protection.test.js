import { describe, expect, it } from 'vitest'
import {
  deadlineWithGraceDate,
  deadlineWithGraceUnix,
} from '../../src/modules/milestones/milestone.protection.js'
import { computeMilestoneProtectionMeta } from '../../src/modules/milestones/milestone.service.js'
import {
  cancelAndReclaimSchema,
  parseBody,
  proposeExtensionSchema,
} from '../../src/modules/milestones/milestone.validation.js'

describe('milestone protection helpers', () => {
  it('computes deadline + grace at end of due-date UTC day', () => {
    const milestone = { due_date: '2026-01-10', grace_period_days: 3 }
    const due = deadlineWithGraceDate(milestone)
    expect(due.toISOString()).toBe('2026-01-13T23:59:59.000Z')
    expect(deadlineWithGraceUnix(milestone)).toBe(
      Math.floor(due.getTime() / 1000),
    )
  })

  it('returns nextAction / owner / due for key statuses', () => {
    expect(
      computeMilestoneProtectionMeta({
        status: 'OVERDUE',
        dueDate: '2026-01-01',
        escalationStatus: 'ACTION_ELIGIBLE',
      }),
    ).toMatchObject({
      actionOwner: 'FREELANCER',
      actionDueAt: null,
    })

    expect(
      computeMilestoneProtectionMeta({
        status: 'APPROVED',
        escalationStatus: 'AUTO_APPROVED',
        reviewDueAt: '2026-01-02T00:00:00.000Z',
      }).nextAction,
    ).toMatch(/auto-release/i)

    expect(
      computeMilestoneProtectionMeta({
        status: 'IN_REVIEW',
        reviewDueAt: '2026-01-05T12:00:00.000Z',
      }),
    ).toMatchObject({
      actionOwner: 'CLIENT',
      actionDueAt: '2026-01-05T12:00:00.000Z',
    })
  })

  it('validates extension and cancel payloads', () => {
    const extension = parseBody(proposeExtensionSchema, {
      newDueDate: '2026-12-01',
      reason: 'Need more time for QA',
    })
    expect(extension.newDueDate).toBe('2026-12-01')

    expect(() =>
      parseBody(proposeExtensionSchema, {
        newDueDate: '2026-12-01',
        reason: '',
      }),
    ).toThrow(/Invalid request body/)

    expect(parseBody(cancelAndReclaimSchema, {}).reason).toBeUndefined()
  })
})
