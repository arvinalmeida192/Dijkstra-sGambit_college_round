import { query } from '../../db/pool.js'

export async function insertMilestone(
  {
    projectId,
    agreementId = null,
    title,
    description = null,
    deliverables,
    acceptanceCriteria = null,
    amount,
    dueDate = null,
    reviewWindowDays = null,
    sortOrder = 0,
    createdBy,
    status = 'PENDING',
  },
  client,
) {
  const runner = client ?? { query }
  const effectiveDeliverables = deliverables ?? description ?? ''
  const effectiveCriteria =
    acceptanceCriteria ?? description ?? deliverables ?? 'Deliverable accepted'
  const effectiveDescription = description ?? deliverables ?? ''

  const { rows } = await runner.query(
    `INSERT INTO milestones (
       project_id, agreement_id, title, description, deliverables, acceptance_criteria,
       amount, due_date, review_window_days, sort_order, created_by, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      projectId,
      agreementId,
      title,
      effectiveDescription,
      effectiveDeliverables,
      effectiveCriteria,
      amount,
      dueDate,
      reviewWindowDays,
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
    description: 'description',
    deliverables: 'deliverables',
    acceptanceCriteria: 'acceptance_criteria',
    amount: 'amount',
    dueDate: 'due_date',
    reviewWindowDays: 'review_window_days',
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
 * Apply a status transition patch. Pass explicit null to clear nullable columns.
 * Keys: status, statusNote, submittedAt, reviewStartedAt, reviewDueAt, approvedAt
 */
export async function applyStatusPatch(id, patch) {
  const sets = ['status = $2', 'updated_at = NOW()']
  const values = [id, patch.status]
  let i = 3

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
    description: row.description ?? row.deliverables ?? '',
    deliverables: row.deliverables,
    acceptanceCriteria: row.acceptance_criteria,
    amount: Number(row.amount),
    dueDate,
    reviewWindowDays: row.review_window_days ?? null,
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
