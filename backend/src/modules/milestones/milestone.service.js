import {
  conflict,
  forbidden,
  notFound,
} from '../../utils/errors.js'
import { env } from '../../config/env.js'
import { isProjectFunded } from '../funding/funding.service.js'
import { findFundedEscrowPaymentForMilestone } from '../payments/payment.repository.js'
import {
  computeFrozenCriteriaHash,
  normalizeVerificationCriteria,
} from '../verification/verification.criteria.js'
import { withTransaction } from '../../db/pool.js'
import { findProjectById } from '../projects/project.repository.js'
import { assertParticipant } from '../projects/project.service.js'
import {
  findActiveAgreement,
  findAgreementById,
  findProposedAgreement,
} from '../agreements/agreement.repository.js'
import {
  insertAuditLog,
  listSubmissionsForMilestone,
} from '../submissions/submission.repository.js'
import { findOpenDisputeForMilestone } from '../disputes/dispute.repository.js'
import {
  listAuditLogsForProject,
  toPublicAuditLog,
} from '../submissions/submission.repository.js'
import {
  deadlineWithGraceDate,
  executeAutoRelease,
  executeReclaim,
} from './milestone.protection.js'
import {
  applyStatusPatch,
  deleteMilestone,
  findActiveExtensionForMilestone,
  findExtensionById,
  findMilestoneById,
  insertExtension,
  insertMilestone,
  listExtensionsForMilestone,
  listMilestonesForProject,
  toPublicExtension,
  toPublicMilestone,
  updateExtensionResponse,
  updateMilestoneFields,
} from './milestone.repository.js'
import {
  assertMilestoneTransition,
  listAllowedTransitions,
  resolveActorRole,
  transitionSideEffects,
} from './milestone.transitions.js'

function assertClientOwner(project, user) {
  assertParticipant(project, user)
  if (project.client_id !== user.id) {
    throw forbidden('Only the project client can perform this action.')
  }
}

export function computeMilestoneProtectionMeta(milestone) {
  let nextAction = 'Start work on milestone'
  let actionOwner = 'FREELANCER'
  let actionDueAt = milestone.dueDate ? `${milestone.dueDate}T23:59:59.000Z` : null

  switch (milestone.status) {
    case 'PENDING':
      nextAction = 'Start work on milestone'
      actionOwner = 'FREELANCER'
      break
    case 'IN_PROGRESS':
      nextAction = 'Submit deliverable'
      actionOwner = 'FREELANCER'
      actionDueAt = milestone.dueDate ? `${milestone.dueDate}T23:59:59.000Z` : null
      break
    case 'OVERDUE':
      nextAction = 'Submit deliverable or request extension; Client may cancel and reclaim'
      actionOwner = 'FREELANCER'
      actionDueAt = null
      break
    case 'SUBMITTED':
    case 'IN_REVIEW':
      if (milestone.verificationStatus === 'CHALLENGE_WINDOW') {
        nextAction =
          'Objective verification PASSED; in challenge window before smart-contract-enforced release'
        actionOwner = 'FREELANCER'
        actionDueAt = milestone.challengeDueAt ?? milestone.reviewDueAt ?? null
      } else if (milestone.verificationStatus === 'FAILED') {
        nextAction = 'Objective verification FAILED; submit revised deliverable'
        actionOwner = 'FREELANCER'
        actionDueAt = milestone.dueDate ? `${milestone.dueDate}T23:59:59.000Z` : null
      } else {
        nextAction = 'Review submission'
        actionOwner = 'CLIENT'
        actionDueAt = milestone.reviewDueAt ?? null
      }
      break
    case 'REVISION_REQUESTED':
      nextAction = 'Address revision feedback and resubmit'
      actionOwner = 'FREELANCER'
      actionDueAt = milestone.dueDate ? `${milestone.dueDate}T23:59:59.000Z` : null
      break
    case 'DISPUTED':
      nextAction = 'Arbitrator review and ruling'
      actionOwner = 'ARBITRATOR'
      actionDueAt = null
      break
    case 'APPROVED':
      if (milestone.verificationStatus === 'VERIFIED_ELIGIBLE') {
        nextAction = 'Execute verified release on-chain (or claim milestone funds)'
        actionOwner = 'FREELANCER'
      } else if (milestone.escalationStatus === 'AUTO_APPROVED') {
        nextAction = 'Execute auto-release (or report release tx on Payments)'
        actionOwner = 'CLIENT'
      } else {
        nextAction = 'Release payment from escrow'
        actionOwner = 'CLIENT'
      }
      actionDueAt = null
      break
    case 'CANCELLED':
      nextAction =
        milestone.escalationStatus === 'CANCELLED_RECLAIMED'
          ? 'Execute reclaim (or report reclaim tx on Payments)'
          : 'Milestone cancelled'
      actionOwner = 'CLIENT'
      actionDueAt = null
      break
    default:
      break
  }

  return { nextAction, actionOwner, actionDueAt }
}

function withAllowedTransitions(milestone) {
  const pub = toPublicMilestone(milestone)
  const meta = computeMilestoneProtectionMeta(pub)
  return {
    ...pub,
    allowedTransitions: listAllowedTransitions(pub.status),
    ...meta,
  }
}

async function loadProjectForMilestone(milestone) {
  const project = await findProjectById(milestone.project_id)
  if (!project) throw notFound('Project not found.')
  return project
}

export async function listMilestones(user, projectId) {
  const project = await findProjectById(projectId)
  assertParticipant(project, user)

  const rows = await listMilestonesForProject(projectId)
  return {
    milestones: rows.map(withAllowedTransitions),
  }
}

export async function getMilestone(user, milestoneId) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')

  const project = await loadProjectForMilestone(milestone)
  assertParticipant(project, user)

  return withAllowedTransitions(milestone)
}

export async function createMilestone(user, projectId, input) {
  const project = await findProjectById(projectId)
  assertClientOwner(project, user)

  if (project.status === 'CANCELLED' || project.status === 'COMPLETED') {
    throw conflict(
      `Cannot create milestones on a ${project.status.toLowerCase()} project.`,
    )
  }

  const activeAgreement = await findActiveAgreement(projectId)
  if (activeAgreement) {
    throw conflict(
      'Cannot create milestones directly on a project with an active agreement. Propose an agreement change to modify milestones.',
    )
  }

  const proposedAgreement = await findProposedAgreement(projectId)
  if (proposedAgreement) {
    throw conflict(
      'Cannot create milestones directly while an agreement proposal is pending. Propose an agreement change to modify milestones.',
    )
  }

  let agreementId = input.agreementId ?? null
  if (agreementId) {
    const agreement = await findAgreementById(agreementId)
    if (!agreement || agreement.project_id !== projectId) {
      throw conflict('agreementId must reference an agreement on this project.')
    }
  }

  const method = input.verificationMethod ?? 'HUMAN_REVIEWED'
  const normalizedCriteria = normalizeVerificationCriteria(
    {
      ...(input.verificationCriteria ?? {}),
      acceptanceCriteria:
        input.verificationCriteria?.acceptanceCriteria ??
        input.acceptanceCriteria,
      challengeWindowHours:
        input.challengeWindowHours ??
        input.verificationCriteria?.challengeWindowHours ??
        48,
      disputeEscalationDays:
        input.disputeEscalationDays ??
        input.verificationCriteria?.disputeEscalationDays ??
        7,
    },
    method,
  )

  const frozenHash = computeFrozenCriteriaHash({
    agreementVersion: 1,
    milestoneNumber: (input.sortOrder ?? 0) + 1,
    title: input.title,
    deliverableDescription:
      input.deliverableDescription ?? input.deliverables ?? input.description ?? '',
    amount: input.amount,
    verificationMethod: method,
    verificationCriteria: normalizedCriteria,
    maxRevisions: input.maxRevisions ?? 3,
    challengeWindowHours: normalizedCriteria.challengeWindowHours,
  })

  const row = await insertMilestone({
    projectId,
    agreementId,
    title: input.title,
    description: input.description ?? input.deliverables ?? '',
    deliverables: input.deliverables,
    deliverableDescription:
      input.deliverableDescription ?? input.deliverables ?? input.description ?? '',
    acceptanceCriteria: input.acceptanceCriteria,
    verificationMethod: method,
    verificationCriteria: normalizedCriteria,
    frozenCriteriaHash: frozenHash,
    frozenAgreementVersion: 1,
    challengeWindowHours: normalizedCriteria.challengeWindowHours,
    disputeEscalationDays: normalizedCriteria.disputeEscalationDays,
    amount: input.amount,
    dueDate: input.dueDate ?? null,
    reviewWindowDays: input.reviewWindowDays ?? 7,
    gracePeriodDays: input.gracePeriodDays ?? 3,
    maxRevisions: input.maxRevisions ?? 3,
    sortOrder: input.sortOrder ?? 0,
    createdBy: user.id,
  })

  return withAllowedTransitions(row)
}

export async function updateMilestone(user, milestoneId, input) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')

  const project = await loadProjectForMilestone(milestone)
  assertClientOwner(project, user)

  if (milestone.agreement_id) {
    throw conflict(
      'Cannot directly edit milestones defined by an agreement. Propose an agreement change to revise terms.',
    )
  }

  const activeAgreement = await findActiveAgreement(project.id)
  if (activeAgreement) {
    throw conflict(
      'Cannot edit milestones directly on a project with an active agreement. Propose an agreement change to revise terms.',
    )
  }

  if (milestone.status !== 'PENDING') {
    throw conflict(
      'Only PENDING milestones can be edited. Propose agreement/milestone changes for active work.',
    )
  }

  if (project.status === 'CANCELLED' || project.status === 'COMPLETED') {
    throw conflict(
      `Cannot edit milestones on a ${project.status.toLowerCase()} project.`,
    )
  }

  const nextMethod =
    input.verificationMethod ?? milestone.verification_method ?? 'HUMAN_REVIEWED'
  const nextCriteria =
    input.verificationCriteria !== undefined ||
    input.verificationMethod !== undefined ||
    input.challengeWindowHours !== undefined ||
    input.disputeEscalationDays !== undefined
      ? normalizeVerificationCriteria(
          {
            ...(milestone.verification_criteria ?? {}),
            ...(input.verificationCriteria ?? {}),
            challengeWindowHours:
              input.challengeWindowHours ??
              input.verificationCriteria?.challengeWindowHours ??
              milestone.challenge_window_hours ??
              48,
            disputeEscalationDays:
              input.disputeEscalationDays ??
              input.verificationCriteria?.disputeEscalationDays ??
              milestone.dispute_escalation_days ??
              7,
          },
          nextMethod,
        )
      : undefined

  const row = await updateMilestoneFields(milestoneId, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.deliverables !== undefined
      ? { deliverables: input.deliverables }
      : {}),
    ...(input.deliverableDescription !== undefined
      ? { deliverableDescription: input.deliverableDescription }
      : {}),
    ...(input.acceptanceCriteria !== undefined
      ? { acceptanceCriteria: input.acceptanceCriteria }
      : {}),
    ...(input.verificationMethod !== undefined
      ? { verificationMethod: nextMethod }
      : {}),
    ...(nextCriteria !== undefined
      ? {
          verificationCriteria: nextCriteria,
          challengeWindowHours: nextCriteria.challengeWindowHours,
          disputeEscalationDays: nextCriteria.disputeEscalationDays,
        }
      : {}),
    ...(input.amount !== undefined ? { amount: input.amount } : {}),
    ...(Object.prototype.hasOwnProperty.call(input, 'dueDate')
      ? { dueDate: input.dueDate }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(input, 'reviewWindowDays')
      ? { reviewWindowDays: input.reviewWindowDays }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(input, 'gracePeriodDays')
      ? { gracePeriodDays: input.gracePeriodDays }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(input, 'maxRevisions')
      ? { maxRevisions: input.maxRevisions }
      : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  })

  return withAllowedTransitions(row)
}

export async function removeMilestone(user, milestoneId) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')

  const project = await loadProjectForMilestone(milestone)
  assertClientOwner(project, user)

  if (milestone.agreement_id) {
    throw conflict(
      'Cannot directly delete milestones defined by an agreement. Propose an agreement change to revise terms.',
    )
  }

  const activeAgreement = await findActiveAgreement(project.id)
  if (activeAgreement) {
    throw conflict(
      'Cannot delete milestones directly on a project with an active agreement. Propose an agreement change to revise terms.',
    )
  }

  if (milestone.status !== 'PENDING') {
    throw conflict('Only PENDING milestones can be deleted.')
  }

  await deleteMilestone(milestoneId)
  return { deleted: true, id: milestoneId }
}

export async function changeMilestoneStatus(user, milestoneId, input) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')

  const project = await loadProjectForMilestone(milestone)
  // Participants + arbitrators may attempt; transition table enforces specifics.
  assertParticipant(project, user)

  if (project.status === 'CANCELLED') {
    throw conflict('Cannot change milestone status on a cancelled project.')
  }

  if (milestone.status === 'DISPUTED') {
    throw conflict(
      'Cannot change status of a disputed milestone directly. Resolve the dispute through the dispute resolution workflow.',
    )
  }

  const actorRole = resolveActorRole(project, user)
  assertMilestoneTransition({
    fromStatus: milestone.status,
    toStatus: input.status,
    actorRole,
    context: { hasFreelancer: Boolean(project.freelancer_id) },
  })

  // Phase 21 / On-Chain Escrow: When GATEWAY_PAYMENTS_ENABLED=true, reject starting work on agreement milestones
  // if neither gateway funding nor confirmed on-chain escrow funding is present.
  if (input.status === 'IN_PROGRESS' && milestone.status === 'PENDING') {
    if (env.gatewayPaymentsEnabled) {
      const activeAgreement = await findActiveAgreement(project.id)
      if (milestone.agreement_id || activeAgreement) {
        const gatewayFunded = await isProjectFunded(project.id)
        const onChainFunded = Boolean(
          await findFundedEscrowPaymentForMilestone(milestoneId),
        )
        if (!gatewayFunded && !onChainFunded) {
          throw conflict(
            'Project funding required before starting work. The client must fund the project first.',
          )
        }
      }
    }
  }

  // Note required for revision / dispute clarity (soft requirement).
  if (
    (input.status === 'REVISION_REQUESTED' || input.status === 'DISPUTED') &&
    !input.note
  ) {
    throw conflict(
      `A note is required when moving a milestone to ${input.status}.`,
    )
  }

  const effects = transitionSideEffects(input.status, milestone)
  const patch = {
    status: effects.status,
  }

  if (input.note !== undefined) {
    patch.statusNote = input.note ?? null
  }
  if (effects.submittedAt !== undefined) {
    patch.submittedAt = effects.submittedAt
  }
  if (effects.reviewStartedAt !== undefined) {
    patch.reviewStartedAt = effects.reviewStartedAt
  }
  if (effects.reviewDueAt !== undefined) {
    patch.reviewDueAt = effects.reviewDueAt
  }
  if (effects.approvedAt !== undefined) {
    patch.approvedAt = effects.approvedAt
  }

  const row = await applyStatusPatch(milestoneId, patch)
  return withAllowedTransitions(row)
}

export async function listExtensions(user, milestoneId) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')
  const project = await loadProjectForMilestone(milestone)
  assertParticipant(project, user)

  const rows = await listExtensionsForMilestone(milestoneId)
  return { extensions: rows.map(toPublicExtension) }
}

export async function proposeExtension(user, milestoneId, input) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')
  const project = await loadProjectForMilestone(milestone)
  assertParticipant(project, user)

  if (milestone.status === 'APPROVED' || milestone.status === 'CANCELLED') {
    throw conflict(`Cannot propose an extension on an ${milestone.status.toLowerCase()} milestone.`)
  }

  const existingActive = await findActiveExtensionForMilestone(milestoneId)
  if (existingActive) {
    throw conflict('There is already a pending extension proposal for this milestone.')
  }

  const row = await insertExtension({
    milestoneId,
    projectId: project.id,
    proposedBy: user.id,
    newDueDate: input.newDueDate,
    reason: input.reason.trim(),
  })

  await insertAuditLog({
    actorId: user.id,
    projectId: project.id,
    milestoneId,
    action: 'EXTENSION_PROPOSED',
    metadata: {
      extensionId: row.id,
      newDueDate: input.newDueDate,
      reason: input.reason.trim(),
    },
  })

  return toPublicExtension(row)
}

export async function respondExtension(user, milestoneId, extensionId, input) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')
  const project = await loadProjectForMilestone(milestone)
  assertParticipant(project, user)

  const extension = await findExtensionById(extensionId)
  if (!extension || extension.milestone_id !== milestoneId) {
    throw notFound('Extension proposal not found.')
  }

  if (extension.status !== 'PROPOSED') {
    throw conflict(`Extension proposal is already ${extension.status.toLowerCase()}.`)
  }

  if (extension.proposed_by === user.id) {
    throw forbidden('You cannot accept or reject your own extension proposal.')
  }

  const decision = input.decision
  const updatedExtension = await updateExtensionResponse(extensionId, {
    respondedBy: user.id,
    status: decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED',
    responseNote: input.responseNote?.trim() ?? null,
  })

  let updatedMilestone = milestone
  if (decision === 'ACCEPT') {
    const patch = { dueDate: extension.new_due_date }
    if (milestone.status === 'OVERDUE') {
      patch.status = 'IN_PROGRESS'
      patch.statusNote = 'Resumed in progress following accepted deadline extension.'
      patch.escalationStatus = 'NONE'
    }
    updatedMilestone = await applyStatusPatch(milestoneId, patch)
  }

  await insertAuditLog({
    actorId: user.id,
    projectId: project.id,
    milestoneId,
    action: decision === 'ACCEPT' ? 'EXTENSION_ACCEPTED' : 'EXTENSION_REJECTED',
    metadata: {
      extensionId,
      decision,
      newDueDate: extension.new_due_date,
      responseNote: input.responseNote ?? null,
    },
  })

  return {
    extension: toPublicExtension(updatedExtension),
    milestone: withAllowedTransitions(updatedMilestone),
  }
}

export async function cancelAndReclaimMilestone(user, milestoneId, input = {}) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')
  const project = await loadProjectForMilestone(milestone)
  assertClientOwner(project, user)

  if (milestone.status === 'APPROVED' || milestone.status === 'CANCELLED') {
    throw conflict(`Cannot cancel a ${milestone.status.toLowerCase()} milestone.`)
  }

  if (milestone.status === 'DISPUTED') {
    throw conflict('Cannot cancel and reclaim while the milestone is in an active dispute.')
  }

  const openDispute = await findOpenDisputeForMilestone(milestoneId)
  if (openDispute) {
    throw conflict('Cannot cancel and reclaim while an open dispute exists on this milestone.')
  }

  // Verify non-delivery: no submissions may exist
  const submissions = await listSubmissionsForMilestone(milestoneId)
  if (submissions.length > 0) {
    throw conflict(
      'Cannot cancel and reclaim: work has been submitted. Review the submission or open a dispute.',
    )
  }

  // Must be OVERDUE or past deadline + grace (end of due-date UTC day + grace)
  let isEligible = milestone.status === 'OVERDUE'
  if (!isEligible) {
    const graceExpiry = deadlineWithGraceDate(milestone)
    if (graceExpiry && Date.now() > graceExpiry.getTime()) {
      isEligible = true
    }
  }

  if (!isEligible) {
    throw conflict(
      'Milestone is not eligible for cancellation and reclaim. Deadline plus grace period has not expired.',
    )
  }

  const reason = input.reason?.trim() || 'Milestone cancelled and reclaimed by client due to non-delivery.'
  const updated = await applyStatusPatch(milestoneId, {
    status: 'CANCELLED',
    statusNote: reason,
    escalationStatus: 'CANCELLED_RECLAIMED',
  })

  await insertAuditLog({
    actorId: user.id,
    projectId: project.id,
    milestoneId,
    action: 'MILESTONE_CANCELLED_RECLAIMED',
    metadata: {
      reason,
      cancelledAt: new Date().toISOString(),
    },
  })

  return {
    milestone: withAllowedTransitions(updated),
    notice:
      'Milestone cancelled in the application. If escrow was funded on-chain, use Execute reclaim (operator) or report reclaimUndeliveredMilestone via Payments.',
  }
}

export async function executeMilestoneAutoRelease(user, milestoneId) {
  return executeAutoRelease(user, milestoneId)
}

export async function executeMilestoneReclaim(user, milestoneId) {
  return executeReclaim(user, milestoneId)
}

export async function listProjectAuditLogs(
  user,
  projectId,
  { limit = 20, offset = 0 } = {},
) {
  const project = await findProjectById(projectId)
  assertParticipant(project, user)
  const { rows, total, limit: safeLimit, offset: safeOffset } =
    await listAuditLogsForProject(projectId, { limit, offset })
  const projectContext = {
    projectClientId: project.client_id,
    projectFreelancerId: project.freelancer_id,
  }
  return {
    auditLogs: rows.map((row) => toPublicAuditLog(row, projectContext)),
    pagination: {
      limit: safeLimit,
      offset: safeOffset,
      total,
    },
  }
}
