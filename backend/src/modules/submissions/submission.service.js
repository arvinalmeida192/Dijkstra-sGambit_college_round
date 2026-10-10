import {
  conflict,
  forbidden,
  notFound,
} from '../../utils/errors.js'
import { withTransaction } from '../../db/pool.js'
import { findAgreementById } from '../agreements/agreement.repository.js'
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
import {
  deletePrivateFile,
  readPrivateFile,
  storePrivateFile,
} from './submission.storage.js'
import {
  getNextRevision,
  getPrivateFileRef,
  insertAuditLog,
  insertReview,
  insertSubmission,
  findSubmissionById,
  listReviewsForMilestone,
  listReviewsForSubmission,
  listSubmissionsForMilestone,
  toPublicReview,
  toPublicSubmission,
} from './submission.repository.js'

const SUBMITTABLE_STATUSES = new Set([
  'IN_PROGRESS',
  'REVISION_REQUESTED',
  'OVERDUE',
])

function withAllowedTransitions(milestone) {
  return {
    ...toPublicMilestone(milestone),
    allowedTransitions: listAllowedTransitions(milestone.status),
  }
}

async function applyMilestoneTransition(client, {
  milestone,
  project,
  user,
  toStatus,
  note,
}) {
  const actorRole = resolveActorRole(project, user)
  assertMilestoneTransition({
    fromStatus: milestone.status,
    toStatus,
    actorRole,
    context: { hasFreelancer: Boolean(project.freelancer_id) },
  })

  const effects = transitionSideEffects(toStatus, milestone)
  const patch = { status: effects.status }
  if (note !== undefined) patch.statusNote = note ?? null
  if (effects.submittedAt !== undefined) patch.submittedAt = effects.submittedAt
  if (effects.reviewStartedAt !== undefined) {
    patch.reviewStartedAt = effects.reviewStartedAt
  }
  if (effects.reviewDueAt !== undefined) patch.reviewDueAt = effects.reviewDueAt
  if (effects.approvedAt !== undefined) patch.approvedAt = effects.approvedAt

  // applyStatusPatch uses pool.query — for transactional consistency, inline update.
  const sets = ['status = $2', 'updated_at = NOW()']
  const values = [milestone.id, patch.status]
  let i = 3

  if (Object.prototype.hasOwnProperty.call(patch, 'statusNote')) {
    sets.push(`status_note = $${i++}`)
    values.push(patch.statusNote)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'submittedAt')) {
    sets.push(`submitted_at = $${i++}`)
    values.push(patch.submittedAt)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'reviewStartedAt')) {
    sets.push(`review_started_at = $${i++}`)
    values.push(patch.reviewStartedAt)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'reviewDueAt')) {
    sets.push(`review_due_at = $${i++}`)
    values.push(patch.reviewDueAt)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'approvedAt')) {
    sets.push(`approved_at = $${i++}`)
    values.push(patch.approvedAt)
  }

  const { rows } = await client.query(
    `UPDATE milestones SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  )
  return rows[0]
}

/**
 * When approving or requesting revision from SUBMITTED, move through IN_REVIEW
 * first so the shared state machine stays authoritative.
 */
async function moveToReviewDecision(client, {
  milestone,
  project,
  user,
  decision,
  feedback,
}) {
  let current = milestone

  if (current.status === 'SUBMITTED') {
    current = await applyMilestoneTransition(client, {
      milestone: current,
      project,
      user,
      toStatus: 'IN_REVIEW',
    })
  }

  if (decision === 'START_REVIEW') {
    if (milestone.status !== 'SUBMITTED' && current.status !== 'IN_REVIEW') {
      throw conflict('START_REVIEW requires a SUBMITTED milestone.')
    }
    return current
  }

  const toStatus =
    decision === 'APPROVED' ? 'APPROVED' : 'REVISION_REQUESTED'

  return applyMilestoneTransition(client, {
    milestone: current,
    project,
    user,
    toStatus,
    note: feedback ?? null,
  })
}

export async function listSubmissions(user, milestoneId) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')

  const project = await findProjectById(milestone.project_id)
  assertParticipant(project, user)

  const [submissions, reviews] = await Promise.all([
    listSubmissionsForMilestone(milestoneId),
    listReviewsForMilestone(milestoneId),
  ])

  const reviewsBySubmission = new Map()
  for (const review of reviews) {
    const list = reviewsBySubmission.get(review.submission_id) ?? []
    list.push(toPublicReview(review))
    reviewsBySubmission.set(review.submission_id, list)
  }

  return {
    milestone: withAllowedTransitions(milestone),
    submissions: submissions.map((row) => ({
      ...toPublicSubmission(row),
      reviews: reviewsBySubmission.get(row.id) ?? [],
    })),
  }
}

export async function getSubmission(user, submissionId) {
  const submission = await findSubmissionById(submissionId)
  if (!submission) throw notFound('Submission not found.')

  const project = await findProjectById(submission.project_id)
  assertParticipant(project, user)

  const reviews = await listReviewsForSubmission(submissionId)
  return {
    submission: {
      ...toPublicSubmission(submission),
      reviews: reviews.map(toPublicReview),
    },
  }
}

export async function createSubmission(user, milestoneId, input, file) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')

  const project = await findProjectById(milestone.project_id)
  assertParticipant(project, user)

  if (project.freelancer_id !== user.id) {
    throw forbidden('Only the assigned freelancer can submit deliverables.')
  }

  if (project.status === 'CANCELLED' || project.status === 'COMPLETED') {
    throw conflict(
      `Cannot submit on a ${project.status.toLowerCase()} project.`,
    )
  }

  if (!SUBMITTABLE_STATUSES.has(milestone.status)) {
    throw conflict(
      `Cannot create a submission while the milestone is ${milestone.status}.`,
    )
  }

  // Reject any client-supplied hash field — hash comes from file bytes only.
  if (input.sha256Hash != null) {
    throw conflict(
      'Client-supplied sha256Hash is not accepted. The server hashes uploaded file bytes.',
    )
  }

  let agreementId = input.agreementId ?? milestone.agreement_id ?? null
  if (input.agreementId) {
    const agreement = await findAgreementById(input.agreementId)
    if (!agreement || agreement.project_id !== milestone.project_id) {
      throw conflict('agreementId must reference an agreement on this project.')
    }
    agreementId = agreement.id
  }

  const notes = input.notes?.trim() ? input.notes.trim() : null
  const externalUrl = input.externalUrl?.trim()
    ? input.externalUrl.trim()
    : null

  let stored = null
  if (file?.buffer) {
    stored = await storePrivateFile({
      buffer: file.buffer,
      milestoneId,
      originalFilename: file.originalname,
      contentType: file.mimetype,
    })
  }

  if (!stored && !externalUrl && !notes) {
    throw conflict(
      'Provide a file upload, externalUrl, and/or notes for the submission.',
    )
  }

  try {
    const result = await withTransaction(async (client) => {
      const revision = await getNextRevision(milestoneId, client)
      const row = await insertSubmission(
        {
          milestoneId,
          projectId: milestone.project_id,
          agreementId,
          submittedBy: user.id,
          revision,
          notes,
          externalUrl,
          fileRef: stored?.fileRef ?? null,
          originalFilename: stored?.originalFilename ?? null,
          contentType: stored?.contentType ?? null,
          byteSize: stored?.byteSize ?? null,
          sha256Hash: stored?.sha256Hash ?? null,
        },
        client,
      )

      const updatedMilestone = await applyMilestoneTransition(client, {
        milestone,
        project,
        user,
        toStatus: 'SUBMITTED',
        note: notes,
      })

      await insertAuditLog(
        {
          actorId: user.id,
          projectId: milestone.project_id,
          milestoneId,
          submissionId: row.id,
          action: 'SUBMISSION_CREATED',
          metadata: {
            revision,
            hasFile: Boolean(stored),
            sha256Hash: stored?.sha256Hash ?? null,
            externalUrl: externalUrl ? true : false,
          },
        },
        client,
      )

      return { row, updatedMilestone }
    })

    return {
      submission: toPublicSubmission(result.row),
      milestone: withAllowedTransitions(result.updatedMilestone),
    }
  } catch (err) {
    if (stored?.fileRef) {
      await deletePrivateFile(stored.fileRef)
    }
    throw err
  }
}

export async function reviewSubmission(user, submissionId, input) {
  const submission = await findSubmissionById(submissionId)
  if (!submission) throw notFound('Submission not found.')

  const milestone = await findMilestoneById(submission.milestone_id)
  if (!milestone) throw notFound('Milestone not found.')

  const project = await findProjectById(submission.project_id)
  assertParticipant(project, user)

  if (project.client_id !== user.id) {
    throw forbidden('Only the project client can review submissions.')
  }

  if (project.status === 'CANCELLED') {
    throw conflict('Cannot review submissions on a cancelled project.')
  }

  if (!['SUBMITTED', 'IN_REVIEW'].includes(milestone.status)) {
    throw conflict(
      `Cannot review while the milestone is ${milestone.status}.`,
    )
  }

  // Only the latest revision is actionable.
  const all = await listSubmissionsForMilestone(submission.milestone_id)
  const latest = all[all.length - 1]
  if (!latest || latest.id !== submission.id) {
    throw conflict('Only the latest submission revision can be reviewed.')
  }

  if (input.decision === 'START_REVIEW' && milestone.status === 'IN_REVIEW') {
    throw conflict('Milestone is already in review.')
  }

  if (
    input.decision === 'APPROVED' &&
    resolveActorRole(project, user) === 'FREELANCER'
  ) {
    throw forbidden('Freelancers cannot approve their own submission.')
  }

  if (input.decision === 'REVISION_REQUESTED') {
    const previousReviews = await listReviewsForMilestone(milestone.id)
    const revisionRequests = previousReviews.filter(
      (r) => r.decision === 'REVISION_REQUESTED',
    )
    const maxRevisions = milestone.max_revisions ?? 3
    if (revisionRequests.length >= maxRevisions) {
      throw conflict(
        `Maximum revision limit (${maxRevisions} rounds) reached. At this limit, you may only Approve or Open dispute.`,
      )
    }

    if (!input.unmetCriteria || input.unmetCriteria.length === 0) {
      throw conflict(
        'At least one specific unmet acceptance criterion must be specified when requesting a revision.',
      )
    }

    const criteriaLines = String(milestone.acceptance_criteria ?? '')
      .split(/\r?\n|;/)
      .map((s) => s.trim())
      .filter(Boolean)
    const normalized = new Set(criteriaLines.map((s) => s.toLowerCase()))
    // If criteria are a single paragraph, allow selecting that whole text.
    if (normalized.size === 0 && milestone.acceptance_criteria?.trim()) {
      normalized.add(milestone.acceptance_criteria.trim().toLowerCase())
    }
    for (const item of input.unmetCriteria) {
      if (!normalized.has(String(item).trim().toLowerCase())) {
        throw conflict(
          'unmetCriteria must reference specific acceptance criteria from the milestone.',
        )
      }
    }
  }

  const feedback =
    input.feedback?.trim() ? input.feedback.trim() : null
  const unmetCriteria = input.unmetCriteria ?? []

  const result = await withTransaction(async (client) => {
    const updatedMilestone = await moveToReviewDecision(client, {
      milestone,
      project,
      user,
      decision: input.decision,
      feedback,
    })

    const review = await insertReview(
      {
        submissionId: submission.id,
        milestoneId: milestone.id,
        reviewerId: user.id,
        decision: input.decision,
        feedback,
        unmetCriteria,
      },
      client,
    )

    await insertAuditLog(
      {
        actorId: user.id,
        projectId: project.id,
        milestoneId: milestone.id,
        submissionId: submission.id,
        action: 'SUBMISSION_REVIEWED',
        metadata: {
          decision: input.decision,
          revision: submission.revision,
          milestoneStatus: updatedMilestone.status,
          unmetCriteria,
        },
      },
      client,
    )

    if (input.decision === 'REVISION_REQUESTED') {
      const allReviews = await listReviewsForMilestone(milestone.id, client)
      const totalRevisions = allReviews.filter(
        (r) => r.decision === 'REVISION_REQUESTED',
      ).length
      const maxRevisions = milestone.max_revisions ?? 3
      if (totalRevisions >= maxRevisions) {
        await insertAuditLog(
          {
            actorId: user.id,
            projectId: project.id,
            milestoneId: milestone.id,
            submissionId: submission.id,
            action: 'REVISION_LIMIT_REACHED',
            metadata: {
              maxRevisions,
              totalRevisions,
            },
          },
          client,
        )
      }
    }

    return { review, updatedMilestone }
  })

  return {
    review: toPublicReview(result.review),
    submission: toPublicSubmission(submission),
    milestone: withAllowedTransitions(result.updatedMilestone),
  }
}

/**
 * Stream private file bytes to an authorized participant.
 * Does not expose the storage path.
 */
export async function downloadSubmissionFile(user, submissionId) {
  const submission = await findSubmissionById(submissionId)
  if (!submission) throw notFound('Submission not found.')

  const project = await findProjectById(submission.project_id)
  assertParticipant(project, user)

  const fileRef = getPrivateFileRef(submission)
  if (!fileRef) {
    throw notFound('This submission has no private file.')
  }

  const buffer = await readPrivateFile(fileRef)
  return {
    buffer,
    contentType: submission.content_type || 'application/octet-stream',
    filename: submission.original_filename || 'deliverable',
    sha256Hash: submission.sha256_hash,
  }
}
