import { describe, expect, it } from 'vitest'
import {
  categorizeAuditAction,
  resolveActivityActor,
  sanitizeAuditMetadata,
  summarizeAuditAction,
  toPublicActivity,
} from '../../src/modules/activity/activity.summaries.js'

describe('summarizeAuditAction', () => {
  it('builds concise human summaries from trusted actions', () => {
    expect(
      summarizeAuditAction(
        'SUBMISSION_CREATED',
        { revision: 2 },
        { milestoneTitle: 'Milestone 2' },
      ),
    ).toBe('Milestone 2 submitted for review (revision 2)')

    expect(
      summarizeAuditAction(
        'SUBMISSION_REVIEWED',
        { decision: 'REVISION_REQUESTED' },
        { milestoneTitle: 'Milestone 1' },
      ),
    ).toBe('Revision requested for Milestone 1')

    expect(
      summarizeAuditAction(
        'SUBMISSION_REVIEWED',
        { decision: 'APPROVED' },
        { milestoneTitle: 'Milestone 2' },
      ),
    ).toBe('Milestone 2 approved')

    expect(summarizeAuditAction('DISPUTE_OPENED', {}, {})).toBe(
      'Dispute opened',
    )
    expect(summarizeAuditAction('DISPUTE_EVIDENCE_ADDED', {}, {})).toBe(
      'Evidence attached',
    )
    expect(
      summarizeAuditAction(
        'EXTENSION_PROPOSED',
        {},
        { milestoneTitle: 'Design' },
      ),
    ).toBe('Extension requested for Design')
    expect(
      summarizeAuditAction(
        'PAYMENT_SYNCED',
        { ok: true },
        { milestoneTitle: 'Milestone 2' },
      ),
    ).toBe('Payment verified for Milestone 2')
    expect(
      summarizeAuditAction(
        'INVITATION_CREATED',
        { invitedEmail: 'freelancer@example.com' },
        {},
      ),
    ).toBe('Work invitation sent for freelancer@example.com')
    expect(summarizeAuditAction('INVITATION_ACCEPTED', {}, {})).toBe(
      'Work invitation accepted',
    )
    expect(summarizeAuditAction('INVITATION_REJECTED', {}, {})).toBe(
      'Work invitation rejected',
    )
    expect(summarizeAuditAction('INVITATION_REVOKED', {}, {})).toBe(
      'Work invitation withdrawn',
    )
    expect(categorizeAuditAction('INVITATION_CREATED')).toBe('invitation')
  })
})

describe('sanitizeAuditMetadata', () => {
  it('strips secrets and truncates error dumps', () => {
    const cleaned = sanitizeAuditMetadata({
      paymentId: 'pay_1',
      token: 'super-secret',
      password: 'nope',
      error: 'boom\n'.repeat(80),
      nested: { api_key: 'x', amount: 12 },
    })

    expect(cleaned.paymentId).toBe('pay_1')
    expect(cleaned.token).toBeUndefined()
    expect(cleaned.password).toBeUndefined()
    expect(cleaned.message).toBeTruthy()
    expect(String(cleaned.message).length).toBeLessThanOrEqual(240)
    expect(cleaned.nested).toEqual({ amount: 12 })
  })
})

describe('toPublicActivity', () => {
  it('maps actor roles and never invents timestamps', () => {
    const createdAt = new Date('2026-03-01T12:00:00.000Z')
    const activity = toPublicActivity(
      {
        id: 'a1',
        actor_id: 'client-1',
        actor_name: 'Ada Client',
        actor_user_role: 'CLIENT',
        project_id: 'p1',
        milestone_id: 'm1',
        milestone_title: 'Milestone 2',
        submission_id: null,
        action: 'DISPUTE_OPENED',
        metadata: { disputeId: 'd1', secret: 'hide-me' },
        created_at: createdAt,
      },
      { projectClientId: 'client-1', projectFreelancerId: 'free-1' },
    )

    expect(activity.summary).toBe('Dispute opened for Milestone 2')
    expect(activity.actorName).toBe('Ada Client')
    expect(activity.actorRole).toBe('CLIENT')
    expect(activity.category).toBe('dispute')
    expect(activity.createdAt).toBe(createdAt.toISOString())
    expect(activity.details.secret).toBeUndefined()
    expect(activity.details.disputeId).toBe('d1')
  })

  it('labels system actors when actor_id is null', () => {
    const actor = resolveActivityActor({ actorId: null })
    expect(actor.actor).toBe('system')
    expect(actor.actorName).toBe('System')
    expect(categorizeAuditAction('OVERDUE_DECLARED')).toBe('deadline')
  })
})
