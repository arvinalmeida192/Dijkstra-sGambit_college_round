import { apiRequest } from './client'
import type { Milestone } from './milestones'
import type { Payment } from './payments'

export type VerificationMethod =
  | 'AUTOMATED_CHECK'
  | 'EVIDENCE_INTEGRITY_CHECK'
  | 'HUMAN_REVIEWED'

export type VerificationOutcome =
  | 'PASSED'
  | 'FAILED'
  | 'NEEDS_HUMAN_REVIEW'

export type VerificationStatus =
  | 'UNVERIFIED'
  | 'PENDING_VERIFICATION'
  | 'PASSED'
  | 'FAILED'
  | 'NEEDS_HUMAN_REVIEW'
  | 'CHALLENGE_WINDOW'
  | 'VERIFIED_ELIGIBLE'
  | 'VERIFIED_RELEASE_ELIGIBLE'

export type AutomatedCheckType =
  | 'JSON_ASSERTIONS'
  | 'TEXT_PATTERNS'
  | 'SANDBOX_JS_TEST'

export type AutomatedCheckItem = {
  id?: string
  name: string
  type: AutomatedCheckType
  config: Record<string, unknown>
}

export type RequiredEvidenceConfig = {
  requireFile?: boolean
  requireUrl?: boolean
  allowedContentTypes?: string[]
  minSizeBytes?: number | null
  maxSizeBytes?: number | null
  expectedSha256?: string | null
  requiredFiles?: string[]
}

export type VerificationCriteria = {
  acceptanceCriteria?: string[]
  requiredEvidence?: RequiredEvidenceConfig
  automatedChecks?: AutomatedCheckItem[]
  challengeWindowHours?: number
  disputeEscalationDays?: number
  disputePolicy?: string
}

export type VerificationSubcheckResult = {
  rule?: string
  name?: string
  passed: boolean
  detail?: string
  error?: string
  actual?: unknown
  expected?: unknown
}

export type VerificationCheckResult = {
  id: string
  name: string
  type: string
  passed: boolean
  detail: string
  subchecks?: VerificationSubcheckResult[]
}

export type VerificationRun = {
  id: string
  projectId: string
  milestoneId: string
  submissionId: string
  agreementId: string | null
  agreementVersion: number
  criteriaHash: string
  verificationMethod: VerificationMethod
  outcome: VerificationOutcome
  checksExecuted: VerificationCheckResult[]
  summary: string
  artifactHash: string
  errorDetails: string | null
  durationMs: number
  triggeredBy: string | null
  createdAt: string
}

export type VerificationAttestation = {
  id: string
  verificationRunId: string
  projectId: string
  milestoneId: string
  submissionId: string
  chainId: number
  escrowAddress: string
  onChainAgreementId: number
  onChainMilestoneId: number
  agreementVersion: number
  criteriaHash: string
  artifactHash: string
  outcome: number
  nonce: string
  issuedAt: number
  expiresAt: number
  verifierAddress: string
  domainSeparator: string
  structHash: string
  digest: string
  signature: string
  status: string
  txHash: string | null
  createdAt: string
}

export function getMilestoneVerificationSummary(
  token: string,
  milestoneId: string,
) {
  return apiRequest<{
    milestone: Milestone
    latestVerificationRun: VerificationRun | null
    latestAttestation: VerificationAttestation | null
    runs: VerificationRun[]
    attestations: VerificationAttestation[]
  }>(`/api/v1/milestones/${milestoneId}/verifications`, {
    token,
    method: 'GET',
  })
}

export function triggerSubmissionVerification(
  token: string,
  submissionId: string,
) {
  return apiRequest<{
    verificationRun: VerificationRun
    attestation: VerificationAttestation | null
    milestone: Milestone | null
  }>(`/api/v1/submissions/${submissionId}/verify`, {
    token,
    method: 'POST',
    body: {},
  })
}

export function executeVerifiedRelease(
  token: string,
  milestoneId: string,
  input: { txHash?: string } = {},
) {
  return apiRequest<{
    released?: boolean
    eligible?: boolean
    txHash?: string
    payment?: Payment
    attestation?: VerificationAttestation | null
    milestone: Milestone
    notice?: string
  }>(`/api/v1/milestones/${milestoneId}/verified-release`, {
    token,
    method: 'POST',
    body: input,
  })
}
