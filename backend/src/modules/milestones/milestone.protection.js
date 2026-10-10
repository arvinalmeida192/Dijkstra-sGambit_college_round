import { conflict, forbidden, notFound } from '../../utils/errors.js'
import {
  autoReleaseOnChain,
  configureMilestoneProtectionOnChain,
  isOperatorConfigured,
  reclaimOnChain,
} from '../blockchain/escrowOperator.js'
import {
  findFundedEscrowPaymentForMilestone,
  findPaymentByTxHash,
  insertPayment,
  toPublicPayment,
  updatePaymentVerification,
} from '../payments/payment.repository.js'
import { getBlockchainConfig, getDefaultVerifier } from '../blockchain/escrowVerifier.js'
import { appAmountToTokenBase } from '../blockchain/amounts.js'
import { findOpenDisputeForMilestone } from '../disputes/dispute.repository.js'
import { findProjectById } from '../projects/project.repository.js'
import { assertParticipant } from '../projects/project.service.js'
import { insertAuditLog } from '../submissions/submission.repository.js'
import { findMilestoneById } from './milestone.repository.js'

function unixSeconds(value) {
  if (!value) return 0
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return 0
  return Math.floor(d.getTime() / 1000)
}

/** End of due-date UTC day + grace days (shared with cancel eligibility). */
export function deadlineWithGraceDate(milestone) {
  if (!milestone?.due_date) return null
  const due = new Date(`${String(milestone.due_date).slice(0, 10)}T23:59:59.000Z`)
  if (Number.isNaN(due.getTime())) return null
  const grace = Number(milestone.grace_period_days ?? milestone.gracePeriodDays ?? 3)
  due.setUTCDate(due.getUTCDate() + grace)
  return due
}

export function deadlineWithGraceUnix(milestone) {
  const due = deadlineWithGraceDate(milestone)
  if (!due) return 0
  return Math.floor(due.getTime() / 1000)
}

async function recordOperatorPayment({
  milestone,
  project,
  actorId,
  txHash,
  action,
}) {
  const existing = await findPaymentByTxHash(txHash)
  if (existing) {
    return { payment: toPublicPayment(existing), duplicate: true }
  }

  const config = getBlockchainConfig()
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
    txHash,
    status: 'PENDING',
    reportedBy: actorId,
    reconciliation: {
      expectedTokenBase,
      operatorSubmitted: true,
      isTestNetwork: true,
      protectionAction: action,
    },
  })

  const verifier = getDefaultVerifier()
  const result = await verifier.verifyTransaction(txHash, {
    expectedAppAmount: Number(milestone.amount),
  })

  payment = await updatePaymentVerification(payment.id, {
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
      operatorSubmitted: true,
      protectionAction: action,
      isTestNetwork: true,
    },
    verifiedAt: result.status === 'PENDING' ? null : new Date().toISOString(),
  })

  await insertAuditLog({
    actorId: actorId ?? null,
    projectId: project.id,
    milestoneId: milestone.id,
    action,
    metadata: {
      txHash,
      paymentId: payment.id,
      status: payment.status,
      eventName: payment.event_name,
    },
  })

  return { payment: toPublicPayment(payment), duplicate: false }
}

/**
 * Attempt on-chain auto-release for an APPROVED milestone (operator or button).
 * Idempotent: chain state + tx_hash uniqueness prevent double payout.
 */
export async function executeAutoRelease(user, milestoneId, { asSystem = false } = {}) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')
  const project = await findProjectById(milestone.project_id)
  if (!project) throw notFound('Project not found.')

  if (!asSystem) {
    assertParticipant(project, user)
  }

  if (milestone.status === 'DISPUTED') {
    throw conflict('Cannot auto-release while the milestone is disputed.')
  }
  const openDispute = await findOpenDisputeForMilestone(milestoneId)
  if (openDispute) {
    throw conflict('Cannot auto-release while an open dispute exists.')
  }

  if (milestone.status !== 'APPROVED') {
    throw conflict('Auto-release requires an APPROVED milestone.')
  }

  if (!isOperatorConfigured()) {
    return {
      submitted: false,
      reason: 'operator_not_configured',
      notice:
        'Operator key not configured. Submit autoReleaseMilestone on the local chain and report the tx hash on Payments.',
    }
  }

  const funded = await findFundedEscrowPaymentForMilestone(milestoneId)
  if (!funded) {
    return {
      submitted: false,
      reason: 'no_funded_escrow_record',
      notice:
        'No CONFIRMED escrow funding record with on-chain ids. Fund first, then retry or report a wallet tx.',
    }
  }

  const reviewDueAt = unixSeconds(milestone.review_due_at)
  const configured = await configureMilestoneProtectionOnChain({
    onChainAgreementId: funded.on_chain_agreement_id,
    onChainMilestoneId: funded.on_chain_milestone_id,
    deadlineWithGraceUnix: deadlineWithGraceUnix(milestone),
    reviewDueAtUnix: reviewDueAt || Math.floor(Date.now() / 1000) - 1,
  })
  if (!configured.submitted && configured.reason !== 'operator_not_configured') {
    return configured
  }

  const chainResult = await autoReleaseOnChain({
    onChainAgreementId: funded.on_chain_agreement_id,
    onChainMilestoneId: funded.on_chain_milestone_id,
  })

  if (!chainResult.submitted) {
    return chainResult
  }

  const recorded = await recordOperatorPayment({
    milestone,
    project,
    actorId: user?.id ?? null,
    txHash: chainResult.txHash,
    action: 'AUTO_RELEASE_EXECUTED',
  })

  return {
    submitted: true,
    txHash: chainResult.txHash,
    payment: recorded.payment,
    duplicate: recorded.duplicate,
  }
}

/**
 * Attempt on-chain reclaim after cancel. Client or system operator.
 */
export async function executeReclaim(user, milestoneId, { asSystem = false } = {}) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')
  const project = await findProjectById(milestone.project_id)
  if (!project) throw notFound('Project not found.')

  if (!asSystem) {
    assertParticipant(project, user)
    if (project.client_id !== user.id) {
      throw forbidden('Only the project client can execute reclaim.')
    }
  }

  if (milestone.status === 'DISPUTED') {
    throw conflict('Cannot reclaim while the milestone is disputed.')
  }
  const openDispute = await findOpenDisputeForMilestone(milestoneId)
  if (openDispute) {
    throw conflict('Cannot reclaim while an open dispute exists.')
  }

  if (milestone.status !== 'CANCELLED' && milestone.status !== 'OVERDUE') {
    throw conflict('Reclaim requires an OVERDUE or CANCELLED milestone.')
  }

  if (!isOperatorConfigured()) {
    return {
      submitted: false,
      reason: 'operator_not_configured',
      notice:
        'Operator key not configured. Submit reclaimUndeliveredMilestone on the local chain and report the tx hash on Payments.',
    }
  }

  const funded = await findFundedEscrowPaymentForMilestone(milestoneId)
  if (!funded) {
    return {
      submitted: false,
      reason: 'no_funded_escrow_record',
      notice:
        'No CONFIRMED escrow funding record with on-chain ids. Report a wallet reclaim tx on Payments.',
    }
  }

  const configured = await configureMilestoneProtectionOnChain({
    onChainAgreementId: funded.on_chain_agreement_id,
    onChainMilestoneId: funded.on_chain_milestone_id,
    deadlineWithGraceUnix: deadlineWithGraceUnix(milestone) || Math.floor(Date.now() / 1000) - 1,
    reviewDueAtUnix: unixSeconds(milestone.review_due_at),
  })
  if (!configured.submitted && configured.reason !== 'operator_not_configured') {
    return configured
  }

  const chainResult = await reclaimOnChain({
    onChainAgreementId: funded.on_chain_agreement_id,
    onChainMilestoneId: funded.on_chain_milestone_id,
  })

  if (!chainResult.submitted) {
    return chainResult
  }

  const recorded = await recordOperatorPayment({
    milestone,
    project,
    actorId: user?.id ?? null,
    txHash: chainResult.txHash,
    action: 'RECLAIM_EXECUTED',
  })

  return {
    submitted: true,
    txHash: chainResult.txHash,
    payment: recorded.payment,
    duplicate: recorded.duplicate,
  }
}

/** Best-effort system call after auto-approval; never throws out of job loop. */
export async function trySystemAutoRelease(milestoneId) {
  try {
    return await executeAutoRelease(null, milestoneId, { asSystem: true })
  } catch (err) {
    return { submitted: false, reason: err.message }
  }
}
