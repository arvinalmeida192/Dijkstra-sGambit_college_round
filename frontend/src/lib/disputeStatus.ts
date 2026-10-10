import type { BadgeTone } from './milestoneStatus'
import type { DisputeDecision, DisputeStatus } from './api/disputes'

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  OPEN: 'Open',
  UNDER_REVIEW: 'Under review',
  RESOLVED: 'Resolved',
}

export const DISPUTE_STATUS_TONES: Record<DisputeStatus, BadgeTone> = {
  OPEN: 'warning',
  UNDER_REVIEW: 'accent',
  RESOLVED: 'success',
}

export const DISPUTE_DECISION_LABELS: Record<DisputeDecision, string> = {
  RELEASE_TO_FREELANCER: 'Release to freelancer',
  REFUND_TO_CLIENT: 'Refund to client',
  SPLIT: 'Split',
}
