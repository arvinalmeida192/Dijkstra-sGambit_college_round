import { query } from '../../db/pool.js'

function db(client) {
  return client ?? { query }
}

export async function ensureActiveVerifierKey(
  { verifierAddress, label = 'Default System Verifier' },
  client,
) {
  const addr = String(verifierAddress).toLowerCase()
  const { rows } = await db(client).query(
    `INSERT INTO verifier_keys (verifier_address, label, status)
     VALUES ($1, $2, 'ACTIVE')
     ON CONFLICT (verifier_address) DO NOTHING
     RETURNING *`,
    [addr, label],
  )
  if (rows[0]) return rows[0]

  const existing = await db(client).query(
    `SELECT * FROM verifier_keys WHERE verifier_address = $1`,
    [addr],
  )
  return existing.rows[0] ?? null
}

export async function listActiveVerifierAddresses(client) {
  const { rows } = await db(client).query(
    `SELECT verifier_address FROM verifier_keys WHERE status = 'ACTIVE'`,
  )
  return rows.map((r) => String(r.verifier_address).toLowerCase())
}

export async function setVerifierKeyStatus(
  { verifierAddress, status, label },
  client,
) {
  const addr = String(verifierAddress).toLowerCase()
  const { rows } = await db(client).query(
    `INSERT INTO verifier_keys (verifier_address, label, status, revoked_at)
     VALUES ($1, COALESCE($2, 'Verifier'), $3, CASE WHEN $3 = 'REVOKED' THEN now() ELSE NULL END)
     ON CONFLICT (verifier_address)
     DO UPDATE SET
       status = $3,
       label = COALESCE($2, verifier_keys.label),
       revoked_at = CASE WHEN $3 = 'REVOKED' THEN now() ELSE NULL END
     RETURNING *`,
    [addr, label ?? null, status],
  )
  return rows[0]
}

export async function insertVerificationRun(
  {
    milestoneId,
    submissionId,
    agreementId = null,
    agreementVersion = 1,
    verificationMethod,
    criteriaHash,
    artifactHash,
    outcome,
    checksExecuted = [],
    summary,
    errorDetails = null,
    executedBy = null,
    durationMs = 0,
  },
  client,
) {
  const { rows } = await db(client).query(
    `INSERT INTO verification_runs (
       milestone_id, submission_id, agreement_id, agreement_version,
       verification_method, criteria_hash, artifact_hash, outcome,
       checks_executed, summary, error_details, executed_by, duration_ms
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
     RETURNING *`,
    [
      milestoneId,
      submissionId,
      agreementId,
      Number(agreementVersion ?? 1),
      verificationMethod,
      criteriaHash,
      artifactHash,
      outcome,
      JSON.stringify(checksExecuted ?? []),
      summary,
      errorDetails,
      executedBy,
      Number(durationMs ?? 0),
    ],
  )
  return rows[0]
}

export async function findVerificationRunById(id, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM verification_runs WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function listVerificationRunsForMilestone(milestoneId, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM verification_runs
     WHERE milestone_id = $1
     ORDER BY created_at DESC`,
    [milestoneId],
  )
  return rows
}

export async function listVerificationRunsForSubmission(submissionId, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM verification_runs
     WHERE submission_id = $1
     ORDER BY created_at DESC`,
    [submissionId],
  )
  return rows
}

export async function findLatestVerificationRunForMilestone(milestoneId, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM verification_runs
     WHERE milestone_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [milestoneId],
  )
  return rows[0] ?? null
}

export async function insertVerificationAttestation(
  {
    verificationRunId,
    milestoneId,
    submissionId,
    chainId,
    escrowAddress,
    onChainAgreementId = 0,
    onChainMilestoneId = 0,
    agreementVersion = 1,
    criteriaHash,
    artifactHash,
    outcome = 1,
    nonce,
    issuedAt,
    expiresAt,
    verifierAddress,
    domainSeparator,
    structHash,
    signature,
    status = 'ISSUED',
  },
  client,
) {
  const { rows } = await db(client).query(
    `INSERT INTO verification_attestations (
       verification_run_id, milestone_id, submission_id,
       chain_id, escrow_address, on_chain_agreement_id, on_chain_milestone_id,
       agreement_version, criteria_hash, artifact_hash, outcome,
       nonce, issued_at, expires_at, verifier_address,
       domain_separator, struct_hash, signature, status
     ) VALUES (
       $1, $2, $3,
       $4, $5, $6, $7,
       $8, $9, $10, $11,
       $12, $13, $14, $15,
       $16, $17, $18, $19
     )
     RETURNING *`,
    [
      verificationRunId,
      milestoneId,
      submissionId,
      Number(chainId),
      String(escrowAddress).toLowerCase(),
      Number(onChainAgreementId ?? 0),
      Number(onChainMilestoneId ?? 0),
      Number(agreementVersion ?? 1),
      criteriaHash,
      artifactHash,
      Number(outcome),
      nonce,
      Number(issuedAt),
      Number(expiresAt),
      String(verifierAddress).toLowerCase(),
      domainSeparator,
      structHash,
      signature,
      status,
    ],
  )
  return rows[0]
}

export async function findLatestAttestationForMilestone(milestoneId, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM verification_attestations
     WHERE milestone_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [milestoneId],
  )
  return rows[0] ?? null
}

export async function findAttestationById(id, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM verification_attestations WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function updateAttestationStatus(
  id,
  {
    status,
    onChainTxHash,
    releaseTxHash,
    onChainAgreementId,
    onChainMilestoneId,
    chainId,
    escrowAddress,
    nonce,
    issuedAt,
    expiresAt,
    domainSeparator,
    structHash,
    signature,
  },
  client,
) {
  const { rows } = await db(client).query(
    `UPDATE verification_attestations
     SET
       status = COALESCE($2, status),
       on_chain_tx_hash = COALESCE($3, on_chain_tx_hash),
       release_tx_hash = COALESCE($4, release_tx_hash),
       on_chain_agreement_id = COALESCE($5, on_chain_agreement_id),
       on_chain_milestone_id = COALESCE($6, on_chain_milestone_id),
       chain_id = COALESCE($7, chain_id),
       escrow_address = COALESCE($8, escrow_address),
       nonce = COALESCE($9, nonce),
       issued_at = COALESCE($10, issued_at),
       expires_at = COALESCE($11, expires_at),
       domain_separator = COALESCE($12, domain_separator),
       struct_hash = COALESCE($13, struct_hash),
       signature = COALESCE($14, signature),
       revoked_at = CASE WHEN $2 = 'REVOKED' THEN now() ELSE revoked_at END
     WHERE id = $1
     RETURNING *`,
    [
      id,
      status ?? null,
      onChainTxHash ?? null,
      releaseTxHash ?? null,
      onChainAgreementId != null ? Number(onChainAgreementId) : null,
      onChainMilestoneId != null ? Number(onChainMilestoneId) : null,
      chainId != null ? Number(chainId) : null,
      escrowAddress ? String(escrowAddress).toLowerCase() : null,
      nonce ?? null,
      issuedAt != null ? Number(issuedAt) : null,
      expiresAt != null ? Number(expiresAt) : null,
      domainSeparator ?? null,
      structHash ?? null,
      signature ?? null,
    ],
  )
  return rows[0] ?? null
}

export function toPublicVerificationRun(row) {
  if (!row) return null
  return {
    id: row.id,
    milestoneId: row.milestone_id,
    submissionId: row.submission_id,
    agreementId: row.agreement_id ?? null,
    agreementVersion: Number(row.agreement_version ?? 1),
    verificationMethod: row.verification_method,
    criteriaHash: row.criteria_hash,
    artifactHash: row.artifact_hash,
    outcome: row.outcome,
    checksExecuted: Array.isArray(row.checks_executed)
      ? row.checks_executed
      : typeof row.checks_executed === 'string'
        ? JSON.parse(row.checks_executed)
        : [],
    summary: row.summary,
    errorDetails: row.error_details ?? null,
    executedBy: row.executed_by ?? null,
    durationMs: Number(row.duration_ms ?? 0),
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  }
}

export function toPublicAttestation(row) {
  if (!row) return null
  return {
    id: row.id,
    verificationRunId: row.verification_run_id,
    milestoneId: row.milestone_id,
    submissionId: row.submission_id,
    chainId: Number(row.chain_id),
    escrowAddress: row.escrow_address,
    onChainAgreementId: Number(row.on_chain_agreement_id ?? 0),
    onChainMilestoneId: Number(row.on_chain_milestone_id ?? 0),
    agreementVersion: Number(row.agreement_version ?? 1),
    criteriaHash: row.criteria_hash,
    artifactHash: row.artifact_hash,
    outcome: Number(row.outcome),
    nonce: row.nonce,
    issuedAt: Number(row.issued_at),
    expiresAt: Number(row.expires_at),
    verifierAddress: row.verifier_address,
    domainSeparator: row.domain_separator,
    structHash: row.struct_hash,
    signature: row.signature,
    status: row.status,
    onChainTxHash: row.on_chain_tx_hash ?? null,
    releaseTxHash: row.release_tx_hash ?? null,
    revokedAt: row.revoked_at?.toISOString?.() ?? row.revoked_at ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  }
}
