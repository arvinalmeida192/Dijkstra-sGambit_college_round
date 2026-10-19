import {
  conflict,
  forbidden,
  notFound,
} from '../../utils/errors.js'
import { withTransaction } from '../../db/pool.js'
import { findProjectById } from '../projects/project.repository.js'
import { assertParticipant } from '../projects/project.service.js'
import {
  findMilestoneById,
  toPublicMilestone,
} from '../milestones/milestone.repository.js'
import {
  assertMilestoneTransition,
  listAllowedTransitions,
  resolveActorRole,
  transitionSideEffects,
} from '../milestones/milestone.transitions.js'
import { findPaymentById } from '../payments/payment.repository.js'
import {
  insertAuditLog,
  listSubmissionsForMilestone,
} from '../submissions/submission.repository.js'
import {
  findLatestAttestationForMilestone,
  findLatestVerificationRunForMilestone,
  findVerificationRunById,
  toPublicAttestation,
  toPublicVerificationRun,
} from '../verification/verification.repository.js'
import {
  claimDispute,
  findDisputeById,
  findEvidenceById,
  findOpenDisputeForMilestone,
  insertDispute,
  insertEvidence,
  linkPayment,
  listDisputesForProject,
  listEvidenceForDispute,
  resolveDispute,
  resolveDisputeWithOutcome,
  setResolutionProposal,
  toPublicDispute,
  toPublicEvidence,
} from './dispute.repository.js'
import {
  deletePrivateFile,
  readPrivateFile,
  storeDisputeEvidenceFile,
} from './dispute.storage.js'

function withAllowedTransitions(milestone) {
  return {
    ...toPublicMilestone(milestone),
    allowedTransitions: listAllowedTransitions(milestone.status),
  }
}

function assertPartyCanOpen(project, user) {
  const { isClient, isFreelancer } = assertParticipant(project, user)
  if (!isClient && !isFreelancer) {
    throw forbidden('Only the project client or freelancer can open a dispute.')
  }
}

function assertArbitrator(user) {
  if (user.role !== 'ARBITRATOR') {
    throw forbidden('Only an arbitrator can perform this action.')
  }
}

async function applyMilestoneStatus(client, {
  milestone,
  project,
  user,
  toStatus,
  note,
  isDisputeResolution = false,
}) {
  if (milestone.status === toStatus) return milestone

  const actorRole = resolveActorRole(project, user)
  assertMilestoneTransition({
    fromStatus: milestone.status,
    toStatus,
    actorRole,
    context: {
      hasFreelancer: Boolean(project.freelancer_id),
      isDisputeResolution,
    },
  })

  const effects = transitionSideEffects(toStatus, milestone)
  const sets = ['status = $2', 'updated_at = NOW()']
  const values = [milestone.id, effects.status]
  let i = 3

  if (note !== undefined) {
    sets.push(`status_note = $${i++}`)
    values.push(note ?? null)
  }
  if (effects.submittedAt !== undefined) {
    sets.push(`submitted_at = $${i++}`)
    values.push(effects.submittedAt)
  }
  if (effects.reviewStartedAt !== undefined) {
    sets.push(`review_started_at = $${i++}`)
    values.push(effects.reviewStartedAt)
  }
  if (effects.reviewDueAt !== undefined) {
    sets.push(`review_due_at = $${i++}`)
    values.push(effects.reviewDueAt)
  }
  if (effects.approvedAt !== undefined) {
    sets.push(`approved_at = $${i++}`)
    values.push(effects.approvedAt)
  }

  const { rows } = await client.query(
    `UPDATE milestones SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  )
  return rows[0]
}

function milestoneStatusForDecision(decision) {
  if (decision === 'RELEASE_TO_FREELANCER') return 'APPROVED'
  if (decision === 'REFUND_TO_CLIENT') return 'REVISION_REQUESTED'
  return 'IN_REVIEW'
}

function milestoneStatusForOutcome(outcome) {
  if (outcome === 'RESUME_EXISTING') return 'IN_PROGRESS'
  if (outcome === 'RESUME_WITH_CHANGES') return 'IN_PROGRESS'
  if (outcome === 'TERMINATE_WORK') return 'CANCELLED'
  throw conflict(`Unknown resolution outcome: ${outcome}`)
}

async function assertPaymentBelongs(paymentId, projectId, milestoneId) {
  if (!paymentId) return null
  const payment = await findPaymentById(paymentId)
  if (!payment) throw notFound('Linked payment not found.')
  if (payment.project_id !== projectId || payment.milestone_id !== milestoneId) {
    throw conflict('Payment must belong to the same project and milestone.')
  }
  return payment
}

export async function listProjectDisputes(user, projectId) {
  const project = await findProjectById(projectId)
  assertParticipant(project, user)
  const rows = await listDisputesForProject(projectId)
  return { disputes: rows.map((row) => toPublicDispute(row)) }
}

export async function getDispute(user, disputeId) {
  const dispute = await findDisputeById(disputeId)
  if (!dispute) throw notFound('Dispute not found.')
  const project = await findProjectById(dispute.project_id)
  assertParticipant(project, user)
  const evidence = await listEvidenceForDispute(disputeId)
  const milestone = await findMilestoneById(dispute.milestone_id)
  const verificationRun = dispute.verification_run_id
    ? await findVerificationRunById(dispute.verification_run_id)
    : await findLatestVerificationRunForMilestone(dispute.milestone_id)
  const attestation = await findLatestAttestationForMilestone(dispute.milestone_id)

  const pub = toPublicDispute(dispute, evidence)
  pub.verificationContext = milestone
    ? {
        milestoneTitle: milestone.title,
        verificationMethod: milestone.verification_method,
        verificationStatus: milestone.verification_status,
        verificationCriteria: toPublicMilestone(milestone).verificationCriteria,
        frozenCriteriaHash: milestone.frozen_criteria_hash ?? null,
        frozenAgreementVersion: milestone.frozen_agreement_version ?? null,
        latestVerificationRun: toPublicVerificationRun(verificationRun),
        latestAttestation: toPublicAttestation(attestation),
      }
    : null
  return pub
}

export async function openDispute(user, milestoneId, input) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')

  const project = await findProjectById(milestone.project_id)
  assertPartyCanOpen(project, user)

  if (project.status === 'CANCELLED' || project.status === 'COMPLETED') {
    throw conflict(
      `Cannot open a dispute on a ${project.status.toLowerCase()} project.`,
    )
  }

  const existing = await findOpenDisputeForMilestone(milestoneId)
  if (existing) {
    throw conflict('This milestone already has an open dispute.')
  }

  if (input.openPaymentId) {
    await assertPaymentBelongs(
      input.openPaymentId,
      project.id,
      milestone.id,
    )
  }

  const reason = input.reason.trim()
  const claimSummary = input.claimSummary?.trim()
    ? input.claimSummary.trim()
    : null

  const submissions = await listSubmissionsForMilestone(milestone.id)
  const latestSub = submissions[submissions.length - 1] ?? null
  const evidenceSubmissionId =
    input.evidenceSubmissionId ?? latestSub?.id ?? null
  const verificationRunId =
    input.verificationRunId ?? milestone.latest_verification_run_id ?? null
  const disputedCriteriaRefs = Array.isArray(input.disputedCriteriaRefs)
    ? input.disputedCriteriaRefs
    : []
  const escalationDays = Number(milestone.dispute_escalation_days ?? 7)
  const escalationDueAt = new Date(
    Date.now() + escalationDays * 24 * 60 * 60 * 1000,
  )

  const result = await withTransaction(async (client) => {
    let current = milestone
    if (current.status !== 'DISPUTED') {
      current = await applyMilestoneStatus(client, {
        milestone: current,
        project,
        user,
        toStatus: 'DISPUTED',
        note: reason,
      })
    } else if (reason) {
      const { rows } = await client.query(
        `UPDATE milestones
         SET status_note = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [current.id, reason],
      )
      current = rows[0]
    }

    let dispute = await insertDispute(
      {
        projectId: project.id,
        milestoneId: milestone.id,
        openedBy: user.id,
        reason,
        claimSummary,
        disputedCriteriaRefs,
        evidenceSubmissionId,
        verificationRunId,
        escalationDueAt,
      },
      client,
    )

    if (input.openPaymentId) {
      dispute = await linkPayment(
        dispute.id,
        'open',
        input.openPaymentId,
        client,
      )
    }

    await insertAuditLog(
      {
        actorId: user.id,
        projectId: project.id,
        milestoneId: milestone.id,
        action: 'DISPUTE_OPENED',
        metadata: {
          disputeId: dispute.id,
          reason,
          openPaymentId: input.openPaymentId ?? null,
          disputedCriteriaRefs,
          evidenceSubmissionId,
          verificationRunId,
          escalationDueAt: escalationDueAt.toISOString(),
        },
      },
      client,
    )

    return { dispute, milestone: current }
  })

  return {
    dispute: toPublicDispute(result.dispute, []),
    milestone: withAllowedTransitions(result.milestone),
    notice:
      'Dispute recorded in the application. On-chain fund lock requires a verified DisputeOpened transaction (payments API). Application decisions do not move escrow funds.',
  }
}

export async function claimForReview(user, disputeId) {
  assertArbitrator(user)
  const dispute = await findDisputeById(disputeId)
  if (!dispute) throw notFound('Dispute not found.')

  const project = await findProjectById(dispute.project_id)
  assertParticipant(project, user)

  if (dispute.status !== 'OPEN' && !(dispute.status === 'UNDER_REVIEW' && !dispute.arbitrator_id)) {
    throw conflict(`Dispute is ${dispute.status}; only OPEN or unassigned escalated disputes can be claimed.`)
  }

  const updated = await claimDispute(disputeId, user.id)
  if (!updated) {
    throw conflict('Could not claim dispute (it may have been claimed already).')
  }

  await insertAuditLog({
    actorId: user.id,
    projectId: dispute.project_id,
    milestoneId: dispute.milestone_id,
    action: 'DISPUTE_CLAIMED',
    metadata: { disputeId },
  })

  const evidence = await listEvidenceForDispute(disputeId)
  return {
    dispute: toPublicDispute(updated, evidence),
    notice:
      'Reviewer assignment recorded. Escrow funds are unchanged until a verified on-chain resolve transaction is reported.',
  }
}

export async function decideDispute(user, disputeId, input) {
  assertArbitrator(user)
  const dispute = await findDisputeById(disputeId)
  if (!dispute) throw notFound('Dispute not found.')

  const project = await findProjectById(dispute.project_id)
  assertParticipant(project, user)

  if (dispute.status === 'RESOLVED') {
    throw conflict('Dispute is already resolved.')
  }

  if (
    dispute.arbitrator_id &&
    dispute.arbitrator_id !== user.id
  ) {
    throw forbidden('Only the assigned arbitrator can resolve this dispute.')
  }

  const milestone = await findMilestoneById(dispute.milestone_id)
  if (!milestone) throw notFound('Milestone not found.')

  if (input.resolvePaymentId) {
    await assertPaymentBelongs(
      input.resolvePaymentId,
      project.id,
      milestone.id,
    )
  }

  if (
    input.decision === 'SPLIT' &&
    input.splitReleaseToFreelancer > Number(milestone.amount)
  ) {
    throw conflict(
      'splitReleaseToFreelancer cannot exceed the milestone amount.',
    )
  }

  const targetStatus = milestoneStatusForDecision(input.decision)
  const rationale = input.rationale.trim()

  const result = await withTransaction(async (client) => {
    let updated = await resolveDispute(
      {
        id: disputeId,
        arbitratorId: user.id,
        decision: input.decision,
        rationale,
        splitReleaseToFreelancer:
          input.decision === 'SPLIT' ? input.splitReleaseToFreelancer : null,
      },
      client,
    )
    if (!updated) {
      throw conflict('Could not resolve dispute (state may have changed).')
    }

    if (input.resolvePaymentId) {
      updated = await linkPayment(
        disputeId,
        'resolve',
        input.resolvePaymentId,
        client,
      )
    }

    let currentMilestone = milestone
    if (milestone.status === 'DISPUTED') {
      currentMilestone = await applyMilestoneStatus(client, {
        milestone,
        project,
        user,
        toStatus: targetStatus,
        note: rationale,
      })
    }

    await insertAuditLog(
      {
        actorId: user.id,
        projectId: project.id,
        milestoneId: milestone.id,
        action: 'DISPUTE_RESOLVED',
        metadata: {
          disputeId,
          decision: input.decision,
          splitReleaseToFreelancer:
            input.decision === 'SPLIT' ? input.splitReleaseToFreelancer : null,
          fundsMovedByDecision: false,
          resolvePaymentId: input.resolvePaymentId ?? null,
          milestoneStatus: currentMilestone.status,
        },
      },
      client,
    )

    return { dispute: updated, milestone: currentMilestone }
  })

  const evidence = await listEvidenceForDispute(disputeId)
  return {
    dispute: toPublicDispute(result.dispute, evidence),
    milestone: withAllowedTransitions(result.milestone),
    notice:
      'Human decision recorded. This does not move escrow funds. Report a verified DisputeResolved / release / refund transaction via the payments API.',
  }
}

export async function addEvidence(user, disputeId, input, file) {
  const dispute = await findDisputeById(disputeId)
  if (!dispute) throw notFound('Dispute not found.')

  const project = await findProjectById(dispute.project_id)
  assertParticipant(project, user)

  if (dispute.status === 'RESOLVED') {
    throw conflict('Cannot add evidence to a resolved dispute.')
  }

  const notes = input.notes?.trim() ? input.notes.trim() : null
  const externalUrl = input.externalUrl?.trim()
    ? input.externalUrl.trim()
    : null

  let stored = null
  if (file?.buffer) {
    stored = await storeDisputeEvidenceFile({
      buffer: file.buffer,
      disputeId,
      originalFilename: file.originalname,
      contentType: file.mimetype,
    })
  }

  if (!stored && !externalUrl && !notes) {
    throw conflict(
      'Provide a file upload, externalUrl, and/or notes for evidence.',
    )
  }

  try {
    const row = await insertEvidence({
      disputeId,
      uploadedBy: user.id,
      notes,
      externalUrl,
      fileRef: stored?.fileRef ?? null,
      originalFilename: stored?.originalFilename ?? null,
      contentType: stored?.contentType ?? null,
      byteSize: stored?.byteSize ?? null,
      sha256Hash: stored?.sha256Hash ?? null,
    })

    await insertAuditLog({
      actorId: user.id,
      projectId: dispute.project_id,
      milestoneId: dispute.milestone_id,
      action: 'DISPUTE_EVIDENCE_ADDED',
      metadata: {
        disputeId,
        evidenceId: row.id,
        hasFile: Boolean(stored),
      },
    })

    return { evidence: toPublicEvidence(row) }
  } catch (err) {
    if (stored?.fileRef) await deletePrivateFile(stored.fileRef)
    throw err
  }
}

export async function downloadEvidenceFile(user, evidenceId) {
  const evidence = await findEvidenceById(evidenceId)
  if (!evidence) throw notFound('Evidence not found.')
  if (!evidence.file_ref) {
    throw notFound('Evidence has no uploaded file.')
  }

  const dispute = await findDisputeById(evidence.dispute_id)
  if (!dispute) throw notFound('Dispute not found.')

  const project = await findProjectById(dispute.project_id)
  assertParticipant(project, user)

  const buffer = await readPrivateFile(evidence.file_ref)
  return {
    buffer,
    contentType: evidence.content_type || 'application/octet-stream',
    filename: evidence.original_filename || 'evidence.bin',
    sha256Hash: evidence.sha256_hash || '',
  }
}

export async function proposeResolution(user, disputeId, input) {
  const dispute = await findDisputeById(disputeId)
  if (!dispute) throw notFound('Dispute not found.')

  const project = await findProjectById(dispute.project_id)
  const { isClient, isFreelancer } = assertParticipant(project, user)

  if (!isClient && !isFreelancer) {
    throw forbidden('Only the project client or freelancer can propose a resolution.')
  }

  if (dispute.status === 'RESOLVED') {
    throw conflict('Dispute is already resolved.')
  }

  const proposal = {
    proposedBy: user.id,
    outcome: input.outcome,
    summary: input.summary.trim(),
    proposedAt: new Date().toISOString(),
  }

  const updated = await setResolutionProposal(disputeId, proposal)
  if (!updated) {
    throw conflict('Could not record resolution proposal (dispute state may have changed).')
  }

  await insertAuditLog({
    actorId: user.id,
    projectId: dispute.project_id,
    milestoneId: dispute.milestone_id,
    action: 'DISPUTE_RESOLUTION_PROPOSED',
    metadata: {
      disputeId,
      proposedBy: user.id,
      outcome: input.outcome,
      summary: input.summary.trim(),
    },
  })

  const evidence = await listEvidenceForDispute(disputeId)
  return {
    dispute: toPublicDispute(updated, evidence),
    notice:
      'Resolution proposal recorded. The counterparty must accept this proposal for work to resume or complete.',
  }
}

export async function acceptResolution(user, disputeId) {
  const dispute = await findDisputeById(disputeId)
  if (!dispute) throw notFound('Dispute not found.')

  const project = await findProjectById(dispute.project_id)
  const { isClient, isFreelancer } = assertParticipant(project, user)

  if (!isClient && !isFreelancer) {
    throw forbidden('Only the project client or freelancer can accept a resolution.')
  }

  if (dispute.status === 'RESOLVED') {
    throw conflict('Dispute is already resolved.')
  }

  if (!dispute.resolution_proposal) {
    throw conflict('No open resolution proposal exists for this dispute.')
  }

  const proposal =
    typeof dispute.resolution_proposal === 'string'
      ? JSON.parse(dispute.resolution_proposal)
      : dispute.resolution_proposal

  if (proposal.proposedBy === user.id) {
    throw forbidden(
      'You cannot accept your own resolution proposal. Resolution requires counterparty acceptance.',
    )
  }

  const milestone = await findMilestoneById(dispute.milestone_id)
  if (!milestone) throw notFound('Milestone not found.')

  const targetStatus = milestoneStatusForOutcome(proposal.outcome)

  const result = await withTransaction(async (client) => {
    const updated = await resolveDisputeWithOutcome(
      {
        id: disputeId,
        resolvedBy: user.id,
        resolutionType: 'MUTUAL_AGREEMENT',
        resolutionOutcome: proposal.outcome,
        resolutionSummary: proposal.summary,
      },
      client,
    )

    if (!updated) {
      throw conflict('Could not resolve dispute (it may have been resolved already).')
    }

    let currentMilestone = milestone
    if (milestone.status === 'DISPUTED') {
      currentMilestone = await applyMilestoneStatus(client, {
        milestone,
        project,
        user,
        toStatus: targetStatus,
        note: proposal.summary,
        isDisputeResolution: true,
      })
    }

    await insertAuditLog(
      {
        actorId: user.id,
        projectId: project.id,
        milestoneId: milestone.id,
        action: 'DISPUTE_RESOLVED',
        metadata: {
          disputeId,
          resolutionType: 'MUTUAL_AGREEMENT',
          outcome: proposal.outcome,
          summary: proposal.summary,
          proposedBy: proposal.proposedBy,
          acceptedBy: user.id,
          milestoneStatus: currentMilestone.status,
          fundsMovedByDecision: false,
        },
      },
      client,
    )

    return { dispute: updated, milestone: currentMilestone }
  })

  const evidence = await listEvidenceForDispute(disputeId)
  return {
    dispute: toPublicDispute(result.dispute, evidence),
    milestone: withAllowedTransitions(result.milestone),
    notice:
      'Dispute resolved by mutual agreement. This does not move escrow funds. Work may resume according to the agreed outcome.',
  }
}

export async function resolveDisputeByArbitrator(user, disputeId, input) {
  assertArbitrator(user)
  const dispute = await findDisputeById(disputeId)
  if (!dispute) throw notFound('Dispute not found.')

  const project = await findProjectById(dispute.project_id)
  assertParticipant(project, user)

  if (dispute.status === 'RESOLVED') {
    throw conflict('Dispute is already resolved.')
  }

  if (
    dispute.arbitrator_id &&
    dispute.arbitrator_id !== user.id
  ) {
    throw forbidden('Only the assigned arbitrator can resolve this dispute.')
  }

  const milestone = await findMilestoneById(dispute.milestone_id)
  if (!milestone) throw notFound('Milestone not found.')

  if (input.resolvePaymentId) {
    await assertPaymentBelongs(
      input.resolvePaymentId,
      project.id,
      milestone.id,
    )
  }

  const targetStatus = milestoneStatusForOutcome(input.outcome)
  const summary = input.summary.trim()

  const result = await withTransaction(async (client) => {
    let updated = await resolveDisputeWithOutcome(
      {
        id: disputeId,
        resolvedBy: user.id,
        resolutionType: 'ARBITRATOR_DECISION',
        resolutionOutcome: input.outcome,
        resolutionSummary: summary,
        arbitratorId: user.id,
      },
      client,
    )
    if (!updated) {
      throw conflict('Could not resolve dispute (state may have changed).')
    }

    if (input.resolvePaymentId) {
      updated = await linkPayment(
        disputeId,
        'resolve',
        input.resolvePaymentId,
        client,
      )
    }

    let currentMilestone = milestone
    if (milestone.status === 'DISPUTED') {
      currentMilestone = await applyMilestoneStatus(client, {
        milestone,
        project,
        user,
        toStatus: targetStatus,
        note: summary,
        isDisputeResolution: true,
      })
    }

    await insertAuditLog(
      {
        actorId: user.id,
        projectId: project.id,
        milestoneId: milestone.id,
        action: 'DISPUTE_RESOLVED',
        metadata: {
          disputeId,
          resolutionType: 'ARBITRATOR_DECISION',
          outcome: input.outcome,
          summary,
          arbitratorId: user.id,
          resolvePaymentId: input.resolvePaymentId ?? null,
          milestoneStatus: currentMilestone.status,
          fundsMovedByDecision: false,
        },
      },
      client,
    )

    return { dispute: updated, milestone: currentMilestone }
  })

  const evidence = await listEvidenceForDispute(disputeId)
  return {
    dispute: toPublicDispute(result.dispute, evidence),
    milestone: withAllowedTransitions(result.milestone),
    notice:
      'Arbitrator resolution recorded. This does not move escrow funds. Work may resume according to the recorded outcome.',
  }
}

