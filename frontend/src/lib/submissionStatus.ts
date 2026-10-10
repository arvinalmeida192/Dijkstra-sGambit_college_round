import type { ReviewDecision } from './api/submissions'
import type { BadgeTone } from './milestoneStatus'
import type { MilestoneStatus } from './milestoneStatus'

export const REVIEW_DECISION_LABELS: Record<ReviewDecision, string> = {
  START_REVIEW: 'Started review',
  APPROVED: 'Approved',
  REVISION_REQUESTED: 'Revision requested',
}

export const REVIEW_DECISION_TONES: Record<ReviewDecision, BadgeTone> = {
  START_REVIEW: 'warning',
  APPROVED: 'success',
  REVISION_REQUESTED: 'warning',
}

export function getReviewDecisionLabel(decision: ReviewDecision): string {
  return REVIEW_DECISION_LABELS[decision]
}

export function getReviewDecisionTone(decision: ReviewDecision): BadgeTone {
  return REVIEW_DECISION_TONES[decision]
}

/** Milestone statuses where the freelancer may create a submission. */
export function canSubmitDeliverable(status: MilestoneStatus): boolean {
  return (
    status === 'IN_PROGRESS' ||
    status === 'REVISION_REQUESTED' ||
    status === 'OVERDUE'
  )
}

/** Milestone statuses where the client may review the latest submission. */
export function canReviewSubmission(status: MilestoneStatus): boolean {
  return status === 'SUBMITTED' || status === 'IN_REVIEW'
}

/**
 * Truncate a SHA-256 hex for display. Full hash remains available for copy.
 */
export function shortenHash(hash: string, edge = 8): string {
  if (hash.length <= edge * 2 + 1) return hash
  return `${hash.slice(0, edge)}…${hash.slice(-edge)}`
}
