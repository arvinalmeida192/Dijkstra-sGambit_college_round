import { ethers } from 'ethers'
import { env } from '../../config/env.js'
import { milestoneEscrowAbi } from './escrowAbi.js'
import { getBlockchainConfig } from './escrowVerifier.js'

/**
 * Optional local/test operator that can submit protection txs
 * (auto-release / reclaim / configure). Never used for mainnet funds.
 *
 * Backend-only when ESCROW_OPERATOR_PRIVATE_KEY is unset: jobs still update
 * application state; parties report on-chain txs via the payments API / UI.
 */
export function getOperatorPrivateKey() {
  return String(
    process.env.ESCROW_OPERATOR_PRIVATE_KEY ?? env.escrowOperatorPrivateKey ?? '',
  ).trim()
}

export function isOperatorConfigured() {
  const config = getBlockchainConfig()
  return Boolean(config.configured && getOperatorPrivateKey())
}

function getWalletAndContract() {
  const config = getBlockchainConfig()
  const key = getOperatorPrivateKey()
  if (!config.configured || !key) {
    return { configured: false, config }
  }
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId)
  const wallet = new ethers.Wallet(key, provider)
  const contract = new ethers.Contract(
    config.escrowAddress,
    milestoneEscrowAbi,
    wallet,
  )
  return { configured: true, config, wallet, contract }
}

function chainFailure(err, fallbackReason = 'chain_error') {
  const message = err?.shortMessage || err?.reason || err?.message || String(err)
  return {
    submitted: false,
    reason: fallbackReason,
    notice: message,
  }
}

/**
 * Configure on-chain deadline/review timers for a funded milestone.
 * Idempotent: overwrites prior protection timestamps.
 */
export async function configureMilestoneProtectionOnChain({
  onChainAgreementId,
  onChainMilestoneId,
  deadlineWithGraceUnix = 0,
  reviewDueAtUnix = 0,
}) {
  const ctx = getWalletAndContract()
  if (!ctx.configured) {
    return { submitted: false, reason: 'operator_not_configured' }
  }

  try {
    const tx = await ctx.contract.setMilestoneProtection(
      BigInt(onChainAgreementId),
      BigInt(onChainMilestoneId),
      BigInt(deadlineWithGraceUnix),
      BigInt(reviewDueAtUnix),
    )
    const receipt = await tx.wait()
    return {
      submitted: true,
      txHash: receipt.hash?.toLowerCase?.() ?? String(tx.hash).toLowerCase(),
      blockNumber: Number(receipt.blockNumber),
    }
  } catch (err) {
    return chainFailure(err, 'configure_failed')
  }
}

/**
 * Auto-release funded milestone after review window. State checks prevent double pay.
 */
export async function autoReleaseOnChain({
  onChainAgreementId,
  onChainMilestoneId,
}) {
  const ctx = getWalletAndContract()
  if (!ctx.configured) {
    return { submitted: false, reason: 'operator_not_configured' }
  }

  try {
    const tx = await ctx.contract.autoReleaseMilestone(
      BigInt(onChainAgreementId),
      BigInt(onChainMilestoneId),
    )
    const receipt = await tx.wait()
    return {
      submitted: true,
      txHash: receipt.hash?.toLowerCase?.() ?? String(tx.hash).toLowerCase(),
      blockNumber: Number(receipt.blockNumber),
    }
  } catch (err) {
    return chainFailure(err, 'auto_release_failed')
  }
}

/**
 * Reclaim undelivered funded milestone after deadline + grace.
 */
export async function reclaimOnChain({
  onChainAgreementId,
  onChainMilestoneId,
}) {
  const ctx = getWalletAndContract()
  if (!ctx.configured) {
    return { submitted: false, reason: 'operator_not_configured' }
  }

  try {
    const tx = await ctx.contract.reclaimUndeliveredMilestone(
      BigInt(onChainAgreementId),
      BigInt(onChainMilestoneId),
    )
    const receipt = await tx.wait()
    return {
      submitted: true,
      txHash: receipt.hash?.toLowerCase?.() ?? String(tx.hash).toLowerCase(),
      blockNumber: Number(receipt.blockNumber),
    }
  } catch (err) {
    return chainFailure(err, 'reclaim_failed')
  }
}

/**
 * Configure frozen verification criteria on-chain for a milestone.
 */
export async function configureMilestoneVerificationOnChain({
  onChainAgreementId,
  onChainMilestoneId,
  criteriaHash,
  agreementVersion,
  challengeWindowSeconds = 0,
}) {
  const ctx = getWalletAndContract()
  if (!ctx.configured) {
    return { submitted: false, reason: 'operator_not_configured' }
  }

  try {
    const tx = await ctx.contract.setMilestoneVerificationCriteria(
      BigInt(onChainAgreementId),
      BigInt(onChainMilestoneId),
      criteriaHash,
      BigInt(agreementVersion),
      BigInt(challengeWindowSeconds),
    )
    const receipt = await tx.wait()
    return {
      submitted: true,
      txHash: receipt.hash?.toLowerCase?.() ?? String(tx.hash).toLowerCase(),
      blockNumber: Number(receipt.blockNumber),
    }
  } catch (err) {
    return chainFailure(err, 'configure_verification_failed')
  }
}

/**
 * Submit a signed EIP-712 verification attestation on-chain.
 */
export async function submitVerificationAttestationOnChain({
  attestation,
  signature,
}) {
  const ctx = getWalletAndContract()
  if (!ctx.configured) {
    return { submitted: false, reason: 'operator_not_configured' }
  }

  try {
    const tx = await ctx.contract.submitVerificationAttestation(
      {
        agreementId: BigInt(attestation.agreementId),
        milestoneId: BigInt(attestation.milestoneId),
        agreementVersion: BigInt(attestation.agreementVersion),
        criteriaHash: attestation.criteriaHash,
        submissionHash: attestation.submissionHash,
        outcome: Number(attestation.outcome),
        nonce: attestation.nonce,
        issuedAt: BigInt(attestation.issuedAt),
        expiresAt: BigInt(attestation.expiresAt),
      },
      signature,
    )
    const receipt = await tx.wait()
    return {
      submitted: true,
      txHash: receipt.hash?.toLowerCase?.() ?? String(tx.hash).toLowerCase(),
      blockNumber: Number(receipt.blockNumber),
    }
  } catch (err) {
    return chainFailure(err, 'submit_attestation_failed')
  }
}

/**
 * Execute smart-contract-enforced release for an already verified milestone.
 */
export async function releaseVerifiedMilestoneOnChain({
  onChainAgreementId,
  onChainMilestoneId,
}) {
  const ctx = getWalletAndContract()
  if (!ctx.configured) {
    return { submitted: false, reason: 'operator_not_configured' }
  }

  try {
    const tx = await ctx.contract.releaseVerifiedMilestone(
      BigInt(onChainAgreementId),
      BigInt(onChainMilestoneId),
    )
    const receipt = await tx.wait()
    return {
      submitted: true,
      txHash: receipt.hash?.toLowerCase?.() ?? String(tx.hash).toLowerCase(),
      blockNumber: Number(receipt.blockNumber),
    }
  } catch (err) {
    return chainFailure(err, 'release_verified_failed')
  }
}

/**
 * Submit signed attestation and release milestone in a single on-chain transaction
 * (when challengeWindowSeconds == 0).
 */
export async function verifyAndReleaseMilestoneOnChain({
  attestation,
  signature,
}) {
  const ctx = getWalletAndContract()
  if (!ctx.configured) {
    return { submitted: false, reason: 'operator_not_configured' }
  }

  try {
    const tx = await ctx.contract.verifyAndReleaseMilestone(
      {
        agreementId: BigInt(attestation.agreementId),
        milestoneId: BigInt(attestation.milestoneId),
        agreementVersion: BigInt(attestation.agreementVersion),
        criteriaHash: attestation.criteriaHash,
        submissionHash: attestation.submissionHash,
        outcome: Number(attestation.outcome),
        nonce: attestation.nonce,
        issuedAt: BigInt(attestation.issuedAt),
        expiresAt: BigInt(attestation.expiresAt),
      },
      signature,
    )
    const receipt = await tx.wait()
    return {
      submitted: true,
      txHash: receipt.hash?.toLowerCase?.() ?? String(tx.hash).toLowerCase(),
      blockNumber: Number(receipt.blockNumber),
    }
  } catch (err) {
    return chainFailure(err, 'verify_and_release_failed')
  }
}
