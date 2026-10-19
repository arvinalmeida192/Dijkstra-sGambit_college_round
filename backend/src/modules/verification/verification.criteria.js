import crypto from 'node:crypto'
import { badRequest } from '../../utils/errors.js'

export const VERIFICATION_METHODS = Object.freeze([
  'AUTOMATED_CHECK',
  'EVIDENCE_INTEGRITY_CHECK',
  'HUMAN_REVIEWED',
])

export const VERIFICATION_OUTCOMES = Object.freeze([
  'PASSED',
  'FAILED',
  'NEEDS_HUMAN_REVIEW',
])

export const VERIFICATION_STATUSES = Object.freeze([
  'UNVERIFIED',
  'PENDING_VERIFICATION',
  'PASSED',
  'FAILED',
  'NEEDS_HUMAN_REVIEW',
  'CHALLENGE_WINDOW',
  'VERIFIED_ELIGIBLE',
])

export const ATTESTATION_OUTCOME_CODE = Object.freeze({
  PASSED: 1,
  FAILED: 2,
  NEEDS_HUMAN_REVIEW: 3,
})

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  const sortedKeys = Object.keys(value).sort()
  const result = {}
  for (const k of sortedKeys) {
    if (value[k] !== undefined) {
      result[k] = canonicalize(value[k])
    }
  }
  return result
}

export function normalizeBytes32Hex(input) {
  if (!input || typeof input !== 'string') return null
  const trimmed = input.trim().toLowerCase()
  const raw = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed
  if (!/^[0-9a-f]{64}$/.test(raw)) {
    return null
  }
  return `0x${raw}`
}

/**
 * Normalize and validate milestone verification criteria.
 */
export function normalizeVerificationCriteria(rawCriteria = {}, method = 'HUMAN_REVIEWED') {
  if (!VERIFICATION_METHODS.includes(method)) {
    throw badRequest(
      `verificationMethod must be one of: ${VERIFICATION_METHODS.join(', ')}.`,
    )
  }

  const c = rawCriteria && typeof rawCriteria === 'object' ? rawCriteria : {}

  const acceptanceCriteria = Array.isArray(c.acceptanceCriteria)
    ? c.acceptanceCriteria
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
    : typeof c.acceptanceCriteria === 'string' && c.acceptanceCriteria.trim()
      ? [c.acceptanceCriteria.trim()]
      : []

  const rawEvidence =
    c.requiredEvidence && typeof c.requiredEvidence === 'object'
      ? c.requiredEvidence
      : {}

  const expectedSha256 = rawEvidence.expectedSha256
    ? String(rawEvidence.expectedSha256).trim().toLowerCase().replace(/^0x/, '')
    : null

  if (expectedSha256 && !/^[0-9a-f]{64}$/.test(expectedSha256)) {
    throw badRequest(
      'requiredEvidence.expectedSha256 must be a valid 64-character hex SHA-256 digest.',
    )
  }

  const requiredEvidence = {
    requireFile:
      rawEvidence.requireFile !== undefined
        ? Boolean(rawEvidence.requireFile)
        : method === 'AUTOMATED_CHECK' || method === 'EVIDENCE_INTEGRITY_CHECK',
    requireUrl: Boolean(rawEvidence.requireUrl ?? false),
    allowedContentTypes: Array.isArray(rawEvidence.allowedContentTypes)
      ? rawEvidence.allowedContentTypes
          .map((t) => String(t).trim().toLowerCase())
          .filter(Boolean)
      : [],
    minSizeBytes:
      rawEvidence.minSizeBytes != null && Number(rawEvidence.minSizeBytes) > 0
        ? Math.floor(Number(rawEvidence.minSizeBytes))
        : null,
    maxSizeBytes:
      rawEvidence.maxSizeBytes != null && Number(rawEvidence.maxSizeBytes) > 0
        ? Math.floor(Number(rawEvidence.maxSizeBytes))
        : null,
    expectedSha256,
    requiredFiles: Array.isArray(rawEvidence.requiredFiles)
      ? rawEvidence.requiredFiles.map((f) => String(f).trim()).filter(Boolean)
      : [],
  }

  const rawChecks = Array.isArray(c.automatedChecks) ? c.automatedChecks : []
  const automatedChecks = rawChecks.map((chk, idx) => {
    if (!chk || typeof chk !== 'object') {
      throw badRequest(`automatedChecks[${idx}] must be an object.`)
    }
    const type = String(chk.type ?? '').trim().toUpperCase()
    if (!['JSON_ASSERTIONS', 'TEXT_PATTERNS', 'SANDBOX_JS_TEST'].includes(type)) {
      throw badRequest(
        `automatedChecks[${idx}].type must be JSON_ASSERTIONS, TEXT_PATTERNS, or SANDBOX_JS_TEST.`,
      )
    }
    return {
      id: String(chk.id ?? `check-${idx + 1}`).trim(),
      name: String(chk.name ?? `${type} #${idx + 1}`).trim(),
      type,
      config: chk.config && typeof chk.config === 'object' ? chk.config : {},
    }
  })

  const challengeWindowHours =
    c.challengeWindowHours !== undefined && c.challengeWindowHours !== null
      ? Math.max(0, Math.min(720, Math.floor(Number(c.challengeWindowHours))))
      : 48

  const disputeEscalationDays =
    c.disputeEscalationDays !== undefined && c.disputeEscalationDays !== null
      ? Math.max(1, Math.min(90, Math.floor(Number(c.disputeEscalationDays))))
      : 7

  return {
    acceptanceCriteria,
    requiredEvidence,
    automatedChecks,
    challengeWindowHours,
    disputeEscalationDays,
    disputePolicy:
      typeof c.disputePolicy === 'string' && c.disputePolicy.trim()
        ? c.disputePolicy.trim()
        : 'Client may challenge with evidence during the challenge window; unresolved disputes escalate to the agreement arbitrator after the escalation deadline.',
  }
}

/**
 * Compute a deterministic 0x-prefixed 32-byte digest (SHA-256) binding the milestone's
 * deliverable, verification method, acceptance criteria, required evidence, automated checks,
 * amount, revision limit, challenge window, and agreement version.
 */
export function computeFrozenCriteriaHash({
  agreementVersion = 1,
  milestoneNumber = 1,
  title = '',
  deliverableDescription = '',
  amount = 0,
  verificationMethod = 'HUMAN_REVIEWED',
  verificationCriteria = {},
  maxRevisions = 3,
  challengeWindowHours = 48,
}) {
  const normalizedCriteria = normalizeVerificationCriteria(
    {
      ...verificationCriteria,
      challengeWindowHours:
        verificationCriteria?.challengeWindowHours ?? challengeWindowHours,
    },
    verificationMethod,
  )

  const payload = canonicalize({
    schema: 'fairwork-milestone-criteria-v1',
    agreementVersion: Number(agreementVersion),
    milestoneNumber: Number(milestoneNumber),
    title: String(title ?? '').trim(),
    deliverableDescription: String(deliverableDescription ?? '').trim(),
    amount: Number(amount),
    verificationMethod,
    maxRevisions: Number(maxRevisions ?? 3),
    challengeWindowHours: Number(normalizedCriteria.challengeWindowHours),
    criteria: normalizedCriteria,
  })

  const serialized = JSON.stringify(payload)
  const hex = crypto.createHash('sha256').update(serialized, 'utf8').digest('hex')
  return `0x${hex}`
}
