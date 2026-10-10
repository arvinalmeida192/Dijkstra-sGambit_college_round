import { query } from '../../db/pool.js'

function db(client) {
  return client ?? { query }
}

export async function insertNotificationIgnoreConflict(
  {
    userId,
    projectId = null,
    milestoneId = null,
    kind,
    subjectKey,
    title,
    body,
  },
  client,
) {
  const { rows } = await db(client).query(
    `INSERT INTO notifications (
       user_id, project_id, milestone_id, kind, subject_key, title, body
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, kind, subject_key) DO NOTHING
     RETURNING *`,
    [userId, projectId, milestoneId, kind, subjectKey, title, body],
  )
  return rows[0] ?? null
}

export async function listNotificationsForUser(userId, { unreadOnly = false } = {}) {
  const params = [userId]
  let sql = `SELECT * FROM notifications WHERE user_id = $1`
  if (unreadOnly) {
    sql += ` AND read_at IS NULL`
  }
  sql += ` ORDER BY created_at DESC LIMIT 100`
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
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id ?? null,
    milestoneId: row.milestone_id ?? null,
    kind: row.kind,
    subjectKey: row.subject_key,
    title: row.title,
    body: row.body,
    readAt: row.read_at?.toISOString?.() ?? row.read_at ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  }
}
