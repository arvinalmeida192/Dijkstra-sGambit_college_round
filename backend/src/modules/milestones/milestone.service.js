import {
  conflict,
  forbidden,
  notFound,
} from '../../utils/errors.js'
import { findProjectById } from '../projects/project.repository.js'
import { assertParticipant } from '../projects/project.service.js'
import {
  findActiveAgreement,
  findAgreementById,
  findProposedAgreement,
} from '../agreements/agreement.repository.js'
import {
  applyStatusPatch,
  deleteMilestone,
  findMilestoneById,
  insertMilestone,
  listMilestonesForProject,
  toPublicMilestone,
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

function withAllowedTransitions(milestone) {
  return {
    ...toPublicMilestone(milestone),
    allowedTransitions: listAllowedTransitions(milestone.status),
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

  const row = await insertMilestone({
    projectId,
    agreementId,
    title: input.title,
    description: input.description ?? input.deliverables ?? '',
    deliverables: input.deliverables,
    acceptanceCriteria: input.acceptanceCriteria,
    amount: input.amount,
    dueDate: input.dueDate ?? null,
    reviewWindowDays: input.reviewWindowDays ?? null,
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

  const row = await updateMilestoneFields(milestoneId, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.deliverables !== undefined
      ? { deliverables: input.deliverables }
      : {}),
    ...(input.acceptanceCriteria !== undefined
      ? { acceptanceCriteria: input.acceptanceCriteria }
      : {}),
    ...(input.amount !== undefined ? { amount: input.amount } : {}),
    ...(Object.prototype.hasOwnProperty.call(input, 'dueDate')
      ? { dueDate: input.dueDate }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(input, 'reviewWindowDays')
      ? { reviewWindowDays: input.reviewWindowDays }
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

  const actorRole = resolveActorRole(project, user)
  assertMilestoneTransition({
    fromStatus: milestone.status,
    toStatus: input.status,
    actorRole,
    context: { hasFreelancer: Boolean(project.freelancer_id) },
  })

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
