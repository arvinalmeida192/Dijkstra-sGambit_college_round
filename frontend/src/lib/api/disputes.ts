import { apiBlobRequest, apiFormRequest, apiRequest } from './client'
import type { Milestone } from './milestones'
import type {
  VerificationAttestation,
  VerificationCriteria,
  VerificationMethod,
  VerificationRun,
  VerificationStatus,
} from './verification'

export type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED'

export type DisputeDecision =
  | 'RELEASE_TO_FREELANCER'
  | 'REFUND_TO_CLIENT'
  | 'SPLIT'

export type DisputeResolutionOutcome =
  | 'RESUME_EXISTING'
  | 'RESUME_WITH_CHANGES'
  | 'TERMINATE_WORK'

export type DisputeResolutionType =
  | 'MUTUAL_AGREEMENT'
  | 'ARBITRATOR_DECISION'

export type ResolutionProposal = {
  proposedBy: string
  outcome: DisputeResolutionOutcome
  summary: string
  proposedAt: string
}

export type DisputeEvidence = {
  id: string
  disputeId: string
  uploadedBy: string
  notes: string | null
  externalUrl: string | null
  hasFile: boolean
  originalFilename: string | null
  contentType: string | null
  byteSize: number | null
  sha256Hash: string | null
  createdAt: string
}

export type DisputeVerificationContext = {
  milestoneTitle: string
  verificationMethod: VerificationMethod
  verificationStatus: VerificationStatus
  verificationCriteria: VerificationCriteria
  frozenCriteriaHash: string | null
  frozenAgreementVersion: number | null
  latestVerificationRun: VerificationRun | null
  latestAttestation: VerificationAttestation | null
}

export type Dispute = {
  id: string
  projectId: string
  milestoneId: string
  openedBy: string
  reason: string
  claimSummary: string | null
  status: DisputeStatus
  arbitratorId: string | null
  decision: DisputeDecision | null
  decisionRationale: string | null
  splitReleaseToFreelancer: number | null
  decidedAt: string | null
  openPaymentId: string | null
  resolvePaymentId: string | null
  resolutionType?: DisputeResolutionType | null
  resolutionOutcome?: DisputeResolutionOutcome | null
  resolutionSummary?: string | null
  resolvedBy?: string | null
  resolvedAt?: string | null
  resolutionProposal?: ResolutionProposal | null
  disputedCriteriaRefs?: string[]
  evidenceSubmissionId?: string | null
  verificationRunId?: string | null
  escalationDueAt?: string | null
  escalatedAt?: string | null
  verificationContext?: DisputeVerificationContext | null
  createdAt: string
  updatedAt: string
  fundsMovedByDecision: boolean
  evidence?: DisputeEvidence[]
}

export type OpenDisputeInput = {
  reason: string
  claimSummary?: string | null
  openPaymentId?: string | null
  disputedCriteriaRefs?: string[]
  evidenceSubmissionId?: string | null
  verificationRunId?: string | null
}

export type DisputeDecisionInput = {
  decision: DisputeDecision
  rationale: string
  splitReleaseToFreelancer?: number
  resolvePaymentId?: string | null
}

export type ProposeResolutionInput = {
  outcome: DisputeResolutionOutcome
  summary: string
}

export type ArbitratorResolveInput = {
  outcome: DisputeResolutionOutcome
  summary: string
  resolvePaymentId?: string | null
}

export type EvidenceInput = {
  notes?: string | null
  externalUrl?: string | null
  file?: File | null
}

function auth(token: string) {
  return { token }
}

export function listProjectDisputes(token: string, projectId: string) {
  return apiRequest<{ disputes: Dispute[] }>(
    `/api/v1/projects/${projectId}/disputes`,
    {
      ...auth(token),
      method: 'GET',
    },
  )
}

export function getDispute(token: string, disputeId: string) {
  return apiRequest<{ dispute: Dispute }>(`/api/v1/disputes/${disputeId}`, {
    ...auth(token),
    method: 'GET',
  })
}

export function openDispute(
  token: string,
  milestoneId: string,
  input: OpenDisputeInput,
) {
  return apiRequest<{
    dispute: Dispute
    milestone: Milestone
    notice: string
  }>(`/api/v1/milestones/${milestoneId}/disputes`, {
    ...auth(token),
    method: 'POST',
    body: input,
  })
}

export function claimDispute(token: string, disputeId: string) {
  return apiRequest<{ dispute: Dispute; notice: string }>(
    `/api/v1/disputes/${disputeId}/claim`,
    {
      ...auth(token),
      method: 'POST',
    },
  )
}

export function decideDispute(
  token: string,
  disputeId: string,
  input: DisputeDecisionInput,
) {
  return apiRequest<{
    dispute: Dispute
    milestone: Milestone
    notice: string
  }>(`/api/v1/disputes/${disputeId}/decide`, {
    ...auth(token),
    method: 'POST',
    body: input,
  })
}

export function proposeDisputeResolution(
  token: string,
  disputeId: string,
  input: ProposeResolutionInput,
) {
  return apiRequest<{
    dispute: Dispute
    notice: string
  }>(`/api/v1/disputes/${disputeId}/propose-resolution`, {
    ...auth(token),
    method: 'POST',
    body: input,
  })
}

export function acceptDisputeResolution(token: string, disputeId: string) {
  return apiRequest<{
    dispute: Dispute
    milestone: Milestone
    notice: string
  }>(`/api/v1/disputes/${disputeId}/accept-resolution`, {
    ...auth(token),
    method: 'POST',
  })
}

export function resolveDisputeAsArbitrator(
  token: string,
  disputeId: string,
  input: ArbitratorResolveInput,
) {
  return apiRequest<{
    dispute: Dispute
    milestone: Milestone
    notice: string
  }>(`/api/v1/disputes/${disputeId}/resolve`, {
    ...auth(token),
    method: 'POST',
    body: input,
  })
}

export function addDisputeEvidence(
  token: string,
  disputeId: string,
  input: EvidenceInput,
) {
  if (input.file) {
    const form = new FormData()
    form.append('file', input.file)
    if (input.notes?.trim()) form.append('notes', input.notes.trim())
    if (input.externalUrl?.trim()) {
      form.append('externalUrl', input.externalUrl.trim())
    }
    return apiFormRequest<{ evidence: DisputeEvidence }>(
      `/api/v1/disputes/${disputeId}/evidence`,
      {
        ...auth(token),
        method: 'POST',
        formData: form,
      },
    )
  }

  return apiRequest<{ evidence: DisputeEvidence }>(
    `/api/v1/disputes/${disputeId}/evidence`,
    {
      ...auth(token),
      method: 'POST',
      body: {
        notes: input.notes ?? null,
        externalUrl: input.externalUrl ?? null,
      },
    },
  )
}

export async function downloadDisputeEvidenceFile(
  token: string,
  evidenceId: string,
) {
  const { blob, headers } = await apiBlobRequest(
    `/api/v1/disputes/evidence/${evidenceId}/file`,
    { ...auth(token), method: 'GET' },
  )
  return { blob, headers }
}
