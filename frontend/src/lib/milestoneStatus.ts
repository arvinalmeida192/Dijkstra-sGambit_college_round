export const MILESTONE_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'SUBMITTED',
  'IN_REVIEW',
  'REVISION_REQUESTED',
  'APPROVED',
  'DISPUTED',
] as const

export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In Review',
  REVISION_REQUESTED: 'Revision Requested',
  APPROVED: 'Approved',
  DISPUTED: 'Disputed',
}

export const MILESTONE_STATUS_TONES: Record<MilestoneStatus, BadgeTone> = {
  PENDING: 'neutral',
  IN_PROGRESS: 'warning',
  SUBMITTED: 'warning',
  IN_REVIEW: 'warning',
  REVISION_REQUESTED: 'warning',
  APPROVED: 'success',
  DISPUTED: 'danger',
}

export function getMilestoneStatusLabel(status: MilestoneStatus): string {
  return MILESTONE_STATUS_LABELS[status]
}

export function getMilestoneStatusTone(status: MilestoneStatus): BadgeTone {
  return MILESTONE_STATUS_TONES[status]
}
