import { query, withTransaction } from '../../db/pool.js'

export async function insertAgreement(
  { projectId, version, terms, createdBy, supersedesId = null, status = 'PROPOSED' },
  client,
) {
  const runner = client ?? { query }
  const milestoneTerms = Array.isArray(terms?.milestones)
    ? terms.milestones
    : []
  const { rows } = await runner.query(
    `INSERT INTO agreements (
       project_id, version, terms, milestone_terms, status, created_by, supersedes_id
     ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
     RETURNING *`,
    [
      projectId,
      version,
      JSON.stringify(terms),
      JSON.stringify(milestoneTerms),
      status,
      createdBy,
      supersedesId,
    ],
  )
  return rows[0]
}

export async function findAgreementById(id) {
  const { rows } = await query(`SELECT * FROM agreements WHERE id = $1`, [id])
  return rows[0] ?? null
}

export async function listAgreementsForProject(projectId) {
  const { rows } = await query(
    `SELECT * FROM agreements
     WHERE project_id = $1
     ORDER BY version DESC`,
    [projectId],
  )
  return rows
}

export async function findActiveAgreement(projectId) {
  const { rows } = await query(
    `SELECT * FROM agreements
     WHERE project_id = $1 AND status = 'ACTIVE'
     LIMIT 1`,
    [projectId],
  )
  return rows[0] ?? null
}

export async function findProposedAgreement(projectId) {
  const { rows } = await query(
    `SELECT * FROM agreements
     WHERE project_id = $1 AND status = 'PROPOSED'
     LIMIT 1`,
    [projectId],
  )
  return rows[0] ?? null
}

export async function nextVersionNumber(projectId, client) {
  const runner = client ?? { query }
  const { rows } = await runner.query(
    `SELECT COALESCE(MAX(version), 0)::int AS max_version
     FROM agreements
     WHERE project_id = $1`,
    [projectId],
  )
  return rows[0].max_version + 1
}

export async function withdrawProposedAgreements(projectId, client) {
  const runner = client ?? { query }
  const { rows } = await runner.query(
    `UPDATE agreements
     SET status = 'WITHDRAWN'
     WHERE project_id = $1 AND status = 'PROPOSED'
     RETURNING id`,
    [projectId],
  )
  return rows
}

export async function insertAcceptance(
  { agreementId, userId, signatureRef = null },
  client,
) {
  const runner = client ?? { query }
  const { rows } = await runner.query(
    `INSERT INTO agreement_acceptances (agreement_id, user_id, signature_ref)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [agreementId, userId, signatureRef ?? null],
  )
  return rows[0]
}

export async function listAcceptances(agreementId) {
  const { rows } = await query(
    `SELECT a.id, a.agreement_id, a.user_id, a.accepted_at, a.signature_ref,
            u.name AS user_name, u.email AS user_email, u.role AS user_role
     FROM agreement_acceptances a
     JOIN users u ON u.id = a.user_id
     WHERE a.agreement_id = $1
     ORDER BY a.accepted_at ASC`,
    [agreementId],
  )
  return rows
}

export async function listAcceptancesForAgreements(agreementIds) {
  if (!agreementIds.length) return []
  const { rows } = await query(
    `SELECT a.id, a.agreement_id, a.user_id, a.accepted_at, a.signature_ref,
            u.name AS user_name, u.email AS user_email, u.role AS user_role
     FROM agreement_acceptances a
     JOIN users u ON u.id = a.user_id
     WHERE a.agreement_id = ANY($1::uuid[])
     ORDER BY a.accepted_at ASC`,
    [agreementIds],
  )
  return rows
}

export async function activateAgreement(agreementId, previousActiveId, client) {
  const runner = client ?? { query }

  if (previousActiveId) {
    await runner.query(
      `UPDATE agreements
       SET status = 'SUPERSEDED'
       WHERE id = $1 AND status = 'ACTIVE'`,
      [previousActiveId],
    )
  }

  const { rows } = await runner.query(
    `UPDATE agreements
     SET status = 'ACTIVE', activated_at = NOW()
     WHERE id = $1 AND status = 'PROPOSED'
     RETURNING *`,
    [agreementId],
  )
  return rows[0] ?? null
}

export { withTransaction }

export function toPublicAcceptance(row) {
  return {
    id: row.id,
    agreementId: row.agreement_id,
    userId: row.user_id,
    acceptedAt: row.accepted_at,
    signatureRef: row.signature_ref ?? null,
    user: {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
      role: row.user_role,
    },
  }
}

export function toPublicAgreement(row, acceptances = []) {
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    terms: row.terms,
    status: row.status,
    createdBy: row.created_by,
    supersedesId: row.supersedes_id ?? null,
    createdAt: row.created_at,
    activatedAt: row.activated_at ?? null,
    acceptances: acceptances.map(toPublicAcceptance),
    acceptanceNote:
      'Acceptance is recorded at the application level and does not by itself prove a cryptographic wallet signature.',
  }
}
