import { conflict, forbidden } from '../../utils/errors.js'

/**
 * Shared milestone status vocabulary (keep in sync with frontend milestoneStatus.ts).
 */
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
]

/**
 * Allowed transitions and which project-relative actor roles may perform them.
 *
 * Actor roles here are relationship roles on the project:
 *   CLIENT | FREELANCER | ARBITRATOR | SYSTEM
 *
 * Happy path: PENDING → IN_PROGRESS → SUBMITTED → IN_REVIEW → APPROVED
 * Branches: REVISION_REQUESTED, DISPUTED, OVERDUE, CANCELLED
 *
 * Critical rule: FREELANCER may never transition to APPROVED
 * (cannot approve their own submission).
 */
const TRANSITIONS = {
  PENDING: {
    IN_PROGRESS: ['CLIENT', 'FREELANCER'],
    CANCELLED: ['CLIENT'],
  },
  IN_PROGRESS: {
    SUBMITTED: ['FREELANCER'],
    DISPUTED: ['CLIENT', 'FREELANCER'],
    OVERDUE: ['CLIENT', 'SYSTEM'],
  },
  OVERDUE: {
    SUBMITTED: ['FREELANCER'],
    IN_PROGRESS: ['CLIENT', 'FREELANCER'],
    CANCELLED: ['CLIENT', 'SYSTEM'],
    DISPUTED: ['CLIENT', 'FREELANCER'],
  },
  SUBMITTED: {
    IN_REVIEW: ['CLIENT'],
    APPROVED: ['CLIENT', 'SYSTEM'],
    DISPUTED: ['CLIENT', 'FREELANCER'],
  },
  IN_REVIEW: {
    APPROVED: ['CLIENT', 'SYSTEM'],
    REVISION_REQUESTED: ['CLIENT'],
    DISPUTED: ['CLIENT', 'FREELANCER'],
  },
  REVISION_REQUESTED: {
    IN_PROGRESS: ['FREELANCER'],
    SUBMITTED: ['FREELANCER'],
    DISPUTED: ['CLIENT', 'FREELANCER'],
  },
  APPROVED: {
    // Terminal milestone state.
  },
  CANCELLED: {
    // Terminal when work is cancelled / reclaimed.
  },
  DISPUTED: {
    // Resolution paths for arbitrators and dispute resolution workflow.
    IN_PROGRESS: ['ARBITRATOR'],
    CANCELLED: ['ARBITRATOR'],
    IN_REVIEW: ['ARBITRATOR'],
    APPROVED: ['ARBITRATOR'],
    REVISION_REQUESTED: ['ARBITRATOR'],
  },
}

export function listAllowedTransitions(fromStatus) {
  const edges = TRANSITIONS[fromStatus]
  if (!edges) return []
  return Object.keys(edges)
}

/**
 * Resolve the caller's project-relative actor role.
 * Arbitrator global role wins even if they are not a participant.
 */
export function resolveActorRole(project, user) {
  if (!user) return null
  if (user.role === 'SYSTEM') return 'SYSTEM'
  if (user.role === 'ARBITRATOR') return 'ARBITRATOR'
  if (project.client_id === user.id) return 'CLIENT'
  if (project.freelancer_id && project.freelancer_id === user.id) {
    return 'FREELANCER'
  }
  return null
}

/**
 * Central state-transition guard. Throws AppError on invalid/unauthorized moves.
 *
 * @param {object} params
 * @param {string} params.fromStatus
 * @param {string} params.toStatus
 * @param {string|null} params.actorRole  CLIENT | FREELANCER | ARBITRATOR
 * @param {object} [params.context]
 * @param {boolean} [params.context.hasFreelancer]
 * @returns {{ fromStatus: string, toStatus: string, actorRole: string }}
 */
export function assertMilestoneTransition({
  fromStatus,
  toStatus,
  actorRole,
  context = {},
}) {
  if (!MILESTONE_STATUSES.includes(fromStatus)) {
    throw conflict(`Unknown milestone status: ${fromStatus}`)
  }
  if (!MILESTONE_STATUSES.includes(toStatus)) {
    throw conflict(`Unknown target milestone status: ${toStatus}`)
  }
  if (fromStatus === toStatus) {
    throw conflict(`Milestone is already ${fromStatus}.`)
  }

  // Authorized dispute resolution outcome paths (mutual agreement or arbitrator outcome):
  if (
    fromStatus === 'DISPUTED' &&
    context.isDisputeResolution &&
    (toStatus === 'IN_PROGRESS' || toStatus === 'CANCELLED')
  ) {
    if (toStatus === 'IN_PROGRESS' && context.hasFreelancer === false) {
      throw conflict(
        'Assign a freelancer before moving this milestone into active work.',
      )
    }
    return { fromStatus, toStatus, actorRole: actorRole || 'DISPUTE_RESOLUTION' }
  }

  const allowedRoles = TRANSITIONS[fromStatus]?.[toStatus]
  if (!allowedRoles) {
    throw conflict(
      `Cannot transition milestone from ${fromStatus} to ${toStatus}.`,
    )
  }

  if (!actorRole) {
    throw forbidden('You do not have permission to change this milestone.')
  }

  // Hard rule: freelancers never approve (covers misconfiguration of TRANSITIONS).
  if (toStatus === 'APPROVED' && actorRole === 'FREELANCER') {
    throw forbidden(
      'Freelancers cannot approve their own submission.',
    )
  }

  if (!allowedRoles.includes(actorRole)) {
    throw forbidden(
      `A ${actorRole.toLowerCase()} cannot move a milestone from ${fromStatus} to ${toStatus}.`,
    )
  }

  // Work cannot start / submit without a freelancer on the project.
  if (
    (toStatus === 'IN_PROGRESS' || toStatus === 'SUBMITTED') &&
    context.hasFreelancer === false
  ) {
    throw conflict(
      'Assign a freelancer before moving this milestone into active work.',
    )
  }

  return { fromStatus, toStatus, actorRole }
}

/**
 * Side-effect timestamps / review window for a successful transition.
 * Pure function — does not touch the database.
 */
export function transitionSideEffects(toStatus, milestone, now = new Date()) {
  const patch = {
    status: toStatus,
    updatedAt: now,
  }

  if (toStatus === 'SUBMITTED') {
    patch.submittedAt = now
    // Review countdown starts at submission so auto-approval cannot be delayed
    // by an unresponsive client who never clicks "Start review".
    const days = milestone.review_window_days ?? milestone.reviewWindowDays
    if (days != null && days >= 1) {
      const due = new Date(now)
      due.setUTCDate(due.getUTCDate() + days)
      patch.reviewDueAt = due
    }
  }

  if (toStatus === 'IN_REVIEW') {
    patch.reviewStartedAt = now
    // Keep an existing reviewDueAt from SUBMITTED; only set if missing.
    const existingDue = milestone.review_due_at ?? milestone.reviewDueAt
    if (!existingDue) {
      const days = milestone.review_window_days ?? milestone.reviewWindowDays
      if (days != null && days >= 1) {
        const due = new Date(now)
        due.setUTCDate(due.getUTCDate() + days)
        patch.reviewDueAt = due
      } else {
        patch.reviewDueAt = null
      }
    }
  }

  if (toStatus === 'APPROVED') {
    patch.approvedAt = now
  }

  if (toStatus === 'REVISION_REQUESTED' || toStatus === 'IN_PROGRESS') {
    // Clear review window when leaving review / returning to work.
    if (toStatus === 'IN_PROGRESS') {
      patch.reviewStartedAt = null
      patch.reviewDueAt = null
    }
  }

  return patch
}
