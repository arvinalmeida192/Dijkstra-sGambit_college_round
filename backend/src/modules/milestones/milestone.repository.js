import { query } from '../../db/pool.js'

export async function insertMilestone(
  {
    projectId,
    agreementId = null,
    title,
    description = null,
    deliverables,
    deliverableDescription = null,
    acceptanceCriteria = null,
    verificationMethod = 'HUMAN_REVIEWED',
    verificationCriteria = {},
    frozenCriteriaHash = null,
    frozenAgreementVersion = null,
    verificationStatus = 'UNVERIFIED',
    challengeWindowHours = 48,
    disputeEscalationDays = 7,
    amount,
    dueDate = null,
    reviewWindowDays = 7,
    gracePeriodDays = 3,
    maxRevisions = 3,
    escalationStatus = 'NONE',
    sortOrder = 0,
    createdBy,
    status = 'PENDING',
  },
  client,
) {
  const runner = client ?? { query }
  const effectiveDeliverables =
    deliverables ?? deliverableDescription ?? description ?? ''
  const effectiveDeliverableDescription =
    deliverableDescription ?? deliverables ?? description ?? ''
  const effectiveCriteria =
    acceptanceCriteria ?? description ?? deliverables ?? 'Deliverable accepted'
  const effectiveDescription = description ?? deliverables ?? ''
  const effectiveMethod = verificationMethod ?? 'HUMAN_REVIEWED'
  const effectiveVerificationCriteria =
    verificationCriteria && typeof verificationCriteria === 'object'
      ? verificationCriteria
      : {}

  const { rows } = await runner.query(
    `INSERT INTO milestones (
       project_id, agreement_id, title, description, deliverables, deliverable_description,
       acceptance_criteria, verification_method, verification_criteria,
       frozen_criteria_hash, frozen_agreement_version, verification_status,
       challenge_window_hours, dispute_escalation_days,
       amount, due_date, review_window_days, grace_period_days, max_revisions,
       escalation_status, sort_order, created_by, status
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9::jsonb,
       $10, $11, $12,
       $13, $14,
       $15, $16, $17, $18, $19,
       $20, $21, $22, $23
     )
     RETURNING *`,
    [
      projectId,
      agreementId,
      title,
      effectiveDescription,
      effectiveDeliverables,
      effectiveDeliverableDescription,
      effectiveCriteria,
      effectiveMethod,
      JSON.stringify(effectiveVerificationCriteria),
      frozenCriteriaHash,
      frozenAgreementVersion,
      verificationStatus ?? 'UNVERIFIED',
      challengeWindowHours ?? 48,
      disputeEscalationDays ?? 7,
      amount,
      dueDate,
      reviewWindowDays ?? 7,
      gracePeriodDays ?? 3,
      maxRevisions ?? 3,
      escalationStatus ?? 'NONE',
      sortOrder,
      createdBy,
      status,
    ],
  )
  return rows[0]
}

export async function findMilestoneById(id, client) {
  const runner = client ?? { query }
  const { rows } = await runner.query(`SELECT * FROM milestones WHERE id = $1`, [id])
  return rows[0] ?? null
}

export async function listMilestonesForProject(projectId, client) {
  const runner = client ?? { query }
  const { rows } = await runner.query(
    `SELECT * FROM milestones
     WHERE project_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [projectId],
  )
  return rows
}

export async function updateMilestoneFields(id, fields, client) {
  const runner = client ?? { query }
  const sets = []
  const values = []
  let i = 1

  const map = {
    title: 'title',
    description: 'description',
    deliverables: 'deliverables',
    deliverableDescription: 'deliverable_description',
    acceptanceCriteria: 'acceptance_criteria',
    verificationMethod: 'verification_method',
    verificationCriteria: 'verification_criteria',
    frozenCriteriaHash: 'frozen_criteria_hash',
    frozenAgreementVersion: 'frozen_agreement_version',
    verificationStatus: 'verification_status',
    challengeWindowHours: 'challenge_window_hours',
    challengeDueAt: 'challenge_due_at',
    disputeEscalationDays: 'dispute_escalation_days',
    latestVerificationRunId: 'latest_verification_run_id',
    latestAttestationId: 'latest_attestation_id',
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
      if (key === 'verificationCriteria') {
        sets.push(`${column} = $${i++}::jsonb`)
        values.push(JSON.stringify(fields[key] ?? {}))
      } else {
        sets.push(`${column} = $${i++}`)
        values.push(fields[key])
      }
    }
  }

  if (sets.length === 0) {
    return findMilestoneById(id, client)
  }

  sets.push('updated_at = NOW()')
  values.push(id)

  const { rows } = await runner.query(
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
export async function applyStatusPatch(id, patch, client) {
  const runner = client ?? { query }
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
  if (Object.prototype.hasOwnProperty.call(patch, 'verificationStatus')) {
    sets.push(`verification_status = $${i++}`)
    values.push(patch.verificationStatus)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'challengeDueAt')) {
    sets.push(`challenge_due_at = $${i++}`)
    values.push(patch.challengeDueAt)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'latestVerificationRunId')) {
    sets.push(`latest_verification_run_id = $${i++}`)
    values.push(patch.latestVerificationRunId)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'latestAttestationId')) {
    sets.push(`latest_attestation_id = $${i++}`)
    values.push(patch.latestAttestationId)
  }

  if (sets.length === 1) {
    return findMilestoneById(id, client)
  }

  const { rows } = await runner.query(
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
  const verificationCriteria =
    row.verification_criteria && typeof row.verification_criteria === 'object'
      ? row.verification_criteria
      : typeof row.verification_criteria === 'string'
        ? JSON.parse(row.verification_criteria)
        : {}

  return {
    id: row.id,
    projectId: row.project_id,
    agreementId: row.agreement_id ?? null,
    title: row.title,
    description: row.description ?? row.deliverables ?? '',
    deliverables: row.deliverables,
    deliverableDescription:
      row.deliverable_description ?? row.deliverables ?? row.description ?? '',
    acceptanceCriteria: row.acceptance_criteria,
    verificationMethod: row.verification_method ?? 'HUMAN_REVIEWED',
    verificationCriteria,
    frozenCriteriaHash: row.frozen_criteria_hash ?? null,
    frozenAgreementVersion:
      row.frozen_agreement_version != null
        ? Number(row.frozen_agreement_version)
        : null,
    verificationStatus: row.verification_status ?? 'UNVERIFIED',
    challengeWindowHours:
      row.challenge_window_hours != null
        ? Number(row.challenge_window_hours)
        : 48,
    challengeDueAt: row.challenge_due_at ?? null,
    disputeEscalationDays:
      row.dispute_escalation_days != null
        ? Number(row.dispute_escalation_days)
        : 7,
    latestVerificationRunId: row.latest_verification_run_id ?? null,
    latestAttestationId: row.latest_attestation_id ?? null,
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
