export const MILESTONE_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'SUBMITTED',
  'IN_REVIEW',
  'REVISION_REQUESTED',
  'APPROVED',
  'DISPUTED',
  'OVERDUE',
  'CANCELLED',
] as const

export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

/** Project-relative actor for transition UX (server still enforces). */
export type MilestoneActorRole = 'CLIENT' | 'FREELANCER' | 'ARBITRATOR'

export type EscalationStatus =
  | 'NONE'
  | 'REMINDER_SENT'
  | 'WARNING_SENT'
  | 'ACTION_ELIGIBLE'
  | 'AUTO_APPROVED'
  | 'CANCELLED_RECLAIMED'
  | string

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In Review',
  REVISION_REQUESTED: 'Revision Requested',
  APPROVED: 'Approved',
  DISPUTED: 'Disputed',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled',
}

export const MILESTONE_STATUS_TONES: Record<MilestoneStatus, BadgeTone> = {
  PENDING: 'neutral',
  IN_PROGRESS: 'warning',
  SUBMITTED: 'warning',
  IN_REVIEW: 'warning',
  REVISION_REQUESTED: 'warning',
  APPROVED: 'success',
  DISPUTED: 'danger',
  OVERDUE: 'danger',
  CANCELLED: 'danger',
}

export const ESCALATION_LABELS: Record<string, string> = {
  NONE: 'Normal',
  REMINDER_SENT: 'Reminder sent',
  WARNING_SENT: 'Warning sent',
  ACTION_ELIGIBLE: 'Action eligible',
  AUTO_APPROVED: 'Auto-approved',
  CANCELLED_RECLAIMED: 'Cancelled & reclaimed',
}

/** Keep in sync with backend milestone.transitions.js */
const TRANSITION_ACTORS: Partial<
  Record<MilestoneStatus, Partial<Record<MilestoneStatus, MilestoneActorRole[]>>>
> = {
  PENDING: {
    IN_PROGRESS: ['CLIENT', 'FREELANCER'],
  },
  IN_PROGRESS: {
    SUBMITTED: ['FREELANCER'],
    DISPUTED: ['CLIENT', 'FREELANCER'],
  },
  OVERDUE: {
    SUBMITTED: ['FREELANCER'],
    IN_PROGRESS: ['CLIENT', 'FREELANCER'],
    DISPUTED: ['CLIENT', 'FREELANCER'],
  },
  SUBMITTED: {
    IN_REVIEW: ['CLIENT'],
    DISPUTED: ['CLIENT', 'FREELANCER'],
  },
  IN_REVIEW: {
    APPROVED: ['CLIENT'],
    REVISION_REQUESTED: ['CLIENT'],
    DISPUTED: ['CLIENT', 'FREELANCER'],
  },
  REVISION_REQUESTED: {
    IN_PROGRESS: ['FREELANCER'],
    SUBMITTED: ['FREELANCER'],
    DISPUTED: ['CLIENT', 'FREELANCER'],
  },
  DISPUTED: {
    IN_PROGRESS: ['ARBITRATOR'],
    CANCELLED: ['ARBITRATOR'],
    IN_REVIEW: ['ARBITRATOR'],
    APPROVED: ['ARBITRATOR'],
    REVISION_REQUESTED: ['ARBITRATOR'],
  },
}

export const MILESTONE_ACTION_LABELS: Partial<Record<MilestoneStatus, string>> =
  {
    IN_PROGRESS: 'Start work',
    SUBMITTED: 'Mark submitted',
    IN_REVIEW: 'Start review',
    APPROVED: 'Approve',
    REVISION_REQUESTED: 'Request revision',
    DISPUTED: 'Open dispute',
  }

export function getMilestoneStatusLabel(status: MilestoneStatus): string {
  return MILESTONE_STATUS_LABELS[status]
}

export function getMilestoneStatusTone(status: MilestoneStatus): BadgeTone {
  return MILESTONE_STATUS_TONES[status]
}

export function getMilestoneActionLabel(toStatus: MilestoneStatus): string {
  return MILESTONE_ACTION_LABELS[toStatus] ?? `Move to ${toStatus}`
}

export function getEscalationLabel(status: string | null | undefined): string {
  if (!status) return ESCALATION_LABELS.NONE
  return ESCALATION_LABELS[status] ?? status.replace(/_/g, ' ')
}

export function transitionRequiresNote(toStatus: MilestoneStatus): boolean {
  return toStatus === 'REVISION_REQUESTED' || toStatus === 'DISPUTED'
}

/**
 * UX filter only — the API rejects unauthorized transitions.
 */
export function actorCanTransition(
  fromStatus: MilestoneStatus,
  toStatus: MilestoneStatus,
  actorRole: MilestoneActorRole | null,
): boolean {
  if (!actorRole) return false
  if (toStatus === 'APPROVED' && actorRole === 'FREELANCER') return false
  const roles = TRANSITION_ACTORS[fromStatus]?.[toStatus]
  return Boolean(roles?.includes(actorRole))
}

export function filterActionsForActor(
  fromStatus: MilestoneStatus,
  allowedTransitions: MilestoneStatus[],
  actorRole: MilestoneActorRole | null,
): MilestoneStatus[] {
  return allowedTransitions.filter((to) =>
    actorCanTransition(fromStatus, to, actorRole),
  )
}

export function parseAcceptanceCriteriaLines(text: string): string[] {
  const lines = text
    .split(/\r?\n|;/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (lines.length === 0 && text.trim()) return [text.trim()]
  return lines
}
