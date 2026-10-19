import { query } from '../../db/pool.js'

function db(client) {
  return client ?? { query }
}

export async function findDisputeById(id, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM disputes WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function findOpenDisputeForMilestone(milestoneId, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM disputes
     WHERE milestone_id = $1 AND status IN ('OPEN', 'UNDER_REVIEW')
     LIMIT 1`,
    [milestoneId],
  )
  return rows[0] ?? null
}

export async function listDisputesForProject(projectId) {
  const { rows } = await query(
    `SELECT * FROM disputes
     WHERE project_id = $1
     ORDER BY created_at DESC`,
    [projectId],
  )
  return rows
}

export async function insertDispute(
  {
    projectId,
    milestoneId,
    openedBy,
    reason,
    claimSummary,
    disputedCriteriaRefs = [],
    evidenceSubmissionId = null,
    verificationRunId = null,
    escalationDueAt = null,
  },
  client,
) {
  const { rows } = await db(client).query(
    `INSERT INTO disputes (
       project_id, milestone_id, opened_by, reason, claim_summary, status,
       disputed_criteria_refs, evidence_submission_id, verification_run_id, escalation_due_at
     ) VALUES ($1, $2, $3, $4, $5, 'OPEN', $6::jsonb, $7, $8, $9)
     RETURNING *`,
    [
      projectId,
      milestoneId,
      openedBy,
      reason,
      claimSummary ?? null,
      JSON.stringify(Array.isArray(disputedCriteriaRefs) ? disputedCriteriaRefs : []),
      evidenceSubmissionId ?? null,
      verificationRunId ?? null,
      escalationDueAt ?? null,
    ],
  )
  return rows[0]
}

export async function escalateDispute(id, arbitratorId = null, client) {
  const { rows } = await db(client).query(
    `UPDATE disputes
     SET status = 'UNDER_REVIEW',
         arbitrator_id = COALESCE(arbitrator_id, $2),
         escalated_at = COALESCE(escalated_at, NOW()),
         updated_at = NOW()
     WHERE id = $1 AND status = 'OPEN'
     RETURNING *`,
    [id, arbitratorId],
  )
  return rows[0] ?? null
}

export async function claimDispute(id, arbitratorId, client) {
  const { rows } = await db(client).query(
    `UPDATE disputes
     SET status = 'UNDER_REVIEW',
         arbitrator_id = $2,
         updated_at = NOW()
     WHERE id = $1 AND status IN ('OPEN', 'UNDER_REVIEW')
     RETURNING *`,
    [id, arbitratorId],
  )
  return rows[0] ?? null
}

export async function resolveDispute(
  {
    id,
    arbitratorId,
    decision,
    rationale,
    splitReleaseToFreelancer,
  },
  client,
) {
  const { rows } = await db(client).query(
    `UPDATE disputes
     SET status = 'RESOLVED',
         arbitrator_id = $2,
         decision = $3,
         decision_rationale = $4,
         split_release_to_freelancer = $5,
         resolved_by = COALESCE($2, resolved_by),
         resolution_type = 'ARBITRATOR_DECISION',
         resolution_summary = $4,
         resolved_at = NOW(),
         decided_at = NOW(),
         updated_at = NOW()
     WHERE id = $1 AND status IN ('OPEN', 'UNDER_REVIEW')
     RETURNING *`,
    [
      id,
      arbitratorId,
      decision,
      rationale,
      splitReleaseToFreelancer ?? null,
    ],
  )
  return rows[0] ?? null
}

export async function setResolutionProposal(id, proposal, client) {
  const { rows } = await db(client).query(
    `UPDATE disputes
     SET resolution_proposal = $2,
         updated_at = NOW()
     WHERE id = $1 AND status IN ('OPEN', 'UNDER_REVIEW')
     RETURNING *`,
    [id, proposal ? JSON.stringify(proposal) : null],
  )
  return rows[0] ?? null
}

export async function resolveDisputeWithOutcome(
  {
    id,
    resolvedBy,
    resolutionType,
    resolutionOutcome,
    resolutionSummary,
    arbitratorId = null,
  },
  client,
) {
  const { rows } = await db(client).query(
    `UPDATE disputes
     SET status = 'RESOLVED',
         resolved_by = $2,
         resolution_type = $3,
         resolution_outcome = $4,
         resolution_summary = $5,
         resolved_at = NOW(),
         resolution_proposal = NULL,
         arbitrator_id = COALESCE($6, arbitrator_id),
         updated_at = NOW()
     WHERE id = $1 AND status IN ('OPEN', 'UNDER_REVIEW')
     RETURNING *`,
    [
      id,
      resolvedBy,
      resolutionType,
      resolutionOutcome,
      resolutionSummary,
      arbitratorId,
    ],
  )
  return rows[0] ?? null
}

export async function linkPayment(id, field, paymentId, client) {
  const column =
    field === 'open' ? 'open_payment_id' : 'resolve_payment_id'
  const { rows } = await db(client).query(
    `UPDATE disputes
     SET ${column} = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, paymentId],
  )
  return rows[0] ?? null
}

export async function insertEvidence(
  {
    disputeId,
    uploadedBy,
    notes,
    externalUrl,
    fileRef,
    originalFilename,
    contentType,
    byteSize,
    sha256Hash,
  },
  client,
) {
  const { rows } = await db(client).query(
    `INSERT INTO dispute_evidence (
       dispute_id, uploaded_by, notes, external_url,
       file_ref, original_filename, content_type, byte_size, sha256_hash
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      disputeId,
      uploadedBy,
      notes ?? null,
      externalUrl ?? null,
      fileRef ?? null,
      originalFilename ?? null,
      contentType ?? null,
      byteSize ?? null,
      sha256Hash ?? null,
    ],
  )
  return rows[0]
}

export async function listEvidenceForDispute(disputeId) {
  const { rows } = await query(
    `SELECT * FROM dispute_evidence
     WHERE dispute_id = $1
     ORDER BY created_at ASC`,
    [disputeId],
  )
  return rows
}

export async function findEvidenceById(id) {
  const { rows } = await query(
    `SELECT * FROM dispute_evidence WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export function toPublicEvidence(row) {
  if (!row) return null
  return {
    id: row.id,
    disputeId: row.dispute_id,
    uploadedBy: row.uploaded_by,
    notes: row.notes,
    externalUrl: row.external_url,
    hasFile: Boolean(row.file_ref),
    originalFilename: row.original_filename,
    contentType: row.content_type,
    byteSize: row.byte_size != null ? Number(row.byte_size) : null,
    sha256Hash: row.sha256_hash,
    createdAt: row.created_at,
  }
}

export function toPublicDispute(row, evidence = undefined) {
  if (!row) return null
  const base = {
    id: row.id,
    projectId: row.project_id,
    milestoneId: row.milestone_id,
    openedBy: row.opened_by,
    reason: row.reason,
    claimSummary: row.claim_summary,
    status: row.status,
    arbitratorId: row.arbitrator_id,
    decision: row.decision,
    decisionRationale: row.decision_rationale,
    splitReleaseToFreelancer:
      row.split_release_to_freelancer != null
        ? Number(row.split_release_to_freelancer)
        : null,
    decidedAt: row.decided_at,
    openPaymentId: row.open_payment_id,
    resolvePaymentId: row.resolve_payment_id,
    resolutionType: row.resolution_type ?? null,
    resolutionOutcome: row.resolution_outcome ?? null,
    resolutionSummary: row.resolution_summary ?? null,
    resolvedBy: row.resolved_by ?? null,
    resolvedAt: row.resolved_at ?? null,
    resolutionProposal:
      row.resolution_proposal != null
        ? typeof row.resolution_proposal === 'string'
          ? JSON.parse(row.resolution_proposal)
          : row.resolution_proposal
        : null,
    disputedCriteriaRefs:
      row.disputed_criteria_refs != null
        ? typeof row.disputed_criteria_refs === 'string'
          ? JSON.parse(row.disputed_criteria_refs)
          : row.disputed_criteria_refs
        : [],
    evidenceSubmissionId: row.evidence_submission_id ?? null,
    verificationRunId: row.verification_run_id ?? null,
    escalationDueAt: row.escalation_due_at ?? null,
    escalatedAt: row.escalated_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    /**
     * Application decision only. On-chain release/refund requires a separate
     * verified escrow transaction (see payments API).
     */
    fundsMovedByDecision: false,
  }
  if (evidence !== undefined) {
    base.evidence = evidence.map(toPublicEvidence)
  }
  return base
}
