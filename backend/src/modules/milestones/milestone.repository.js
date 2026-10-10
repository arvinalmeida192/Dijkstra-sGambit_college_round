import { query } from '../../db/pool.js'

export async function insertMilestone({
  projectId,
  agreementId = null,
  title,
  deliverables,
  acceptanceCriteria,
  amount,
  dueDate = null,
  reviewWindowDays = 7,
  gracePeriodDays = 3,
  maxRevisions = 3,
  escalationStatus = 'NONE',
  sortOrder = 0,
  createdBy,
  status = 'PENDING',
}) {
  const { rows } = await query(
    `INSERT INTO milestones (
       project_id, agreement_id, title, deliverables, acceptance_criteria,
       amount, due_date, review_window_days, grace_period_days, max_revisions,
       escalation_status, sort_order, created_by, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      projectId,
      agreementId,
      title,
      deliverables,
      acceptanceCriteria,
      amount,
      dueDate,
      reviewWindowDays,
      gracePeriodDays,
      maxRevisions,
      escalationStatus,
      sortOrder,
      createdBy,
      status,
    ],
  )
  return rows[0]
}

export async function findMilestoneById(id) {
  const { rows } = await query(`SELECT * FROM milestones WHERE id = $1`, [id])
  return rows[0] ?? null
}

export async function listMilestonesForProject(projectId) {
  const { rows } = await query(
    `SELECT * FROM milestones
     WHERE project_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [projectId],
  )
  return rows
}

export async function updateMilestoneFields(id, fields) {
  const sets = []
  const values = []
  let i = 1

  const map = {
    title: 'title',
    deliverables: 'deliverables',
    acceptanceCriteria: 'acceptance_criteria',
    amount: 'amount',
    dueDate: 'due_date',
    reviewWindowDays: 'review_window_days',
    gracePeriodDays: 'grace_period_days',
    maxRevisions: 'max_revisions',
    escalationStatus: 'escalation_status',
    sortOrder: 'sort_order',
  }

  for (const [key, column] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${column} = $${i++}`)
      values.push(fields[key])
    }
  }

  if (sets.length === 0) {
    return findMilestoneById(id)
  }

  sets.push('updated_at = NOW()')
  values.push(id)

  const { rows } = await query(
    `UPDATE milestones SET ${sets.join(', ')}
     WHERE id = $${i}
     RETURNING *`,
    values,
  )
  return rows[0] ?? null
}

/**
 * Apply a milestone patch. Status is optional so escalation-only updates are safe.
 * Pass explicit null to clear nullable columns.
 */
export async function applyStatusPatch(id, patch) {
  const sets = ['updated_at = NOW()']
  const values = [id]
  let i = 2

  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    sets.push(`status = $${i++}`)
    values.push(patch.status)
  }
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
  if (Object.prototype.hasOwnProperty.call(patch, 'escalationStatus')) {
    sets.push(`escalation_status = $${i++}`)
    values.push(patch.escalationStatus)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'dueDate')) {
    sets.push(`due_date = $${i++}`)
    values.push(patch.dueDate)
  }

  if (sets.length === 1) {
    return findMilestoneById(id)
  }

  const { rows } = await query(
    `UPDATE milestones SET ${sets.join(', ')}
     WHERE id = $1
     RETURNING *`,
    values,
  )
  return rows[0] ?? null
}

export async function deleteMilestone(id) {
  const { rowCount } = await query(`DELETE FROM milestones WHERE id = $1`, [id])
  return rowCount > 0
}

/** Format a pg DATE without UTC day-shift (node-pg uses local midnight). */
function formatDateOnly(value) {
  if (value == null) return null
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(value).slice(0, 10)
}

export function toPublicMilestone(row) {
  if (!row) return null

  const dueDate = formatDateOnly(row.due_date)

  return {
    id: row.id,
    projectId: row.project_id,
    agreementId: row.agreement_id ?? null,
    title: row.title,
    deliverables: row.deliverables,
    acceptanceCriteria: row.acceptance_criteria,
    amount: Number(row.amount),
    dueDate,
    reviewWindowDays: row.review_window_days ?? 7,
    gracePeriodDays: row.grace_period_days ?? 3,
    maxRevisions: row.max_revisions ?? 3,
    escalationStatus: row.escalation_status ?? 'NONE',
    status: row.status,
    sortOrder: row.sort_order,
    createdBy: row.created_by,
    statusNote: row.status_note ?? null,
    submittedAt: row.submitted_at ?? null,
    reviewStartedAt: row.review_started_at ?? null,
    reviewDueAt: row.review_due_at ?? null,
    approvedAt: row.approved_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function insertExtension({
  milestoneId,
  projectId,
  proposedBy,
  newDueDate,
  reason,
}) {
  const { rows } = await query(
    `INSERT INTO milestone_extensions (
       milestone_id, project_id, proposed_by, new_due_date, reason, status
     ) VALUES ($1, $2, $3, $4, $5, 'PROPOSED')
     RETURNING *`,
    [milestoneId, projectId, proposedBy, newDueDate, reason],
  )
  return rows[0]
}

export async function findExtensionById(id) {
  const { rows } = await query(
    `SELECT * FROM milestone_extensions WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function findActiveExtensionForMilestone(milestoneId) {
  const { rows } = await query(
    `SELECT * FROM milestone_extensions
     WHERE milestone_id = $1 AND status = 'PROPOSED'
     ORDER BY created_at DESC LIMIT 1`,
    [milestoneId],
  )
  return rows[0] ?? null
}

export async function listExtensionsForMilestone(milestoneId) {
  const { rows } = await query(
    `SELECT * FROM milestone_extensions
     WHERE milestone_id = $1
     ORDER BY created_at DESC`,
    [milestoneId],
  )
  return rows
}

export async function updateExtensionResponse(id, { respondedBy, status, responseNote = null }) {
  const { rows } = await query(
    `UPDATE milestone_extensions
     SET status = $2, responded_by = $3, response_note = $4, responded_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status, respondedBy, responseNote],
  )
  return rows[0] ?? null
}

export function toPublicExtension(row) {
  if (!row) return null
  return {
    id: row.id,
    milestoneId: row.milestone_id,
    projectId: row.project_id,
    proposedBy: row.proposed_by,
    newDueDate: formatDateOnly(row.new_due_date),
    reason: row.reason,
    status: row.status,
    respondedBy: row.responded_by ?? null,
    responseNote: row.response_note ?? null,
    createdAt: row.created_at,
    respondedAt: row.responded_at ?? null,
  }
}
