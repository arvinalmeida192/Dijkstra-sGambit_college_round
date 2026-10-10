import { apiRequest } from './client'

export type DeliverableType = 'CODE' | 'TEXT' | 'VISUAL'

export type AiAssessmentStatus =
  | 'COMPLETED'
  | 'NEEDS_HUMAN_REVIEW'
  | 'MODEL_UNAVAILABLE'
  | 'INVALID_OUTPUT'
  | 'MODEL_DISAGREEMENT'
  | 'SKIPPED'

export type AiAssessmentKind =
  | 'ACCEPTANCE_CRITERIA'
  | 'DISPUTE_EVIDENCE_SUMMARY'

export type CriterionStatus = 'MET' | 'PARTIAL' | 'MISSING' | 'UNVERIFIED'

export type StructuredCriterion = {
  criterion: string
  status: CriterionStatus
  evidenceRefs?: string[]
  notes?: string
}

export type StructuredAssessment = {
  criteria: StructuredCriterion[]
  outstandingWork?: string[]
  uncertainty?: string[]
  evidenceReferences?: string[]
  summary?: string
  confidence?: number | null
}

export type DisputeSummaryResult = {
  claims?: Array<{
    party?: string
    claim: string
    supportingEvidence?: string[]
  }>
  contradictions?: string[]
  missingInformation?: string[]
  evidenceReferences?: string[]
  summary?: string
  confidence?: number | null
}

export type AiAssessment = {
  id: string
  kind: AiAssessmentKind
  status: AiAssessmentStatus
  projectId: string
  milestoneId: string | null
  submissionId: string | null
  disputeId: string | null
  deliverableType: DeliverableType | null
  provider: string
  modelPrimary: string | null
  modelSecondary: string | null
  compareMode: boolean
  result: {
    assessment?: StructuredAssessment
    secondaryAssessment?: StructuredAssessment
    summary?: DisputeSummaryResult
    modelsRun?: string[]
    rawPreview?: string
    compareError?: string
  }
  advisoryNotice: string
  errorMessage: string | null
  createdBy: string | null
  createdAt: string
  advisoryOnly: true
  canApproveMilestone: false
  canDecideDispute: false
  canAuthorizePayment: false
}

function auth(token: string) {
  return { token }
}

export function getLatestSubmissionAssessment(
  token: string,
  submissionId: string,
) {
  return apiRequest<{
    assessment: AiAssessment | null
    notice: string
  }>(`/api/v1/submissions/${submissionId}/assessments/latest`, auth(token))
}

export function createSubmissionAssessment(
  token: string,
  submissionId: string,
  body: { deliverableType?: DeliverableType; compare?: boolean } = {},
) {
  return apiRequest<{ assessment: AiAssessment; notice: string }>(
    `/api/v1/submissions/${submissionId}/assessments`,
    {
      method: 'POST',
      token,
      body,
    },
  )
}

export function getLatestDisputeAssessment(token: string, disputeId: string) {
  return apiRequest<{
    assessment: AiAssessment | null
    notice: string
  }>(`/api/v1/disputes/${disputeId}/assessments/latest`, auth(token))
}

export function createDisputeAssessment(token: string, disputeId: string) {
  return apiRequest<{ assessment: AiAssessment; notice: string }>(
    `/api/v1/disputes/${disputeId}/assessments`,
    {
      method: 'POST',
      token,
      body: {},
    },
  )
}
