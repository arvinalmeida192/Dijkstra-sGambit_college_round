import { query } from '../../db/pool.js'

function db(client) {
  return client ?? { query }
}

export async function insertAssessment(
  {
    kind,
    status,
    projectId,
    milestoneId = null,
    submissionId = null,
    disputeId = null,
    deliverableType = null,
    provider = 'ollama',
    modelPrimary = null,
    modelSecondary = null,
    compareMode = false,
    result = {},
    advisoryNotice,
    errorMessage = null,
    createdBy = null,
  },
  client,
) {
  const { rows } = await db(client).query(
    `INSERT INTO ai_assessments (
       kind, status, project_id, milestone_id, submission_id, dispute_id,
       deliverable_type, provider, model_primary, model_secondary, compare_mode,
       result, advisory_notice, error_message, created_by
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11,
       $12::jsonb, $13, $14, $15
     )
     RETURNING *`,
    [
      kind,
      status,
      projectId,
      milestoneId,
      submissionId,
      disputeId,
      deliverableType,
      provider,
      modelPrimary,
      modelSecondary,
      compareMode,
      JSON.stringify(result ?? {}),
      advisoryNotice,
      errorMessage,
      createdBy,
    ],
  )
  return rows[0]
}

export async function findAssessmentById(id) {
  const { rows } = await query(`SELECT * FROM ai_assessments WHERE id = $1`, [
    id,
  ])
  return rows[0] ?? null
}

export async function listAssessmentsForSubmission(submissionId) {
  const { rows } = await query(
    `SELECT * FROM ai_assessments
     WHERE submission_id = $1
     ORDER BY created_at DESC`,
    [submissionId],
  )
  return rows
}

export async function listAssessmentsForMilestone(milestoneId) {
  const { rows } = await query(
    `SELECT * FROM ai_assessments
     WHERE milestone_id = $1
     ORDER BY created_at DESC`,
    [milestoneId],
  )
  return rows
}

export async function listAssessmentsForDispute(disputeId) {
  const { rows } = await query(
    `SELECT * FROM ai_assessments
     WHERE dispute_id = $1
     ORDER BY created_at DESC`,
    [disputeId],
  )
  return rows
}

export async function latestAssessmentForSubmission(submissionId) {
  const { rows } = await query(
    `SELECT * FROM ai_assessments
     WHERE submission_id = $1 AND kind = 'ACCEPTANCE_CRITERIA'
     ORDER BY created_at DESC
     LIMIT 1`,
    [submissionId],
  )
  return rows[0] ?? null
}

export async function latestAssessmentForDispute(disputeId) {
  const { rows } = await query(
    `SELECT * FROM ai_assessments
     WHERE dispute_id = $1 AND kind = 'DISPUTE_EVIDENCE_SUMMARY'
     ORDER BY created_at DESC
     LIMIT 1`,
    [disputeId],
  )
  return rows[0] ?? null
}

export function toPublicAssessment(row) {
  if (!row) return null
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    projectId: row.project_id,
    milestoneId: row.milestone_id ?? null,
    submissionId: row.submission_id ?? null,
    disputeId: row.dispute_id ?? null,
    deliverableType: row.deliverable_type ?? null,
    provider: row.provider,
    modelPrimary: row.model_primary ?? null,
    modelSecondary: row.model_secondary ?? null,
    compareMode: Boolean(row.compare_mode),
    result: row.result ?? {},
    advisoryNotice: row.advisory_notice,
    errorMessage: row.error_message ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    advisoryOnly: true,
    canApproveMilestone: false,
    canDecideDispute: false,
    canAuthorizePayment: false,
  }
}
