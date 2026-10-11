import { query, withTransaction } from '../../db/pool.js'

const PROJECT_COLUMNS = `
  p.id,
  p.title,
  p.description,
  p.client_id,
  p.freelancer_id,
  p.external_url,
  p.status,
  p.created_at,
  p.updated_at
`

const USER_SNIPPET = `
  json_build_object(
    'id', u.id,
    'name', u.name,
    'email', u.email,
    'role', u.role
  )
`

export async function insertProject(
  { title, description, clientId, externalUrl },
  client,
) {
  const runner = client ?? { query }
  const { rows } = await runner.query(
    `INSERT INTO projects (title, description, client_id, external_url, status)
     VALUES ($1, $2, $3, $4, 'DRAFT')
     RETURNING id, title, description, client_id, freelancer_id, external_url, status, created_at, updated_at`,
    [title, description ?? '', clientId, externalUrl ?? null],
  )
  return rows[0]
}

export async function findProjectById(id) {
  const { rows } = await query(
    `SELECT ${PROJECT_COLUMNS},
            ${USER_SNIPPET.replace(/u\./g, 'c.')} AS client,
            CASE
              WHEN f.id IS NULL THEN NULL
              ELSE ${USER_SNIPPET.replace(/u\./g, 'f.')}
            END AS freelancer
     FROM projects p
     JOIN users c ON c.id = p.client_id
     LEFT JOIN users f ON f.id = p.freelancer_id
     WHERE p.id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function listProjectsForUser(userId, { limit, offset }) {
  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM projects
     WHERE client_id = $1 OR freelancer_id = $1`,
    [userId],
  )

  const { rows } = await query(
    `SELECT ${PROJECT_COLUMNS},
            ${USER_SNIPPET.replace(/u\./g, 'c.')} AS client,
            CASE
              WHEN f.id IS NULL THEN NULL
              ELSE ${USER_SNIPPET.replace(/u\./g, 'f.')}
            END AS freelancer
     FROM projects p
     JOIN users c ON c.id = p.client_id
     LEFT JOIN users f ON f.id = p.freelancer_id
     WHERE p.client_id = $1 OR p.freelancer_id = $1
     ORDER BY p.updated_at DESC, p.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  )

  return {
    rows,
    total: countResult.rows[0]?.total ?? 0,
  }
}

export async function insertInvitation(
  {
    projectId,
    token,
    invitedEmail,
    invitedUserId = null,
    message = null,
    createdBy,
    expiresAt,
  },
  client,
) {
  const runner = client ?? { query }
  const { rows } = await runner.query(
    `INSERT INTO project_invitations
      (project_id, token, invited_email, invited_user_id, message, invited_role, status, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'FREELANCER', 'PENDING', $6, $7)
     RETURNING id, project_id, token, invited_email, invited_user_id, message, invited_role, status,
               created_by, accepted_by, accepted_at, rejected_by, rejected_at, revoked_at, expires_at, created_at`,
    [
      projectId,
      token,
      invitedEmail ?? null,
      invitedUserId ?? null,
      message ?? null,
      createdBy,
      expiresAt,
    ],
  )
  return rows[0]
}

export async function findInvitationByToken(token) {
  const { rows } = await query(
    `SELECT i.id, i.project_id, i.token, i.invited_email, i.invited_user_id, i.message, i.invited_role,
            i.status, i.created_by, i.accepted_by, i.accepted_at, i.rejected_by, i.rejected_at, i.revoked_at,
            i.expires_at, i.created_at,
            p.title AS project_title, p.status AS project_status, p.freelancer_id, p.client_id,
            c.name AS sender_name, c.email AS sender_email
     FROM project_invitations i
     JOIN projects p ON p.id = i.project_id
     JOIN users c ON c.id = p.client_id
     WHERE i.token = $1`,
    [token],
  )
  return rows[0] ?? null
}

export async function findInvitationById(id) {
  const { rows } = await query(
    `SELECT i.id, i.project_id, i.token, i.invited_email, i.invited_user_id, i.message, i.invited_role,
            i.status, i.created_by, i.accepted_by, i.accepted_at, i.rejected_by, i.rejected_at, i.revoked_at,
            i.expires_at, i.created_at,
            p.title AS project_title, p.status AS project_status, p.freelancer_id, p.client_id,
            c.name AS sender_name, c.email AS sender_email
     FROM project_invitations i
     JOIN projects p ON p.id = i.project_id
     JOIN users c ON c.id = p.client_id
     WHERE i.id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function listInvitationsForProject(projectId) {
  const { rows } = await query(
    `SELECT id, project_id, token, invited_email, invited_user_id, message, invited_role, status,
            created_by, accepted_by, accepted_at, rejected_by, rejected_at, revoked_at, expires_at, created_at
     FROM project_invitations
     WHERE project_id = $1
     ORDER BY created_at DESC`,
    [projectId],
  )
  return rows
}

export async function revokePendingInvitations(projectId, client) {
  const runner = client ?? { query }
  const { rows } = await runner.query(
    `UPDATE project_invitations
     SET status = 'REVOKED',
         revoked_at = NOW()
     WHERE project_id = $1 AND status = 'PENDING'
     RETURNING *`,
    [projectId],
  )
  return rows
}

export async function revokeInvitationById(invitationId, projectId, client) {
  const runner = client ?? { query }
  const { rows } = await runner.query(
    `UPDATE project_invitations
     SET status = 'REVOKED',
         revoked_at = NOW()
     WHERE id = $1 AND project_id = $2 AND status = 'PENDING'
     RETURNING *`,
    [invitationId, projectId],
  )
  return rows[0] ?? null
}

export async function rejectInvitationById({ invitationId, freelancerId }, client) {
  const runner = client ?? { query }
  const { rows } = await runner.query(
    `UPDATE project_invitations
     SET status = 'REJECTED',
         rejected_by = $2,
         rejected_at = NOW()
     WHERE id = $1 AND status = 'PENDING'
     RETURNING *`,
    [invitationId, freelancerId],
  )
  return rows[0] ?? null
}

export async function acceptInvitationAndAssignFreelancer({
  invitationId,
  projectId,
  freelancerId,
}) {
  return withTransaction(async (client) => {
    const inviteResult = await client.query(
      `UPDATE project_invitations
       SET status = 'ACCEPTED',
           accepted_by = $2,
           accepted_at = NOW()
       WHERE id = $1 AND status = 'PENDING'
       RETURNING *`,
      [invitationId, freelancerId],
    )
    if (inviteResult.rows.length === 0) {
      return null
    }

    const projectResult = await client.query(
      `UPDATE projects
       SET freelancer_id = $2,
           status = 'ACTIVE',
           updated_at = NOW()
       WHERE id = $1
         AND freelancer_id IS NULL
         AND client_id <> $2
       RETURNING id`,
      [projectId, freelancerId],
    )

    if (projectResult.rows.length === 0) {
      // Force rollback by throwing; caller maps to conflict.
      const err = new Error('PROJECT_SEAT_TAKEN')
      err.code = 'PROJECT_SEAT_TAKEN'
      throw err
    }

    return {
      invitation: inviteResult.rows[0],
      invitationId,
      projectId,
      freelancerId,
    }
  })
}

export function toPublicProject(row) {
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    externalUrl: row.external_url ?? null,
    status: row.status,
    clientId: row.client_id,
    freelancerId: row.freelancer_id ?? null,
    client: row.client ?? null,
    freelancer: row.freelancer ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toPublicInvitation(row) {
  if (!row) return null
  const expired =
    row.status === 'PENDING' &&
    row.expires_at &&
    new Date(row.expires_at).getTime() < Date.now()

  return {
    id: row.id,
    projectId: row.project_id,
    token: row.token,
    invitedEmail: row.invited_email ?? null,
    invitedUserId: row.invited_user_id ?? null,
    message: row.message ?? null,
    invitedRole: row.invited_role,
    status: expired ? 'EXPIRED' : row.status,
    createdBy: row.created_by,
    acceptedBy: row.accepted_by ?? null,
    acceptedAt: row.accepted_at ?? null,
    rejectedBy: row.rejected_by ?? null,
    rejectedAt: row.rejected_at ?? null,
    revokedAt: row.revoked_at ?? null,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}
