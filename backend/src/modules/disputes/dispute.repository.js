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
  },
  client,
) {
  const { rows } = await db(client).query(
    `INSERT INTO disputes (
       project_id, milestone_id, opened_by, reason, claim_summary, status
     ) VALUES ($1, $2, $3, $4, $5, 'OPEN')
     RETURNING *`,
    [projectId, milestoneId, openedBy, reason, claimSummary ?? null],
  )
  return rows[0]
}

export async function claimDispute(id, arbitratorId, client) {
  const { rows } = await db(client).query(
    `UPDATE disputes
     SET status = 'UNDER_REVIEW',
         arbitrator_id = $2,
         updated_at = NOW()
     WHERE id = $1 AND status = 'OPEN'
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
