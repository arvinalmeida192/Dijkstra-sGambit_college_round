import { query } from '../../db/pool.js'

function db(client) {
  return client ?? { query }
}

export async function findFundingById(id, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM project_funding WHERE id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function findFundingByOrderId(orderId, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM project_funding WHERE gateway_order_id = $1`,
    [orderId],
  )
  return rows[0] ?? null
}

export async function findPaidFundingForAgreement(agreementId, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM project_funding WHERE agreement_id = $1 AND status = 'PAID' LIMIT 1`,
    [agreementId],
  )
  return rows[0] ?? null
}

export async function findLatestFundingForProject(projectId, client) {
  const { rows } = await db(client).query(
    `SELECT * FROM project_funding WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [projectId],
  )
  return rows[0] ?? null
}

export async function insertFunding(
  {
    projectId,
    agreementId,
    clientId,
    amount,
    currency = 'INR',
    gatewayProvider = 'razorpay',
    gatewayOrderId = null,
    feeAmount = 0,
    totalPayable = 0,
    feeRate = 0,
    feeStatus = 'ESTIMATED',
    metadata = {},
  },
  client,
) {
  const { rows } = await db(client).query(
    `INSERT INTO project_funding (
       project_id, agreement_id, client_id, amount, currency,
       gateway_provider, gateway_order_id, status,
       fee_amount, total_payable, fee_rate, fee_status, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', $8, $9, $10, $11, $12::jsonb)
     RETURNING *`,
    [
      projectId,
      agreementId,
      clientId,
      amount,
      currency,
      gatewayProvider,
      gatewayOrderId,
      feeAmount,
      totalPayable,
      feeRate,
      feeStatus,
      JSON.stringify(metadata),
    ],
  )
  return rows[0]
}

export async function updateFundingOrderId(id, orderId, client) {
  const { rows } = await db(client).query(
    `UPDATE project_funding
     SET gateway_order_id = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, orderId],
  )
  return rows[0] ?? null
}

export async function markFundingPaid(
  { id, paymentId, signature, paidAt = new Date() },
  client,
) {
  const { rows } = await db(client).query(
    `UPDATE project_funding
     SET status = 'PAID',
         gateway_payment_id = $2,
         gateway_signature = $3,
         paid_at = $4,
         updated_at = NOW()
     WHERE id = $1 AND status <> 'PAID'
     RETURNING *`,
    [id, paymentId, signature, paidAt],
  )
  return rows[0] ?? null
}

export async function markFundingFailed({ id, failedAt = new Date(), metadata = {} }, client) {
  const { rows } = await db(client).query(
    `UPDATE project_funding
     SET status = 'FAILED',
         failed_at = $2,
         metadata = metadata || $3::jsonb,
         updated_at = NOW()
     WHERE id = $1 AND status = 'PENDING'
     RETURNING *`,
    [id, failedAt, JSON.stringify(metadata)],
  )
  return rows[0] ?? null
}

export async function insertMilestoneFundsBatch(items, client) {
  if (!items || items.length === 0) return []
  const created = []
  for (const item of items) {
    const { rows } = await db(client).query(
      `INSERT INTO milestone_funds (
         project_id, milestone_id, funding_id, amount, status
       ) VALUES ($1, $2, $3, $4, 'HELD')
       ON CONFLICT (milestone_id) DO UPDATE
       SET funding_id = EXCLUDED.funding_id,
           amount = EXCLUDED.amount,
           status = 'HELD',
           updated_at = NOW()
       RETURNING *`,
      [item.projectId, item.milestoneId, item.fundingId, item.amount],
    )
    if (rows[0]) created.push(rows[0])
  }
  return created
}

export async function listMilestoneFundsForProject(projectId, client) {
  const { rows } = await db(client).query(
    `SELECT mf.*, m.title AS milestone_title, m.status AS milestone_status, m.sort_order
     FROM milestone_funds mf
     JOIN milestones m ON m.id = mf.milestone_id
     WHERE mf.project_id = $1
     ORDER BY m.sort_order ASC, mf.created_at ASC`,
    [projectId],
  )
  return rows
}

export async function listMilestoneFundsForFunding(fundingId, client) {
  const { rows } = await db(client).query(
    `SELECT mf.*, m.title AS milestone_title, m.status AS milestone_status, m.sort_order
     FROM milestone_funds mf
     JOIN milestones m ON m.id = mf.milestone_id
     WHERE mf.funding_id = $1
     ORDER BY m.sort_order ASC, mf.created_at ASC`,
    [fundingId],
  )
  return rows
}

export async function findMilestoneFundByMilestoneId(milestoneId, client) {
  const { rows } = await db(client).query(
    `SELECT mf.*, m.title AS milestone_title, m.status AS milestone_status
     FROM milestone_funds mf
     JOIN milestones m ON m.id = mf.milestone_id
     WHERE mf.milestone_id = $1`,
    [milestoneId],
  )
  return rows[0] ?? null
}

export async function findMilestoneFundForUpdate(milestoneId, client) {
  const { rows } = await db(client).query(
    `SELECT mf.*, m.title AS milestone_title, m.status AS milestone_status, m.project_id
     FROM milestone_funds mf
     JOIN milestones m ON m.id = mf.milestone_id
     WHERE mf.milestone_id = $1
     FOR UPDATE`,
    [milestoneId],
  )
  return rows[0] ?? null
}

export async function releaseMilestoneFund(
  { milestoneFundId, releasedBy, payoutReference, metadata = {} },
  client,
) {
  const { rows } = await db(client).query(
    `UPDATE milestone_funds
     SET status = 'RELEASED',
         released_at = NOW(),
         released_by = $2,
         payout_reference = $3,
         release_metadata = $4::jsonb,
         updated_at = NOW()
     WHERE id = $1 AND (status = 'HELD' OR status = 'FAILED')
     RETURNING *`,
    [milestoneFundId, releasedBy, payoutReference, JSON.stringify(metadata)],
  )
  return rows[0] ?? null
}

export async function markMilestoneFundFailed(
  { milestoneFundId, failureReason, metadata = {} },
  client,
) {
  const { rows } = await db(client).query(
    `UPDATE milestone_funds
     SET status = 'FAILED',
         failure_reason = $2,
         release_metadata = $3::jsonb,
         updated_at = NOW()
     WHERE id = $1 AND status = 'HELD'
     RETURNING *`,
    [milestoneFundId, failureReason, JSON.stringify(metadata)],
  )
  return rows[0] ?? null
}

export async function recordGatewayEvent(
  { provider = 'razorpay', eventId, eventType, payload = {} },
  client,
) {
  const { rows } = await db(client).query(
    `INSERT INTO gateway_events (
       provider, event_id, event_type, payload
     ) VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING *`,
    [provider, eventId, eventType, JSON.stringify(payload)],
  )
  return rows[0] ?? null
}

export function toPublicFunding(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id,
    agreementId: row.agreement_id,
    clientId: row.client_id,
    amount: typeof row.amount === 'string' ? Number(row.amount) : row.amount,
    currency: row.currency,
    status: row.status,
    feeAmount: typeof row.fee_amount === 'string' ? Number(row.fee_amount) : Number(row.fee_amount ?? 0),
    totalPayable: typeof row.total_payable === 'string' ? Number(row.total_payable) : Number(row.total_payable ?? row.amount),
    feeRate: typeof row.fee_rate === 'string' ? Number(row.fee_rate) : Number(row.fee_rate ?? 0),
    feeStatus: row.fee_status ?? 'ESTIMATED',
    gatewayProvider: row.gateway_provider,
    gatewayOrderId: row.gateway_order_id ?? null,
    gatewayPaymentId: row.gateway_payment_id ?? null,
    paidAt: row.paid_at?.toISOString?.() ?? row.paid_at ?? null,
    failedAt: row.failed_at?.toISOString?.() ?? row.failed_at ?? null,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  }
}

export function toPublicMilestoneFund(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id,
    milestoneId: row.milestone_id,
    fundingId: row.funding_id,
    milestoneTitle: row.milestone_title ?? null,
    milestoneStatus: row.milestone_status ?? null,
    sortOrder: row.sort_order ?? 0,
    amount: typeof row.amount === 'string' ? Number(row.amount) : row.amount,
    status: row.status,
    failureReason: row.failure_reason ?? null,
    payoutReference: row.payout_reference ?? null,
    releasedAt: row.released_at?.toISOString?.() ?? row.released_at ?? null,
    releasedBy: row.released_by ?? null,
    releaseMetadata: row.release_metadata ?? {},
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  }
}

