import type { BadgeTone } from './milestoneStatus'
import type {
  DisputeDecision,
  DisputeResolutionOutcome,
  DisputeResolutionType,
  DisputeStatus,
} from './api/disputes'

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

export const RESOLUTION_OUTCOME_LABELS: Record<DisputeResolutionOutcome, string> = {
  RESUME_EXISTING: 'Resume work under existing agreement',
  RESUME_WITH_CHANGES: 'Resume work after mutually accepted changes',
  TERMINATE_WORK: 'End affected work',
}

export const RESOLUTION_OUTCOME_TONES: Record<DisputeResolutionOutcome, BadgeTone> = {
  RESUME_EXISTING: 'success',
  RESUME_WITH_CHANGES: 'accent',
  TERMINATE_WORK: 'danger',
}

export const RESOLUTION_TYPE_LABELS: Record<DisputeResolutionType, string> = {
  MUTUAL_AGREEMENT: 'Mutual agreement',
  ARBITRATOR_DECISION: 'Arbitrator decision',
}
