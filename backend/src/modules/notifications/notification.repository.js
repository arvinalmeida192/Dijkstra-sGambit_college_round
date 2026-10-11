import { query } from '../../db/pool.js'

function db(client) {
  return client ?? { query }
}

export async function insertNotificationIgnoreConflict(
  {
    userId,
    projectId = null,
    milestoneId = null,
    invitationId = null,
    kind,
    subjectKey,
    title,
    body,
  },
  client,
) {
  const { rows } = await db(client).query(
    `INSERT INTO notifications (
       user_id, project_id, milestone_id, invitation_id, kind, subject_key, title, body
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, kind, subject_key) DO NOTHING
     RETURNING *`,
    [userId, projectId, milestoneId, invitationId, kind, subjectKey, title, body],
  )
  return rows[0] ?? null
}

export async function listNotificationsForUser(userId, { unreadOnly = false } = {}) {
  const params = [userId]
  let sql = `
    SELECT n.*,
           i.token AS invitation_token,
           i.status AS invitation_status,
           i.invited_email AS invitation_email,
           i.invited_user_id AS invitation_user_id,
           i.message AS invitation_message,
           i.expires_at AS invitation_expires_at,
           i.created_at AS invitation_created_at,
           i.accepted_at AS invitation_accepted_at,
           i.rejected_at AS invitation_rejected_at,
           i.revoked_at AS invitation_revoked_at,
           p.title AS project_title,
           p.status AS project_status,
           p.freelancer_id AS project_freelancer_id,
           c.id AS sender_id,
           c.name AS sender_name,
           c.email AS sender_email
    FROM notifications n
    LEFT JOIN project_invitations i ON i.id = n.invitation_id
    LEFT JOIN projects p ON p.id = COALESCE(n.project_id, i.project_id)
    LEFT JOIN users c ON c.id = COALESCE(i.created_by, p.client_id)
    WHERE n.user_id = $1
  `
  if (unreadOnly) {
    sql += ` AND n.read_at IS NULL`
  }
  sql += ` ORDER BY n.created_at DESC LIMIT 100`
  const { rows } = await query(sql, params)
  return rows
}

export async function markNotificationRead(userId, notificationId) {
  const { rows } = await query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [notificationId, userId],
  )
  return rows[0] ?? null
}

export async function markAllRead(userId) {
  const { rowCount } = await query(
    `UPDATE notifications
     SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  )
  return rowCount ?? 0
}

export async function insertJobRun({ jobName, metadata = {} }) {
  const { rows } = await query(
    `INSERT INTO notification_job_runs (job_name, metadata)
     VALUES ($1, $2::jsonb)
     RETURNING *`,
    [jobName, JSON.stringify(metadata)],
  )
  return rows[0]
}

export async function finishJobRun(id, { createdCount, skippedCount, metadata = {} }) {
  const { rows } = await query(
    `UPDATE notification_job_runs
     SET finished_at = NOW(),
         created_count = $2,
         skipped_count = $3,
         metadata = metadata || $4::jsonb
     WHERE id = $1
     RETURNING *`,
    [id, createdCount, skippedCount, JSON.stringify(metadata)],
  )
  return rows[0]
}

/** Milestones with due dates still open (not APPROVED / terminal-ish). */
export async function listMilestonesForDeadlineScan() {
  const { rows } = await query(
    `SELECT m.*,
            p.client_id,
            p.freelancer_id,
            p.title AS project_title
     FROM milestones m
     JOIN projects p ON p.id = m.project_id
     WHERE m.due_date IS NOT NULL
       AND m.status NOT IN ('APPROVED', 'CANCELLED', 'DISPUTED')
       AND p.status = 'ACTIVE'`,
  )
  return rows
}

/** Active milestones currently submitted or in review. */
export async function listMilestonesForReviewScan() {
  const { rows } = await query(
    `SELECT m.*,
            p.client_id,
            p.freelancer_id,
            p.title AS project_title
     FROM milestones m
     JOIN projects p ON p.id = m.project_id
     WHERE m.status IN ('SUBMITTED', 'IN_REVIEW')
       AND p.status = 'ACTIVE'`,
  )
  return rows
}

/** Active milestones with no recent submission activity. */
export async function listMilestonesForInactivityScan({ inactivityDays }) {
  const { rows } = await query(
    `SELECT m.*,
            p.client_id,
            p.freelancer_id,
            p.title AS project_title,
            ls.last_submission_at
     FROM milestones m
     JOIN projects p ON p.id = m.project_id
     LEFT JOIN LATERAL (
       SELECT MAX(s.submitted_at) AS last_submission_at
       FROM submissions s
       WHERE s.milestone_id = m.id
     ) ls ON TRUE
     WHERE m.status IN ('IN_PROGRESS', 'REVISION_REQUESTED', 'SUBMITTED', 'IN_REVIEW')
       AND p.status = 'ACTIVE'
       AND (
         (
           ls.last_submission_at IS NULL
           AND m.updated_at < NOW() - make_interval(days => $1::int)
         )
         OR (
           ls.last_submission_at IS NOT NULL
           AND ls.last_submission_at < NOW() - make_interval(days => $1::int)
         )
       )`,
    [Number(inactivityDays)],
  )
  return rows
}

export async function hasOpenDispute(milestoneId) {
  const { rows } = await query(
    `SELECT id FROM disputes
     WHERE milestone_id = $1 AND status IN ('OPEN', 'UNDER_REVIEW')
     LIMIT 1`,
    [milestoneId],
  )
  return rows.length > 0
}

export function toPublicNotification(row) {
  if (!row) return null
  const invitationId = row.invitation_id ?? null
  let invitation = null
  if (invitationId && row.invitation_token) {
    const expired =
      row.invitation_status === 'PENDING' &&
      row.invitation_expires_at &&
      new Date(row.invitation_expires_at).getTime() < Date.now()

    invitation = {
      id: invitationId,
      token: row.invitation_token,
      status: expired ? 'EXPIRED' : row.invitation_status,
      invitedEmail: row.invitation_email ?? null,
      invitedUserId: row.invitation_user_id ?? null,
      message: row.invitation_message ?? null,
      expiresAt:
        row.invitation_expires_at?.toISOString?.() ??
        row.invitation_expires_at ??
        null,
      createdAt:
        row.invitation_created_at?.toISOString?.() ??
        row.invitation_created_at ??
        null,
      acceptedAt:
        row.invitation_accepted_at?.toISOString?.() ??
        row.invitation_accepted_at ??
        null,
      rejectedAt:
        row.invitation_rejected_at?.toISOString?.() ??
        row.invitation_rejected_at ??
        null,
      revokedAt:
        row.invitation_revoked_at?.toISOString?.() ??
        row.invitation_revoked_at ??
        null,
      projectTitle: row.project_title ?? null,
      projectStatus: row.project_status ?? null,
      hasFreelancer: Boolean(row.project_freelancer_id),
      sender: row.sender_id
        ? {
            id: row.sender_id,
            name: row.sender_name,
            email: row.sender_email,
          }
        : null,
    }
  }

  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id ?? null,
    milestoneId: row.milestone_id ?? null,
    invitationId,
    invitation,
    kind: row.kind,
    subjectKey: row.subject_key,
    title: row.title,
    body: row.body,
    readAt: row.read_at?.toISOString?.() ?? row.read_at ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  }
}
