/**
 * Trusted, participant-safe activity summaries derived from audit_logs rows.
 * Never invents actors or timestamps — only formats existing event data.
 */

const SENSITIVE_KEY =
  /^(password|passwd|secret|token|authorization|api[_-]?key|private[_-]?key|credential|cookie|session)$/i

const CATEGORY_BY_ACTION = {
  SUBMISSION_CREATED: 'submission',
  SUBMISSION_REVIEWED: 'review',
  REVISION_LIMIT_REACHED: 'review',
  VERIFICATION_PASSED: 'verification',
  VERIFICATION_FAILED: 'verification',
  VERIFICATION_NEEDS_HUMAN_REVIEW: 'verification',
  MILESTONE_VERIFIED_RELEASE_ELIGIBLE: 'verification',
  EXTENSION_PROPOSED: 'extension',
  EXTENSION_ACCEPTED: 'extension',
  EXTENSION_REJECTED: 'extension',
  OVERDUE_DECLARED: 'deadline',
  AUTO_APPROVAL_TRIGGERED: 'protection',
  AUTO_RELEASE_EXECUTED: 'payment',
  RECLAIM_EXECUTED: 'payment',
  MILESTONE_CANCELLED_RECLAIMED: 'protection',
  PROJECT_FUNDED: 'payment',
  PROJECT_FUNDED_WEBHOOK: 'payment',
  MILESTONE_FUNDS_RELEASED: 'payment',
  PAYMENT_TX_REPORTED: 'payment',
  PAYMENT_SYNCED: 'payment',
  DISPUTE_OPENED: 'dispute',
  DISPUTE_CLAIMED: 'dispute',
  DISPUTE_ESCALATED: 'dispute',
  DISPUTE_EVIDENCE_ADDED: 'dispute',
  DISPUTE_RESOLUTION_PROPOSED: 'dispute',
  DISPUTE_RESOLVED: 'dispute',
  INVITATION_CREATED: 'invitation',
  INVITATION_ACCEPTED: 'invitation',
  INVITATION_REJECTED: 'invitation',
  INVITATION_REVOKED: 'invitation',
}

function milestoneLabel(milestoneTitle) {
  const title = typeof milestoneTitle === 'string' ? milestoneTitle.trim() : ''
  return title || 'Milestone'
}

function decisionLabel(decision) {
  if (decision === 'APPROVED') return 'approved'
  if (decision === 'REVISION_REQUESTED') return 'revision requested'
  if (decision === 'REJECTED') return 'rejected'
  return String(decision || 'reviewed').toLowerCase().replace(/_/g, ' ')
}

/**
 * @param {string} action
 * @param {Record<string, unknown>} [metadata]
 * @param {{ milestoneTitle?: string | null }} [context]
 */
export function summarizeAuditAction(action, metadata = {}, context = {}) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {}
  const label = milestoneLabel(context.milestoneTitle)

  switch (action) {
    case 'SUBMISSION_CREATED': {
      const revision =
        meta.revision != null ? ` (revision ${meta.revision})` : ''
      return `${label} submitted for review${revision}`
    }
    case 'SUBMISSION_REVIEWED': {
      if (meta.decision === 'APPROVED') return `${label} approved`
      if (meta.decision === 'REVISION_REQUESTED') {
        return `Revision requested for ${label}`
      }
      return `${label} ${decisionLabel(meta.decision)}`
    }
    case 'VERIFICATION_PASSED':
      return `Independent verification passed for ${label} (signed attestation issued)`
    case 'VERIFICATION_FAILED':
      return `Independent verification failed for ${label}`
    case 'VERIFICATION_NEEDS_HUMAN_REVIEW':
      return `Verification routed ${label} to human review`
    case 'MILESTONE_VERIFIED_RELEASE_ELIGIBLE':
      return `${label} verified release unlocked`
    case 'REVISION_LIMIT_REACHED':
      return `Revision limit reached for ${label}`
    case 'EXTENSION_PROPOSED':
      return `Extension requested for ${label}`
    case 'EXTENSION_ACCEPTED':
      return `Extension accepted for ${label}`
    case 'EXTENSION_REJECTED':
      return `Extension rejected for ${label}`
    case 'OVERDUE_DECLARED':
      return `${label} marked overdue`
    case 'AUTO_APPROVAL_TRIGGERED':
      return `${label} auto-approved after review window`
    case 'AUTO_RELEASE_EXECUTED':
      return `Payment auto-released for ${label}`
    case 'RECLAIM_EXECUTED':
      return `Funds reclaimed for ${label}`
    case 'MILESTONE_CANCELLED_RECLAIMED':
      return `${label} cancelled and funds reclaimed`
    case 'PROJECT_FUNDED':
    case 'PROJECT_FUNDED_WEBHOOK':
      return 'Project funding recorded'
    case 'MILESTONE_FUNDS_RELEASED':
      return `Payment released for ${label}`
    case 'PAYMENT_TX_REPORTED':
      return `Payment transaction reported for ${label}`
    case 'PAYMENT_SYNCED': {
      if (meta.ok === true) return `Payment verified for ${label}`
      if (meta.pending === true) return `Payment pending verification for ${label}`
      return `Payment sync updated for ${label}`
    }
    case 'DISPUTE_OPENED':
      return `Dispute opened${context.milestoneTitle ? ` for ${label}` : ''}`
    case 'DISPUTE_CLAIMED':
      return 'Dispute claimed by arbitrator'
    case 'DISPUTE_ESCALATED':
      return `Dispute escalated to arbitration${context.milestoneTitle ? ` for ${label}` : ''}`
    case 'DISPUTE_EVIDENCE_ADDED':
      return 'Evidence attached'
    case 'DISPUTE_RESOLUTION_PROPOSED':
      return 'Dispute resolution proposed'
    case 'DISPUTE_RESOLVED':
      return 'Dispute resolved'
    case 'INVITATION_CREATED': {
      const target =
        typeof meta.invitedEmail === 'string' && meta.invitedEmail.trim()
          ? ` for ${meta.invitedEmail.trim()}`
          : ''
      return `Work invitation sent${target}`
    }
    case 'INVITATION_ACCEPTED':
      return 'Work invitation accepted'
    case 'INVITATION_REJECTED':
      return 'Work invitation rejected'
    case 'INVITATION_REVOKED':
      return 'Work invitation withdrawn'
    default: {
      const readable = String(action || 'Activity')
        .toLowerCase()
        .replace(/_/g, ' ')
      return readable.charAt(0).toUpperCase() + readable.slice(1)
    }
  }
}

export function categorizeAuditAction(action) {
  return CATEGORY_BY_ACTION[action] ?? 'other'
}

/**
 * Strip secrets / oversized error dumps from audit metadata for API clients.
 * @param {unknown} metadata
 */
export function sanitizeAuditMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {}
  }

  /** @type {Record<string, unknown>} */
  const out = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY.test(key)) continue

    if (key === 'error' || key === 'stack' || key === 'stackTrace') {
      if (typeof value === 'string') {
        const trimmed = value.trim().slice(0, 240)
        if (trimmed) out.message = trimmed
      }
      continue
    }

    if (typeof value === 'string' && value.length > 2000) {
      out[key] = `${value.slice(0, 2000)}…`
      continue
    }

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = sanitizeAuditMetadata(value)
      continue
    }

    out[key] = value
  }
  return out
}

/**
 * Resolve a display actor for timeline rows.
 * @param {{
 *   actorId?: string | null
 *   actorName?: string | null
 *   actorUserRole?: string | null
 *   projectClientId?: string | null
 *   projectFreelancerId?: string | null
 * }} row
 */
export function resolveActivityActor(row) {
  if (!row.actorId) {
    return {
      actorId: null,
      actor: 'system',
      actorName: 'System',
      actorRole: 'SYSTEM',
    }
  }

  let actorRole = 'PARTICIPANT'
  if (row.projectClientId && row.actorId === row.projectClientId) {
    actorRole = 'CLIENT'
  } else if (
    row.projectFreelancerId &&
    row.actorId === row.projectFreelancerId
  ) {
    actorRole = 'FREELANCER'
  } else if (row.actorUserRole === 'ARBITRATOR') {
    actorRole = 'ARBITRATOR'
  }

  const name =
    typeof row.actorName === 'string' && row.actorName.trim()
      ? row.actorName.trim()
      : 'Participant'

  return {
    actorId: row.actorId,
    actor: actorRole === 'SYSTEM' ? 'system' : 'user',
    actorName: name,
    actorRole,
  }
}

/**
 * @param {object} row — audit log row (optionally joined)
 * @param {{ projectClientId?: string | null, projectFreelancerId?: string | null }} [project]
 */
export function toPublicActivity(row, project = {}) {
  if (!row) return null

  const metadata = sanitizeAuditMetadata(row.metadata ?? {})
  const milestoneTitle = row.milestone_title ?? row.milestoneTitle ?? null
  const actor = resolveActivityActor({
    actorId: row.actor_id ?? row.actorId ?? null,
    actorName: row.actor_name ?? row.actorName ?? null,
    actorUserRole: row.actor_user_role ?? row.actorUserRole ?? null,
    projectClientId: project.projectClientId ?? project.client_id ?? null,
    projectFreelancerId:
      project.projectFreelancerId ?? project.freelancer_id ?? null,
  })

  const action = row.action
  const summary = summarizeAuditAction(action, metadata, { milestoneTitle })

  return {
    id: row.id,
    actorId: actor.actorId,
    actor: actor.actor,
    actorName: actor.actorName,
    actorRole: actor.actorRole,
    projectId: row.project_id ?? row.projectId ?? null,
    milestoneId: row.milestone_id ?? row.milestoneId ?? null,
    milestoneTitle: milestoneTitle || null,
    submissionId: row.submission_id ?? row.submissionId ?? null,
    action,
    eventType: action,
    category: categorizeAuditAction(action),
    summary,
    metadata,
    details: metadata,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  }
}
