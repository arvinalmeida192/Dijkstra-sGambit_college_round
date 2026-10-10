import { query } from '../../db/pool.js'

function db(client) {
  return client ?? { query }
}

export async function getNextRevision(milestoneId, client) {
  const { rows } = await db(client).query(
    `SELECT COALESCE(MAX(revision), 0) + 1 AS next
     FROM submissions
     WHERE milestone_id = $1`,
    [milestoneId],
  )
  return Number(rows[0].next)
}

export async function insertSubmission(
  {
    milestoneId,
    projectId,
    agreementId = null,
    submittedBy,
    revision,
    notes = null,
    externalUrl = null,
    fileRef = null,
    originalFilename = null,
    contentType = null,
    byteSize = null,
    sha256Hash = null,
  },
  client,
) {
  const { rows } = await db(client).query(
    `INSERT INTO submissions (
       milestone_id, project_id, agreement_id, submitted_by, revision,
       notes, external_url, file_ref, original_filename, content_type,
       byte_size, sha256_hash
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11, $12
     )
     RETURNING *`,
    [
      milestoneId,
      projectId,
      agreementId,
      submittedBy,
      revision,
      notes,
      externalUrl,
      fileRef,
      originalFilename,
      contentType,
      byteSize,
      sha256Hash,
    ],
  )
  return rows[0]
}

export async function findSubmissionById(id, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM submissions WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function listSubmissionsForMilestone(milestoneId, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM submissions
     WHERE milestone_id = $1
     ORDER BY revision ASC`,
    [milestoneId],
  )
  return rows
}

export async function insertReview(
  { submissionId, milestoneId, reviewerId, decision, feedback = null },
  client,
) {
  const { rows } = await db(client).query(
    `INSERT INTO reviews (
       submission_id, milestone_id, reviewer_id, decision, feedback
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [submissionId, milestoneId, reviewerId, decision, feedback],
  )
  return rows[0]
}

export async function listReviewsForSubmission(submissionId, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM reviews
     WHERE submission_id = $1
     ORDER BY created_at ASC`,
    [submissionId],
  )
  return rows
}

export async function listReviewsForMilestone(milestoneId, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM reviews
     WHERE milestone_id = $1
     ORDER BY created_at ASC`,
    [milestoneId],
  )
  return rows
}

export async function insertAuditLog(
  {
    actorId = null,
    projectId = null,
    milestoneId = null,
    submissionId = null,
    action,
    metadata = {},
  },
  client,
) {
  const { rows } = await db(client).query(
    `INSERT INTO audit_logs (
       actor_id, project_id, milestone_id, submission_id, action, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [
      actorId,
      projectId,
      milestoneId,
      submissionId,
      action,
      JSON.stringify(metadata ?? {}),
    ],
  )
  return rows[0]
}

export function toPublicSubmission(row) {
  if (!row) return null
  return {
    id: row.id,
    milestoneId: row.milestone_id,
    projectId: row.project_id,
    agreementId: row.agreement_id ?? null,
    submittedBy: row.submitted_by,
    revision: row.revision,
    notes: row.notes ?? null,
    externalUrl: row.external_url ?? null,
    hasFile: Boolean(row.file_ref),
    originalFilename: row.original_filename ?? null,
    contentType: row.content_type ?? null,
    byteSize:
      row.byte_size == null
        ? null
        : typeof row.byte_size === 'string'
          ? Number(row.byte_size)
          : row.byte_size,
    sha256Hash: row.sha256_hash ?? null,
    submittedAt: row.submitted_at?.toISOString?.() ?? row.submitted_at,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  }
}

export function toPublicReview(row) {
  if (!row) return null
  return {
    id: row.id,
    submissionId: row.submission_id,
    milestoneId: row.milestone_id,
    reviewerId: row.reviewer_id,
    decision: row.decision,
    feedback: row.feedback ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  }
}

/** Internal use only — includes private file_ref for authorized download. */
export function getPrivateFileRef(row) {
  return row?.file_ref ?? null
}
