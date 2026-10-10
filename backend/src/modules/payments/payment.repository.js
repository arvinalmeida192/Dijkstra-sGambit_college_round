import { query } from '../../db/pool.js'

export async function findPaymentById(id) {
  const { rows } = await query(`SELECT * FROM payments WHERE id = $1`, [id])
  return rows[0] ?? null
}

export async function findPaymentByTxHash(txHash) {
  const { rows } = await query(
    `SELECT * FROM payments WHERE lower(tx_hash) = lower($1)`,
    [txHash],
  )
  return rows[0] ?? null
}

export async function listPaymentsForProject(projectId) {
  const { rows } = await query(
    `SELECT * FROM payments
     WHERE project_id = $1
     ORDER BY created_at DESC`,
    [projectId],
  )
  return rows
}

export async function listPaymentsForMilestone(milestoneId) {
  const { rows } = await query(
    `SELECT * FROM payments
     WHERE milestone_id = $1
     ORDER BY created_at DESC`,
    [milestoneId],
  )
  return rows
}

/** Latest funded (CONFIRMED) payment with on-chain ids — used for protection txs. */
export async function findFundedEscrowPaymentForMilestone(milestoneId) {
  const { rows } = await query(
    `SELECT * FROM payments
     WHERE milestone_id = $1
       AND status = 'CONFIRMED'
       AND on_chain_agreement_id IS NOT NULL
       AND on_chain_milestone_id IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [milestoneId],
  )
  return rows[0] ?? null
}

export async function insertPayment({
  projectId,
  milestoneId,
  agreementId,
  amount,
  amountTokenBase,
  escrowAddress,
  tokenAddress,
  chainId,
  onChainAgreementId,
  onChainMilestoneId,
  txHash,
  eventName,
  blockNumber,
  status,
  failureReason,
  reconciliation,
  reportedBy,
  verifiedAt,
}) {
  const { rows } = await query(
    `INSERT INTO payments (
       project_id, milestone_id, agreement_id, amount, amount_token_base,
       escrow_address, token_address, chain_id,
       on_chain_agreement_id, on_chain_milestone_id,
       tx_hash, event_name, block_number, status, failure_reason,
       reconciliation, reported_by, verified_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18
     )
     RETURNING *`,
    [
      projectId,
      milestoneId,
      agreementId ?? null,
      amount,
      amountTokenBase ?? null,
      escrowAddress,
      tokenAddress ?? null,
      chainId,
      onChainAgreementId ?? null,
      onChainMilestoneId ?? null,
      txHash ?? null,
      eventName ?? null,
      blockNumber ?? null,
      status,
      failureReason ?? null,
      JSON.stringify(reconciliation ?? {}),
      reportedBy ?? null,
      verifiedAt ?? null,
    ],
  )
  return rows[0]
}

export async function updatePaymentVerification(id, patch) {
  const sets = ['updated_at = NOW()']
  const values = [id]
  let i = 2

  const fields = {
    status: 'status',
    failureReason: 'failure_reason',
    amountTokenBase: 'amount_token_base',
    tokenAddress: 'token_address',
    onChainAgreementId: 'on_chain_agreement_id',
    onChainMilestoneId: 'on_chain_milestone_id',
    eventName: 'event_name',
    blockNumber: 'block_number',
    reconciliation: 'reconciliation',
    verifiedAt: 'verified_at',
    chainId: 'chain_id',
    escrowAddress: 'escrow_address',
  }

  for (const [key, column] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue
    if (key === 'reconciliation') {
      sets.push(`${column} = $${i++}::jsonb`)
      values.push(JSON.stringify(patch[key] ?? {}))
    } else {
      sets.push(`${column} = $${i++}`)
      values.push(patch[key])
    }
  }

  const { rows } = await query(
    `UPDATE payments SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  )
  return rows[0] ?? null
}

export function toPublicPayment(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id,
    milestoneId: row.milestone_id,
    agreementId: row.agreement_id,
    amount: Number(row.amount),
    amountTokenBase: row.amount_token_base,
    escrowAddress: row.escrow_address,
    tokenAddress: row.token_address,
    chainId: Number(row.chain_id),
    onChainAgreementId: row.on_chain_agreement_id,
    onChainMilestoneId: row.on_chain_milestone_id,
    txHash: row.tx_hash,
    eventName: row.event_name,
    blockNumber: row.block_number != null ? Number(row.block_number) : null,
    status: row.status,
    failureReason: row.failure_reason,
    reconciliation: row.reconciliation ?? {},
    reportedBy: row.reported_by,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    /** Honest label: MVP tracks local/test-network settlements only. */
    isTestNetwork: true,
  }
}
