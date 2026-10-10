import { apiRequest } from './client'
import type { UserRole } from '../roles'

export type AgreementStatus =
  | 'PROPOSED'
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'WITHDRAWN'

export type AgreementMilestoneTerms = {
  title: string
  description?: string
  deliverables?: string
  acceptanceCriteria?: string
  amount: number
  dueDate?: string
  reviewWindowDays?: number
}

export type AgreementTerms = {
  title?: string
  description?: string
  summary?: string
  finalDeliverable?: string
  completionCriteria?: string
  totalPayment?: number
  finalDueDate?: string
  milestones: AgreementMilestoneTerms[]
  notes?: string
}

export type AgreementAcceptance = {
  id: string
  agreementId: string
  userId: string
  acceptedAt: string
  signatureRef: string | null
  user: {
    id: string
    name: string
    email: string
    role: UserRole
  }
}

export type Agreement = {
  id: string
  projectId: string
  version: number
  terms: AgreementTerms
  status: AgreementStatus
  createdBy: string
  supersedesId: string | null
  createdAt: string
  activatedAt: string | null
  acceptances: AgreementAcceptance[]
  acceptanceNote: string
}

export type AgreementTermsInput = {
  title?: string
  description?: string
  summary?: string
  finalDeliverable?: string
  completionCriteria?: string
  totalPayment?: number
  finalDueDate?: string
  milestones: AgreementMilestoneTerms[]
  notes?: string
}

function auth(token: string) {
  return { token }
}

export function listAgreements(token: string, projectId: string) {
  return apiRequest<{
    agreements: Agreement[]
    activeAgreementId: string | null
    proposedAgreementId: string | null
  }>(`/api/v1/projects/${projectId}/agreements`, {
    ...auth(token),
    method: 'GET',
  })
}

export function createAgreement(
  token: string,
  projectId: string,
  terms: AgreementTermsInput,
) {
  return apiRequest<{ agreement: Agreement }>(
    `/api/v1/projects/${projectId}/agreements`,
    {
      ...auth(token),
      method: 'POST',
      body: { terms },
    },
  )
}

export function getAgreement(token: string, agreementId: string) {
  return apiRequest<{ agreement: Agreement }>(
    `/api/v1/agreements/${agreementId}`,
    {
      ...auth(token),
      method: 'GET',
    },
  )
}

export function acceptAgreement(
  token: string,
  agreementId: string,
  input: { signatureRef?: string } = {},
) {
  return apiRequest<{ agreement: Agreement }>(
    `/api/v1/agreements/${agreementId}/accept`,
    {
      ...auth(token),
      method: 'POST',
      body: input,
    },
  )
}

export function proposeAgreementChange(
  token: string,
  agreementId: string,
  terms: AgreementTermsInput,
) {
  return apiRequest<{ agreement: Agreement }>(
    `/api/v1/agreements/${agreementId}/propose-change`,
    {
      ...auth(token),
      method: 'POST',
      body: { terms },
    },
  )
}
