import crypto from 'node:crypto'
import { ethers } from 'ethers'
import { env } from '../../config/env.js'
import { badRequest, conflict } from '../../utils/errors.js'
import { getBlockchainConfig } from '../blockchain/escrowVerifier.js'
import { ATTESTATION_OUTCOME_CODE, normalizeBytes32Hex } from './verification.criteria.js'

export const EIP712_DOMAIN_NAME = 'FairworkMilestoneEscrow'
export const EIP712_DOMAIN_VERSION = '1'

export const ATTESTATION_TYPES = {
  MilestoneVerificationAttestation: [
    { name: 'agreementId', type: 'uint256' },
    { name: 'milestoneId', type: 'uint256' },
    { name: 'agreementVersion', type: 'uint256' },
    { name: 'criteriaHash', type: 'bytes32' },
    { name: 'submissionHash', type: 'bytes32' },
    { name: 'outcome', type: 'uint8' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'issuedAt', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
}

/**
 * Resolve the active verifier wallet from environment variables (never hardcoded in source).
 * In local/test environments when VERIFIER_PRIVATE_KEY is unset, derives a deterministic
 * session key from JWT_SECRET so local tests can verify EIP-712 attestations without committing keys.
 */
export function getVerifierWallet() {
  const explicitKey = String(
    process.env.VERIFIER_PRIVATE_KEY ??
      env.verifierPrivateKey ??
      process.env.ESCROW_OPERATOR_PRIVATE_KEY ??
      env.escrowOperatorPrivateKey ??
      '',
  ).trim()

  if (explicitKey) {
    const normalized = explicitKey.startsWith('0x')
      ? explicitKey
      : `0x${explicitKey}`
    return new ethers.Wallet(normalized)
  }

  if (env.nodeEnv === 'production') {
    throw conflict(
      'VERIFIER_PRIVATE_KEY must be configured in production to issue signed verification attestations.',
    )
  }

  const derivedHex = crypto
    .createHmac('sha256', env.jwtSecret)
    .update('fairwork-local-verifier-key-v1')
    .digest('hex')
  return new ethers.Wallet(`0x${derivedHex}`)
}

export function buildEip712Domain({ chainId, escrowAddress } = {}) {
  const cfg = getBlockchainConfig()
  const resolvedChainId = Number(chainId ?? (cfg.chainId || 31337))
  const rawAddress = String(
    escrowAddress || cfg.escrowAddress || ethers.ZeroAddress,
  ).trim()
  const verifyingContract = ethers.isAddress(rawAddress)
    ? ethers.getAddress(rawAddress)
    : ethers.ZeroAddress

  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId: resolvedChainId,
    verifyingContract,
  }
}

export function generateAttestationNonce() {
  return `0x${crypto.randomBytes(32).toString('hex')}`
}

/**
 * Issue a signed EIP-712 MilestoneVerificationAttestation.
 * Enforces that an attestation can ONLY be signed when verificationOutcome === 'PASSED'.
 */
export async function signVerificationAttestation({
  verificationOutcome,
  onChainAgreementId = 0,
  onChainMilestoneId = 0,
  agreementVersion = 1,
  criteriaHash,
  artifactHash,
  chainId,
  escrowAddress,
  nonce,
  issuedAt,
  expiresAt,
  wallet: injectedWallet,
}) {
  if (verificationOutcome !== 'PASSED') {
    throw conflict(
      `Cannot issue a signed verification approval attestation for outcome "${verificationOutcome}". Verification must PASSED first.`,
    )
  }

  const normCriteriaHash = normalizeBytes32Hex(criteriaHash)
  const normArtifactHash = normalizeBytes32Hex(artifactHash)
  if (!normCriteriaHash) {
    throw badRequest('criteriaHash must be a valid 32-byte hex digest.')
  }
  if (!normArtifactHash) {
    throw badRequest('artifactHash must be a valid 32-byte hex digest.')
  }

  const signerWallet = injectedWallet ?? getVerifierWallet()
  const domain = buildEip712Domain({ chainId, escrowAddress })

  const nowUnix = Math.floor(Date.now() / 1000)
  const resolvedIssuedAt =
    issuedAt !== undefined && issuedAt !== null ? Number(issuedAt) : nowUnix
  const ttlSeconds = Number(
    process.env.VERIFIER_ATTESTATION_TTL_SECONDS ??
      env.verifierAttestationTtlSeconds ??
      86_400,
  )
  const resolvedExpiresAt =
    expiresAt !== undefined && expiresAt !== null
      ? Number(expiresAt)
      : resolvedIssuedAt + ttlSeconds

  const resolvedNonce = normalizeBytes32Hex(nonce) ?? generateAttestationNonce()
  const outcomeCode = ATTESTATION_OUTCOME_CODE.PASSED

  const value = {
    agreementId: BigInt(onChainAgreementId ?? 0),
    milestoneId: BigInt(onChainMilestoneId ?? 0),
    agreementVersion: BigInt(agreementVersion ?? 1),
    criteriaHash: normCriteriaHash,
    submissionHash: normArtifactHash,
    outcome: outcomeCode,
    nonce: resolvedNonce,
    issuedAt: BigInt(resolvedIssuedAt),
    expiresAt: BigInt(resolvedExpiresAt),
  }

  const domainSeparator = ethers.TypedDataEncoder.hashDomain(domain)
  const structHash = ethers.TypedDataEncoder.hashStruct(
    'MilestoneVerificationAttestation',
    ATTESTATION_TYPES,
    value,
  )
  const digest = ethers.TypedDataEncoder.hash(domain, ATTESTATION_TYPES, value)
  const signature = await signerWallet.signTypedData(
    domain,
    ATTESTATION_TYPES,
    value,
  )

  return {
    chainId: domain.chainId,
    escrowAddress: domain.verifyingContract.toLowerCase(),
    onChainAgreementId: Number(onChainAgreementId ?? 0),
    onChainMilestoneId: Number(onChainMilestoneId ?? 0),
    agreementVersion: Number(agreementVersion ?? 1),
    criteriaHash: normCriteriaHash,
    artifactHash: normArtifactHash,
    outcome: outcomeCode,
    nonce: resolvedNonce,
    issuedAt: resolvedIssuedAt,
    expiresAt: resolvedExpiresAt,
    verifierAddress: signerWallet.address.toLowerCase(),
    domainSeparator,
    structHash,
    digest,
    signature,
  }
}

/**
 * Verify an EIP-712 MilestoneVerificationAttestation off-chain before or alongside contract submission.
 */
export function verifyAttestationSignature({
  attestation,
  signature,
  expectedChainId,
  expectedEscrowAddress,
  expectedCriteriaHash,
  expectedAgreementVersion,
  expectedArtifactHash,
  authorizedVerifiers = [],
  nowUnix = Math.floor(Date.now() / 1000),
}) {
  if (!attestation || !signature) {
    return { valid: false, reason: 'Missing attestation or signature.' }
  }

  const chainId = Number(expectedChainId ?? attestation.chainId)
  const escrowAddress = String(
    expectedEscrowAddress ?? attestation.escrowAddress ?? ethers.ZeroAddress,
  ).toLowerCase()

  if (Number(attestation.chainId) !== chainId) {
    return {
      valid: false,
      reason: `Chain ID mismatch: attestation signed for ${attestation.chainId}, expected ${chainId}.`,
    }
  }

  if (String(attestation.escrowAddress).toLowerCase() !== escrowAddress) {
    return {
      valid: false,
      reason: `Contract address mismatch: attestation signed for ${attestation.escrowAddress}, expected ${escrowAddress}.`,
    }
  }

  if (Number(attestation.outcome) !== ATTESTATION_OUTCOME_CODE.PASSED) {
    return {
      valid: false,
      reason: `Attestation outcome (${attestation.outcome}) is not PASSED (1).`,
    }
  }

  if (Number(attestation.expiresAt) < nowUnix) {
    return {
      valid: false,
      reason: 'Attestation has expired.',
    }
  }

  if (
    expectedAgreementVersion != null &&
    Number(attestation.agreementVersion) !== Number(expectedAgreementVersion)
  ) {
    return {
      valid: false,
      reason: `Stale or mismatched agreement version: got ${attestation.agreementVersion}, expected ${expectedAgreementVersion}.`,
    }
  }

  if (
    expectedCriteriaHash &&
    normalizeBytes32Hex(attestation.criteriaHash) !==
      normalizeBytes32Hex(expectedCriteriaHash)
  ) {
    return {
      valid: false,
      reason: 'Criteria hash mismatch.',
    }
  }

  if (
    expectedArtifactHash &&
    normalizeBytes32Hex(attestation.artifactHash ?? attestation.submissionHash) !==
      normalizeBytes32Hex(expectedArtifactHash)
  ) {
    return {
      valid: false,
      reason: 'Artifact/submission hash mismatch.',
    }
  }

  const domain = buildEip712Domain({ chainId, escrowAddress })
  const value = {
    agreementId: BigInt(attestation.onChainAgreementId ?? attestation.agreementId ?? 0),
    milestoneId: BigInt(attestation.onChainMilestoneId ?? attestation.milestoneId ?? 0),
    agreementVersion: BigInt(attestation.agreementVersion ?? 1),
    criteriaHash: normalizeBytes32Hex(attestation.criteriaHash),
    submissionHash: normalizeBytes32Hex(
      attestation.artifactHash ?? attestation.submissionHash,
    ),
    outcome: Number(attestation.outcome),
    nonce: normalizeBytes32Hex(attestation.nonce),
    issuedAt: BigInt(attestation.issuedAt),
    expiresAt: BigInt(attestation.expiresAt),
  }

  try {
    const recovered = ethers
      .verifyTypedData(domain, ATTESTATION_TYPES, value, signature)
      .toLowerCase()

    if (
      attestation.verifierAddress &&
      recovered !== String(attestation.verifierAddress).toLowerCase()
    ) {
      return {
        valid: false,
        reason: `Recovered signer ${recovered} does not match attestation verifierAddress ${attestation.verifierAddress}.`,
      }
    }

    if (Array.isArray(authorizedVerifiers) && authorizedVerifiers.length > 0) {
      const normalizedAllowed = authorizedVerifiers.map((a) =>
        String(a).toLowerCase(),
      )
      if (!normalizedAllowed.includes(recovered)) {
        return {
          valid: false,
          reason: `Signer ${recovered} is not an authorized active verifier.`,
        }
      }
    }

    return {
      valid: true,
      signer: recovered,
      reason: null,
    }
  } catch (err) {
    return {
      valid: false,
      reason: `Invalid signature: ${err.message}`,
    }
  }
}
