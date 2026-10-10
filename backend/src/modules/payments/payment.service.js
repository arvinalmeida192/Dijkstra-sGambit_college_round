import { conflict, notFound } from '../../utils/errors.js'
import { findMilestoneById } from '../milestones/milestone.repository.js'
import { findProjectById } from '../projects/project.repository.js'
import { assertParticipant } from '../projects/project.service.js'
import {
  appAmountToTokenBase,
} from '../blockchain/amounts.js'
import {
  getBlockchainConfig,
  getDefaultVerifier,
} from '../blockchain/escrowVerifier.js'
import { insertAuditLog } from '../submissions/submission.repository.js'
import {
  findPaymentById,
  findPaymentByTxHash,
  insertPayment,
  listPaymentsForMilestone,
  listPaymentsForProject,
  toPublicPayment,
  updatePaymentVerification,
} from './payment.repository.js'

function assertCanReport(project, user) {
  assertParticipant(project, user)
  // Any project participant may report a tx hash for verification.
  // Status is never taken from the client — only from chain verification.
}

function requireEscrowConfig() {
  const config = getBlockchainConfig()
  if (!config.configured) {
    throw conflict(
      'Blockchain is not configured. Set CHAIN_ID, RPC_URL, and ESCROW_CONTRACT_ADDRESS.',
    )
  }
  return config
}

function verificationPatch(result) {
  return {
    status: result.status,
    failureReason: result.failureReason ?? null,
    amountTokenBase: result.amountTokenBase ?? null,
    tokenAddress: result.tokenAddress ?? null,
    onChainAgreementId: result.onChainAgreementId ?? null,
    onChainMilestoneId: result.onChainMilestoneId ?? null,
    eventName: result.eventName ?? null,
    blockNumber: result.blockNumber ?? null,
    chainId: result.chainId,
    escrowAddress: result.escrowAddress,
    reconciliation: {
      ...(result.reconciliation ?? {}),
      pending: Boolean(result.pending),
      ok: Boolean(result.ok),
      verifiedFromChain: true,
      isTestNetwork: result.isTestNetwork !== false,
    },
    verifiedAt:
      result.status === 'PENDING' ? null : new Date().toISOString(),
  }
}

async function applyVerification(payment, result) {
  // Do not regress terminal FAILED/RELEASED/REFUNDED unless re-verified to same/other final.
  // Sync is always allowed to update from fresh chain data (source of truth).
  const updated = await updatePaymentVerification(
    payment.id,
    verificationPatch(result),
  )
  return updated
}

export async function listProjectPayments(user, projectId) {
  const project = await findProjectById(projectId)
  assertParticipant(project, user)
  const rows = await listPaymentsForProject(projectId)
  return { payments: rows.map(toPublicPayment) }
}

export async function listMilestonePayments(user, milestoneId) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')
  const project = await findProjectById(milestone.project_id)
  assertParticipant(project, user)
  const rows = await listPaymentsForMilestone(milestoneId)
  return { payments: rows.map(toPublicPayment) }
}

export async function getPayment(user, paymentId) {
  const payment = await findPaymentById(paymentId)
  if (!payment) throw notFound('Payment not found.')
  const project = await findProjectById(payment.project_id)
  assertParticipant(project, user)
  return toPublicPayment(payment)
}

/**
 * Report a transaction hash for a milestone. Creates a PENDING row (or returns
 * existing by tx_hash), then verifies against the chain. Client-supplied status
 * is ignored — only receipt + escrow events update status.
 */
export async function reportMilestonePayment(user, milestoneId, { txHash }) {
  const config = requireEscrowConfig()
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')

  const project = await findProjectById(milestone.project_id)
  assertCanReport(project, user)

  const normalizedHash = txHash.toLowerCase()
  const existing = await findPaymentByTxHash(normalizedHash)
  if (existing) {
    if (existing.milestone_id !== milestone.id) {
      throw conflict(
        'This transaction hash is already recorded for a different milestone.',
      )
    }
    // Idempotent: re-sync existing row.
    return syncPayment(user, existing.id)
  }

  const expectedTokenBase = appAmountToTokenBase(
    milestone.amount,
    config.tokenDecimals,
  ).toString()

  let payment = await insertPayment({
    projectId: project.id,
    milestoneId: milestone.id,
    agreementId: milestone.agreement_id,
    amount: milestone.amount,
    amountTokenBase: expectedTokenBase,
    escrowAddress: config.escrowAddress,
    chainId: config.chainId,
    txHash: normalizedHash,
    status: 'PENDING',
    reportedBy: user.id,
    reconciliation: {
      expectedTokenBase,
      reportedStatusIgnored: true,
      isTestNetwork: true,
    },
  })

  await insertAuditLog({
    actorId: user.id,
    projectId: project.id,
    milestoneId: milestone.id,
    action: 'PAYMENT_TX_REPORTED',
    metadata: { paymentId: payment.id, txHash: normalizedHash },
  })

  const verifier = getDefaultVerifier()
  const result = await verifier.verifyTransaction(normalizedHash, {
    expectedAppAmount: Number(milestone.amount),
  })

  payment = await applyVerification(payment, result)

  await insertAuditLog({
    actorId: user.id,
    projectId: project.id,
    milestoneId: milestone.id,
    action: 'PAYMENT_SYNCED',
    metadata: {
      paymentId: payment.id,
      txHash: normalizedHash,
      status: payment.status,
      eventName: payment.event_name,
      ok: Boolean(result.ok),
      pending: Boolean(result.pending),
    },
  })

  return { payment: toPublicPayment(payment), verification: summarize(result) }
}

/**
 * Re-verify from chain. Safe to retry — status comes only from receipt/events.
 */
export async function syncPayment(user, paymentId) {
  requireEscrowConfig()
  let payment = await findPaymentById(paymentId)
  if (!payment) throw notFound('Payment not found.')

  const project = await findProjectById(payment.project_id)
  assertParticipant(project, user)

  if (!payment.tx_hash) {
    throw conflict('Payment has no transaction hash to sync.')
  }

  const milestone = await findMilestoneById(payment.milestone_id)
  if (!milestone) throw notFound('Milestone not found.')

  const verifier = getDefaultVerifier()
  const result = await verifier.verifyTransaction(payment.tx_hash, {
    expectedAppAmount: Number(milestone.amount),
  })

  payment = await applyVerification(payment, result)

  await insertAuditLog({
    actorId: user.id,
    projectId: project.id,
    milestoneId: payment.milestone_id,
    action: 'PAYMENT_SYNCED',
    metadata: {
      paymentId: payment.id,
      txHash: payment.tx_hash,
      status: payment.status,
      eventName: payment.event_name,
      ok: Boolean(result.ok),
      pending: Boolean(result.pending),
    },
  })

  return { payment: toPublicPayment(payment), verification: summarize(result) }
}

function summarize(result) {
  return {
    ok: Boolean(result.ok),
    pending: Boolean(result.pending),
    status: result.status,
    eventName: result.eventName ?? null,
    failureReason: result.failureReason ?? null,
    chainId: result.chainId,
    blockNumber: result.blockNumber ?? null,
    isTestNetwork: result.isTestNetwork !== false,
  }
}
