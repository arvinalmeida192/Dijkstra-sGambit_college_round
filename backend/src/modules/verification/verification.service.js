import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from '../../utils/errors.js'
import { findAgreementById } from '../agreements/agreement.repository.js'
import {
  configureMilestoneVerificationOnChain,
  isOperatorConfigured,
  releaseVerifiedMilestoneOnChain,
  submitVerificationAttestationOnChain,
  verifyAndReleaseMilestoneOnChain,
} from '../blockchain/escrowOperator.js'
import {
  getBlockchainConfig,
  getDefaultVerifier,
} from '../blockchain/escrowVerifier.js'
import { findOpenDisputeForMilestone } from '../disputes/dispute.repository.js'
import {
  applyStatusPatch,
  findMilestoneById,
  toPublicMilestone,
  updateMilestoneFields,
} from '../milestones/milestone.repository.js'
import {
  findFundedEscrowPaymentForMilestone,
  toPublicPayment,
  updatePaymentVerification,
} from '../payments/payment.repository.js'
import { findProjectById } from '../projects/project.repository.js'
import { assertParticipant } from '../projects/project.service.js'
import {
  findSubmissionById,
  insertAuditLog,
  listSubmissionsForMilestone,
} from '../submissions/submission.repository.js'
import {
  getVerifierWallet,
  signVerificationAttestation,
  verifyAttestationSignature,
} from './verification.attestation.js'
import {
  computeFrozenCriteriaHash,
  normalizeVerificationCriteria,
} from './verification.criteria.js'
import {
  ensureActiveVerifierKey,
  findLatestAttestationForMilestone,
  findLatestVerificationRunForMilestone,
  insertVerificationAttestation,
  insertVerificationRun,
  listActiveVerifierAddresses,
  listVerificationRunsForMilestone,
  setVerifierKeyStatus,
  toPublicAttestation,
  toPublicVerificationRun,
  updateAttestationStatus,
} from './verification.repository.js'
import { executeMilestoneVerification } from './verification.runner.js'

/**
 * Ensure milestone has a frozen criteria hash and verify it has not been tampered with.
 */
async function resolveAndValidateFrozenCriteria(milestone) {
  let agreementVersion = Number(milestone.frozen_agreement_version ?? 1)
  if (milestone.agreement_id && !milestone.frozen_agreement_version) {
    const agreement = await findAgreementById(milestone.agreement_id)
    if (agreement) {
      agreementVersion = Number(agreement.version ?? 1)
    }
  }

  const rawCriteria =
    milestone.verification_criteria &&
    typeof milestone.verification_criteria === 'object'
      ? milestone.verification_criteria
      : typeof milestone.verification_criteria === 'string'
        ? JSON.parse(milestone.verification_criteria)
        : {}

  const computedHash = computeFrozenCriteriaHash({
    agreementVersion,
    milestoneNumber: Number(milestone.sort_order ?? 0) + 1,
    title: milestone.title,
    deliverableDescription:
      milestone.deliverable_description ??
      milestone.deliverables ??
      milestone.description ??
      '',
    amount: Number(milestone.amount),
    verificationMethod: milestone.verification_method ?? 'HUMAN_REVIEWED',
    verificationCriteria: rawCriteria,
    maxRevisions: milestone.max_revisions ?? 3,
    challengeWindowHours: milestone.challenge_window_hours ?? 48,
  })

  if (
    milestone.frozen_criteria_hash &&
    milestone.frozen_criteria_hash.toLowerCase() !== computedHash.toLowerCase()
  ) {
    throw conflict(
      'Milestone verification criteria do not match the frozen agreement criteria digest. Silent post-acceptance requirement modifications are forbidden.',
    )
  }

  if (!milestone.frozen_criteria_hash) {
    await updateMilestoneFields(milestone.id, {
      frozenCriteriaHash: computedHash,
      frozenAgreementVersion: agreementVersion,
    })
  }

  return {
    criteriaHash: computedHash,
    agreementVersion,
  }
}

/**
 * Run independent verification on a milestone submission and issue a signed EIP-712 attestation if PASSED.
 */
export async function evaluateSubmissionVerification(
  submissionId,
  { actorId = null, readFileFn } = {},
) {
  const submission = await findSubmissionById(submissionId)
  if (!submission) {
    throw notFound('Submission not found.')
  }

  const milestone = await findMilestoneById(submission.milestone_id)
  if (!milestone) {
    throw notFound('Milestone not found.')
  }

  if (milestone.status === 'CANCELLED') {
    throw conflict('Cannot verify a submission for a cancelled milestone.')
  }
  if (milestone.status === 'DISPUTED') {
    throw conflict('Cannot verify a submission while the milestone is disputed.')
  }
  if (milestone.status === 'APPROVED') {
    throw conflict('Milestone is already approved and settled.')
  }

  // Reject stale submission revisions — only the latest submission for the milestone may be verified
  const allSubmissions = await listSubmissionsForMilestone(milestone.id)
  const latestSubmission = allSubmissions[allSubmissions.length - 1]
  if (latestSubmission && latestSubmission.id !== submission.id) {
    throw conflict(
      `Submission revision #${submission.revision} is stale. Only the latest submission (revision #${latestSubmission.revision}) can be verified.`,
    )
  }

  const { criteriaHash, agreementVersion } =
    await resolveAndValidateFrozenCriteria(milestone)

  const execResult = await executeMilestoneVerification({
    milestone,
    submission,
    ...(readFileFn ? { readFileFn } : {}),
  })

  const runRow = await insertVerificationRun({
    milestoneId: milestone.id,
    submissionId: submission.id,
    agreementId: milestone.agreement_id ?? null,
    agreementVersion,
    verificationMethod: milestone.verification_method ?? 'HUMAN_REVIEWED',
    criteriaHash,
    artifactHash: execResult.artifactHash,
    outcome: execResult.outcome,
    checksExecuted: execResult.checksExecuted,
    summary: execResult.summary,
    errorDetails: execResult.errorDetails,
    executedBy: actorId ?? submission.submitted_by ?? null,
    durationMs: execResult.durationMs,
  })

  let attestationRow = null
  let updatedMilestone = milestone

  if (execResult.outcome === 'PASSED') {
    const wallet = getVerifierWallet()
    const keyRecord = await ensureActiveVerifierKey({
      verifierAddress: wallet.address,
      label: 'Fairwork Independent Verifier',
    })
    if (keyRecord && keyRecord.status === 'REVOKED') {
      throw conflict(
        `Configured verifier key (${wallet.address}) has been revoked and cannot sign attestations.`,
      )
    }

    const fundedPayment = await findFundedEscrowPaymentForMilestone(milestone.id)
    const chainCfg = getBlockchainConfig()

    const signed = await signVerificationAttestation({
      verificationOutcome: execResult.outcome,
      onChainAgreementId: fundedPayment?.on_chain_agreement_id ?? 0,
      onChainMilestoneId: fundedPayment?.on_chain_milestone_id ?? (milestone.sort_order ?? 0),
      agreementVersion,
      criteriaHash,
      artifactHash: execResult.artifactHash,
      chainId: fundedPayment?.chain_id ?? (chainCfg.chainId || 31337),
      escrowAddress: fundedPayment?.escrow_address ?? chainCfg.escrowAddress,
      wallet,
    })

    attestationRow = await insertVerificationAttestation({
      verificationRunId: runRow.id,
      milestoneId: milestone.id,
      submissionId: submission.id,
      ...signed,
    })

    const challengeWindowHours = Number(milestone.challenge_window_hours ?? 48)
    const now = new Date()

    if (challengeWindowHours <= 0) {
      updatedMilestone = await applyStatusPatch(milestone.id, {
        status: 'APPROVED',
        approvedAt: now.toISOString(),
        escalationStatus: 'AUTO_APPROVED',
        verificationStatus: 'VERIFIED_ELIGIBLE',
        challengeDueAt: now.toISOString(),
        latestVerificationRunId: runRow.id,
        latestAttestationId: attestationRow.id,
        statusNote:
          'Auto-approved via passed objective verification and signed attestation (0h challenge window).',
      })
    } else {
      const challengeDueAt = new Date(
        now.getTime() + challengeWindowHours * 3600 * 1000,
      )
      updatedMilestone = await applyStatusPatch(milestone.id, {
        verificationStatus: 'CHALLENGE_WINDOW',
        challengeDueAt: challengeDueAt.toISOString(),
        latestVerificationRunId: runRow.id,
        latestAttestationId: attestationRow.id,
      })
    }

    await insertAuditLog({
      actorId: actorId ?? submission.submitted_by ?? null,
      projectId: milestone.project_id,
      milestoneId: milestone.id,
      submissionId: submission.id,
      action: 'VERIFICATION_PASSED',
      metadata: {
        verificationRunId: runRow.id,
        attestationId: attestationRow.id,
        verificationMethod: milestone.verification_method,
        criteriaHash,
        artifactHash: execResult.artifactHash,
        verifierAddress: signed.verifierAddress,
        nonce: signed.nonce,
        challengeWindowHours,
      },
    })
  } else if (execResult.outcome === 'FAILED') {
    updatedMilestone = await applyStatusPatch(milestone.id, {
      verificationStatus: 'FAILED',
      challengeDueAt: null,
      latestVerificationRunId: runRow.id,
    })

    await insertAuditLog({
      actorId: actorId ?? submission.submitted_by ?? null,
      projectId: milestone.project_id,
      milestoneId: milestone.id,
      submissionId: submission.id,
      action: 'VERIFICATION_FAILED',
      metadata: {
        verificationRunId: runRow.id,
        verificationMethod: milestone.verification_method,
        criteriaHash,
        artifactHash: execResult.artifactHash,
        summary: execResult.summary,
      },
    })
  } else {
    // NEEDS_HUMAN_REVIEW
    updatedMilestone = await applyStatusPatch(milestone.id, {
      verificationStatus: 'NEEDS_HUMAN_REVIEW',
      challengeDueAt: null,
      latestVerificationRunId: runRow.id,
    })

    await insertAuditLog({
      actorId: actorId ?? submission.submitted_by ?? null,
      projectId: milestone.project_id,
      milestoneId: milestone.id,
      submissionId: submission.id,
      action: 'VERIFICATION_NEEDS_HUMAN_REVIEW',
      metadata: {
        verificationRunId: runRow.id,
        verificationMethod: milestone.verification_method,
        criteriaHash,
        artifactHash: execResult.artifactHash,
        summary: execResult.summary,
      },
    })
  }

  return {
    verificationRun: toPublicVerificationRun(runRow),
    attestation: toPublicAttestation(attestationRow),
    milestone: toPublicMilestone(updatedMilestone),
  }
}

/**
 * Trigger verification manually for a submission (e.g. re-verify or inspect).
 */
export async function triggerSubmissionVerification(user, submissionId) {
  const submission = await findSubmissionById(submissionId)
  if (!submission) throw notFound('Submission not found.')

  const project = await findProjectById(submission.project_id)
  if (!project) throw notFound('Project not found.')
  assertParticipant(project, user)

  return evaluateSubmissionVerification(submissionId, { actorId: user.id })
}

/**
 * Get verification criteria, run history, and latest signed attestation for a milestone.
 */
export async function getMilestoneVerificationDetails(user, milestoneId) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')

  const project = await findProjectById(milestone.project_id)
  if (!project) throw notFound('Project not found.')
  assertParticipant(project, user)

  const [runs, latestAttestation] = await Promise.all([
    listVerificationRunsForMilestone(milestoneId),
    findLatestAttestationForMilestone(milestoneId),
  ])

  const pubMilestone = toPublicMilestone(milestone)
  return {
    milestoneId: pubMilestone.id,
    verificationMethod: pubMilestone.verificationMethod,
    verificationCriteria: pubMilestone.verificationCriteria,
    frozenCriteriaHash: pubMilestone.frozenCriteriaHash,
    frozenAgreementVersion: pubMilestone.frozenAgreementVersion,
    verificationStatus: pubMilestone.verificationStatus,
    challengeWindowHours: pubMilestone.challengeWindowHours,
    challengeDueAt: pubMilestone.challengeDueAt,
    disputeEscalationDays: pubMilestone.disputeEscalationDays,
    runs: runs.map(toPublicVerificationRun),
    latestAttestation: toPublicAttestation(latestAttestation),
  }
}

/**
 * Execute or prepare smart-contract-enforced release for a milestone whose objective verification PASSED.
 * - Does NOT require client approval.
 * - Enforces bounded challenge window (`challenge_due_at`) and checks for active disputes.
 * - Validates the signed EIP-712 attestation against authorized verifiers.
 * - If on-chain operator + funded escrow payment are present, submits the attestation & release on-chain,
 *   verifies the receipt, and updates the payment status to RELEASED.
 */
export async function executeVerifiedMilestoneRelease(
  user,
  milestoneId,
  { onChainAgreementId, onChainMilestoneId } = {},
) {
  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')

  const project = await findProjectById(milestone.project_id)
  if (!project) throw notFound('Project not found.')

  if (user) {
    assertParticipant(project, user)
  }

  if (milestone.status === 'CANCELLED') {
    throw conflict('Cannot release a cancelled milestone.')
  }
  if (milestone.status === 'DISPUTED') {
    throw conflict('Cannot release a disputed milestone; awaiting arbitrator resolution.')
  }

  const openDispute = await findOpenDisputeForMilestone(milestoneId)
  if (openDispute) {
    throw conflict('Cannot release milestone while an open dispute exists.')
  }

  const latestRun = await findLatestVerificationRunForMilestone(milestoneId)
  if (!latestRun || latestRun.outcome !== 'PASSED') {
    throw conflict(
      'Milestone does not have a PASSED verification result. Independent verification must pass before verified release.',
    )
  }

  let attestation = await findLatestAttestationForMilestone(milestoneId)
  if (!attestation) {
    throw conflict('No signed verification attestation found for this milestone.')
  }
  if (attestation.status === 'REVOKED') {
    throw conflict('Verification attestation has been revoked.')
  }

  // Enforce challenge window if configured
  if (
    milestone.challenge_due_at &&
    Number(milestone.challenge_window_hours ?? 48) > 0
  ) {
    const dueMs = new Date(milestone.challenge_due_at).getTime()
    if (Date.now() < dueMs) {
      throw conflict(
        `Challenge window is active until ${new Date(dueMs).toISOString()}. Verified release can be executed once the challenge window expires without dispute.`,
      )
    }
  }

  const fundedPayment = await findFundedEscrowPaymentForMilestone(milestoneId)
  const chainCfg = getBlockchainConfig()

  const targetOnChainAgreementId =
    onChainAgreementId ??
    fundedPayment?.on_chain_agreement_id ??
    attestation.on_chain_agreement_id ??
    0
  const targetOnChainMilestoneId =
    onChainMilestoneId ??
    fundedPayment?.on_chain_milestone_id ??
    attestation.on_chain_milestone_id ??
    (milestone.sort_order ?? 0)
  const targetChainId =
    fundedPayment?.chain_id ?? (chainCfg.chainId || attestation.chain_id)
  const targetEscrowAddress = (
    fundedPayment?.escrow_address ||
    chainCfg.escrowAddress ||
    attestation.escrow_address
  ).toLowerCase()

  // If on-chain IDs or contract address were bound after the initial attestation was signed,
  // re-bind and sign a fresh attestation for the exact on-chain milestone coordinates.
  if (
    Number(attestation.on_chain_agreement_id) !== Number(targetOnChainAgreementId) ||
    Number(attestation.on_chain_milestone_id) !== Number(targetOnChainMilestoneId) ||
    String(attestation.escrow_address).toLowerCase() !== targetEscrowAddress ||
    Number(attestation.chain_id) !== Number(targetChainId)
  ) {
    const wallet = getVerifierWallet()
    const activeAddresses = await listActiveVerifierAddresses()
    if (
      activeAddresses.length > 0 &&
      !activeAddresses.includes(wallet.address.toLowerCase())
    ) {
      throw conflict('Verifier signing key has been revoked.')
    }

    const resigned = await signVerificationAttestation({
      verificationOutcome: latestRun.outcome,
      onChainAgreementId: targetOnChainAgreementId,
      onChainMilestoneId: targetOnChainMilestoneId,
      agreementVersion: latestRun.agreement_version,
      criteriaHash: latestRun.criteria_hash,
      artifactHash: latestRun.artifact_hash,
      chainId: targetChainId,
      escrowAddress: targetEscrowAddress,
      wallet,
    })

    attestation = await updateAttestationStatus(attestation.id, {
      onChainAgreementId: resigned.onChainAgreementId,
      onChainMilestoneId: resigned.onChainMilestoneId,
      chainId: resigned.chainId,
      escrowAddress: resigned.escrowAddress,
      nonce: resigned.nonce,
      issuedAt: resigned.issuedAt,
      expiresAt: resigned.expiresAt,
      domainSeparator: resigned.domainSeparator,
      structHash: resigned.structHash,
      signature: resigned.signature,
    })
  }

  const activeVerifiers = await listActiveVerifierAddresses()
  const sigVerification = verifyAttestationSignature({
    attestation: toPublicAttestation(attestation),
    signature: attestation.signature,
    expectedChainId: targetChainId,
    expectedEscrowAddress: targetEscrowAddress,
    expectedCriteriaHash: latestRun.criteria_hash,
    expectedAgreementVersion: latestRun.agreement_version,
    expectedArtifactHash: latestRun.artifact_hash,
    authorizedVerifiers: activeVerifiers,
  })

  if (!sigVerification.valid) {
    throw conflict(
      `Attestation validation failed: ${sigVerification.reason}`,
    )
  }

  // Transition milestone in PostgreSQL to APPROVED + VERIFIED_ELIGIBLE
  // (Payment row in `payments` is ONLY marked RELEASED if on-chain transaction receipt is verified!)
  const nowIso = new Date().toISOString()
  const updatedMilestone = await applyStatusPatch(milestoneId, {
    status: 'APPROVED',
    approvedAt: milestone.approved_at ?? nowIso,
    escalationStatus: 'AUTO_APPROVED',
    verificationStatus: 'VERIFIED_ELIGIBLE',
    statusNote:
      'Approved via verified milestone fulfilment and valid EIP-712 attestation.',
  })

  let onChainRelease = {
    submitted: false,
    reason: 'no_confirmed_on_chain_escrow_payment',
  }
  let updatedPayment = fundedPayment

  if (fundedPayment && isOperatorConfigured()) {
    // Configure verification commitment on-chain (0 challenge window since off-chain window already elapsed)
    await configureMilestoneVerificationOnChain({
      onChainAgreementId: targetOnChainAgreementId,
      onChainMilestoneId: targetOnChainMilestoneId,
      criteriaHash: attestation.criteria_hash,
      agreementVersion: attestation.agreement_version,
      challengeWindowSeconds: 0,
    })

    const contractAttestation = {
      agreementId: targetOnChainAgreementId,
      milestoneId: targetOnChainMilestoneId,
      agreementVersion: attestation.agreement_version,
      criteriaHash: attestation.criteria_hash,
      submissionHash: attestation.artifact_hash,
      outcome: attestation.outcome,
      nonce: attestation.nonce,
      issuedAt: attestation.issued_at,
      expiresAt: attestation.expires_at,
    }

    onChainRelease = await verifyAndReleaseMilestoneOnChain({
      attestation: contractAttestation,
      signature: attestation.signature,
    })

    if (!onChainRelease.submitted) {
      // Fallback: if attestation was already submitted on-chain earlier, call releaseVerifiedMilestoneOnChain
      const submitRes = await submitVerificationAttestationOnChain({
        attestation: contractAttestation,
        signature: attestation.signature,
      })
      if (submitRes.submitted) {
        attestation = await updateAttestationStatus(attestation.id, {
          status: 'SUBMITTED_ON_CHAIN',
          onChainTxHash: submitRes.txHash,
        })
      }
      onChainRelease = await releaseVerifiedMilestoneOnChain({
        onChainAgreementId: targetOnChainAgreementId,
        onChainMilestoneId: targetOnChainMilestoneId,
      })
    }

    if (onChainRelease.submitted && onChainRelease.txHash) {
      const verifier = getDefaultVerifier()
      const receiptCheck = await verifier.verifyTransaction(
        onChainRelease.txHash,
        { expectedAppAmount: Number(milestone.amount) },
      )

      if (receiptCheck.ok && receiptCheck.status === 'RELEASED') {
        updatedPayment = await updatePaymentVerification(fundedPayment.id, {
          status: 'RELEASED',
          eventName: receiptCheck.eventName,
          blockNumber: receiptCheck.blockNumber,
          reconciliation: {
            ...(fundedPayment.reconciliation ?? {}),
            verifiedReleaseTxHash: onChainRelease.txHash,
            verifiedReleaseEvent: receiptCheck.eventName,
            attestationNonce: attestation.nonce,
            artifactHash: attestation.artifact_hash,
          },
          verifiedAt: new Date(),
        })

        attestation = await updateAttestationStatus(attestation.id, {
          status: 'RELEASED_ON_CHAIN',
          onChainTxHash: attestation.on_chain_tx_hash ?? onChainRelease.txHash,
          releaseTxHash: onChainRelease.txHash,
        })
      }
    }
  }

  await insertAuditLog({
    actorId: user?.id ?? null,
    projectId: milestone.project_id,
    milestoneId: milestone.id,
    submissionId: latestRun.submission_id,
    action: 'MILESTONE_VERIFIED_RELEASE_ELIGIBLE',
    metadata: {
      verificationRunId: latestRun.id,
      attestationId: attestation.id,
      nonce: attestation.nonce,
      onChainSubmitted: Boolean(onChainRelease.submitted),
      releaseTxHash: onChainRelease.txHash ?? null,
    },
  })

  return {
    milestone: toPublicMilestone(updatedMilestone),
    verificationRun: toPublicVerificationRun(latestRun),
    attestation: toPublicAttestation(attestation),
    onChainRelease,
    payment: toPublicPayment(updatedPayment),
  }
}

/**
 * Rotate or revoke a verifier signing address (admin / arbitrator).
 */
export async function updateVerifierKey(user, { verifierAddress, status, label }) {
  if (!user || user.role !== 'ARBITRATOR') {
    throw forbidden('Only an arbitrator or administrator can manage verifier keys.')
  }
  if (!verifierAddress || !/^0x[a-fA-F0-9]{40}$/.test(verifierAddress)) {
    throw badRequest('verifierAddress must be a valid 20-byte hex address.')
  }
  if (!['ACTIVE', 'REVOKED'].includes(status)) {
    throw badRequest('status must be ACTIVE or REVOKED.')
  }

  return setVerifierKeyStatus({ verifierAddress, status, label })
}
