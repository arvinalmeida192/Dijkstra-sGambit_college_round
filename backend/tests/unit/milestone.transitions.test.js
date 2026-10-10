import { describe, expect, it } from 'vitest'
import { AppError } from '../../src/utils/errors.js'
import {
  assertMilestoneTransition,
  listAllowedTransitions,
  resolveActorRole,
  transitionSideEffects,
} from '../../src/modules/milestones/milestone.transitions.js'

describe('milestone transitions', () => {
  it('allows the happy-path roles', () => {
    expect(
      assertMilestoneTransition({
        fromStatus: 'PENDING',
        toStatus: 'IN_PROGRESS',
        actorRole: 'FREELANCER',
        context: { hasFreelancer: true },
      }),
    ).toMatchObject({ toStatus: 'IN_PROGRESS' })

    expect(
      assertMilestoneTransition({
        fromStatus: 'IN_PROGRESS',
        toStatus: 'SUBMITTED',
        actorRole: 'FREELANCER',
        context: { hasFreelancer: true },
      }).toStatus,
    ).toBe('SUBMITTED')

    expect(
      assertMilestoneTransition({
        fromStatus: 'SUBMITTED',
        toStatus: 'IN_REVIEW',
        actorRole: 'CLIENT',
      }).toStatus,
    ).toBe('IN_REVIEW')

    expect(
      assertMilestoneTransition({
        fromStatus: 'IN_REVIEW',
        toStatus: 'APPROVED',
        actorRole: 'CLIENT',
      }).toStatus,
    ).toBe('APPROVED')
  })

  it('blocks freelancer self-approval', () => {
    expect(() =>
      assertMilestoneTransition({
        fromStatus: 'IN_REVIEW',
        toStatus: 'APPROVED',
        actorRole: 'FREELANCER',
      }),
    ).toThrow(AppError)

    try {
      assertMilestoneTransition({
        fromStatus: 'IN_REVIEW',
        toStatus: 'APPROVED',
        actorRole: 'FREELANCER',
      })
    } catch (err) {
      expect(err.status).toBe(403)
      expect(err.message).toMatch(/cannot approve/i)
    }
  })

  it('rejects illegal edges', () => {
    expect(() =>
      assertMilestoneTransition({
        fromStatus: 'PENDING',
        toStatus: 'APPROVED',
        actorRole: 'CLIENT',
      }),
    ).toThrow(/Cannot transition/)

    expect(() =>
      assertMilestoneTransition({
        fromStatus: 'APPROVED',
        toStatus: 'IN_PROGRESS',
        actorRole: 'CLIENT',
      }),
    ).toThrow(/Cannot transition/)
  })

  it('requires freelancer assignment before active work', () => {
    expect(() =>
      assertMilestoneTransition({
        fromStatus: 'PENDING',
        toStatus: 'IN_PROGRESS',
        actorRole: 'CLIENT',
        context: { hasFreelancer: false },
      }),
    ).toThrow(/Assign a freelancer/)
  })

  it('lists allowed transitions from each status', () => {
    expect(listAllowedTransitions('PENDING')).toEqual(
      expect.arrayContaining(['IN_PROGRESS', 'CANCELLED']),
    )
    expect(listAllowedTransitions('IN_REVIEW')).toEqual(
      expect.arrayContaining(['APPROVED', 'REVISION_REQUESTED', 'DISPUTED']),
    )
    expect(listAllowedTransitions('OVERDUE')).toEqual(
      expect.arrayContaining(['SUBMITTED', 'CANCELLED', 'DISPUTED']),
    )
    expect(listAllowedTransitions('APPROVED')).toEqual([])
    expect(listAllowedTransitions('CANCELLED')).toEqual([])
  })

  it('resolves actor roles from project participants', () => {
    const project = {
      client_id: 'c1',
      freelancer_id: 'f1',
    }
    expect(resolveActorRole(project, { id: 'c1', role: 'CLIENT' })).toBe(
      'CLIENT',
    )
    expect(resolveActorRole(project, { id: 'f1', role: 'FREELANCER' })).toBe(
      'FREELANCER',
    )
    expect(
      resolveActorRole(project, { id: 'x', role: 'ARBITRATOR' }),
    ).toBe('ARBITRATOR')
    expect(resolveActorRole(project, { id: 'x', role: 'CLIENT' })).toBeNull()
  })

  it('computes review window due date on IN_REVIEW', () => {
    const now = new Date('2026-10-10T12:00:00.000Z')
    const effects = transitionSideEffects(
      'IN_REVIEW',
      { review_window_days: 5 },
      now,
    )
    expect(effects.reviewStartedAt).toEqual(now)
    expect(effects.reviewDueAt.toISOString()).toBe('2026-10-15T12:00:00.000Z')
  })

  it('sets submittedAt / approvedAt side effects', () => {
    const now = new Date('2026-10-10T12:00:00.000Z')
    expect(
      transitionSideEffects('SUBMITTED', {}, now).submittedAt,
    ).toEqual(now)
    expect(transitionSideEffects('APPROVED', {}, now).approvedAt).toEqual(now)
  })

  it('starts review countdown at SUBMITTED when review window is set', () => {
    const now = new Date('2026-10-10T12:00:00.000Z')
    const effects = transitionSideEffects(
      'SUBMITTED',
      { review_window_days: 3 },
      now,
    )
    expect(effects.reviewDueAt.toISOString()).toBe('2026-10-13T12:00:00.000Z')
  })

  it('allows system auto-approve from SUBMITTED / IN_REVIEW', () => {
    expect(
      assertMilestoneTransition({
        fromStatus: 'SUBMITTED',
        toStatus: 'APPROVED',
        actorRole: 'SYSTEM',
      }).toStatus,
    ).toBe('APPROVED')
    expect(
      assertMilestoneTransition({
        fromStatus: 'IN_REVIEW',
        toStatus: 'APPROVED',
        actorRole: 'SYSTEM',
      }).toStatus,
    ).toBe('APPROVED')
  })
})
