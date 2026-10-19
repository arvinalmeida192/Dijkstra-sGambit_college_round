import { apiRequest } from './client'
import type { MilestoneStatus } from '../milestoneStatus'
import type { Payment } from './payments'
import type {
  VerificationCriteria,
  VerificationMethod,
  VerificationStatus,
} from './verification'

export type Milestone = {
  id: string
  projectId: string
  agreementId: string | null
  title: string
  description?: string | null
  deliverables: string
  deliverableDescription?: string
  acceptanceCriteria: string
  verificationMethod?: VerificationMethod
  verificationCriteria?: VerificationCriteria
  frozenCriteriaHash?: string | null
  frozenAgreementVersion?: number | null
  verificationStatus?: VerificationStatus
  challengeWindowHours?: number
  challengeDueAt?: string | null
  disputeEscalationDays?: number
  latestVerificationRunId?: string | null
  latestAttestationId?: string | null
  amount: number
  dueDate: string | null
  reviewWindowDays: number | null
  gracePeriodDays: number
  maxRevisions: number
  escalationStatus: string
  status: MilestoneStatus
  sortOrder: number
  createdBy: string
  statusNote: string | null
  submittedAt: string | null
  reviewStartedAt: string | null
  reviewDueAt: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
  allowedTransitions: MilestoneStatus[]
  nextAction?: string
  actionOwner?: string
  actionDueAt?: string | null
}

export type MilestoneInput = {
  title: string
  description?: string | null
  deliverables: string
  deliverableDescription?: string | null
  acceptanceCriteria: string
  verificationMethod?: VerificationMethod
  verificationCriteria?: VerificationCriteria
  challengeWindowHours?: number
  disputeEscalationDays?: number
  amount: number
  dueDate?: string | null
  reviewWindowDays?: number | null
  gracePeriodDays?: number | null
  maxRevisions?: number | null
  agreementId?: string | null
  sortOrder?: number
}

export type MilestoneUpdateInput = Partial<
  Pick<
    MilestoneInput,
    | 'title'
    | 'description'
    | 'deliverables'
    | 'deliverableDescription'
    | 'acceptanceCriteria'
    | 'verificationMethod'
    | 'verificationCriteria'
    | 'challengeWindowHours'
    | 'disputeEscalationDays'
    | 'amount'
    | 'dueDate'
    | 'reviewWindowDays'
    | 'gracePeriodDays'
    | 'maxRevisions'
    | 'sortOrder'
  >
>

export type MilestoneExtension = {
  id: string
  milestoneId: string
  projectId: string
  proposedBy: string
  newDueDate: string
  reason: string
  status: 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN'
  respondedBy: string | null
  responseNote: string | null
  createdAt: string
  respondedAt: string | null
}

export type AuditLog = {
  id: string
  actorId: string | null
  actor: string
  actorName?: string
  actorRole?: string
  projectId: string | null
  milestoneId: string | null
  milestoneTitle?: string | null
  submissionId: string | null
  action: string
  eventType?: string
  category?: string
  summary?: string
  metadata: Record<string, unknown>
  details?: Record<string, unknown>
  createdAt: string
}

export type AuditLogPagination = {
  limit: number
  offset: number
  total: number
}

function auth(token: string) {
  return { token }
}

export function listMilestones(token: string, projectId: string) {
  return apiRequest<{ milestones: Milestone[] }>(
    `/api/v1/projects/${projectId}/milestones`,
    {
      ...auth(token),
      method: 'GET',
    },
  )
}

export function createMilestone(
  token: string,
  projectId: string,
  input: MilestoneInput,
) {
  return apiRequest<{ milestone: Milestone }>(
    `/api/v1/projects/${projectId}/milestones`,
    {
      ...auth(token),
      method: 'POST',
      body: input,
    },
  )
}

export function getMilestone(token: string, milestoneId: string) {
  return apiRequest<{ milestone: Milestone }>(
    `/api/v1/milestones/${milestoneId}`,
    {
      ...auth(token),
      method: 'GET',
    },
  )
}

export function updateMilestone(
  token: string,
  milestoneId: string,
  input: MilestoneUpdateInput,
) {
  return apiRequest<{ milestone: Milestone }>(
    `/api/v1/milestones/${milestoneId}`,
    {
      ...auth(token),
      method: 'PATCH',
      body: input,
    },
  )
}

export function deleteMilestone(token: string, milestoneId: string) {
  return apiRequest<{ deleted: boolean; id: string }>(
    `/api/v1/milestones/${milestoneId}`,
    {
      ...auth(token),
      method: 'DELETE',
    },
  )
}

export function updateMilestoneStatus(
  token: string,
  milestoneId: string,
  input: { status: MilestoneStatus; note?: string },
) {
  return apiRequest<{ milestone: Milestone }>(
    `/api/v1/milestones/${milestoneId}/status`,
    {
      ...auth(token),
      method: 'PATCH',
      body: input,
    },
  )
}

export function listExtensions(token: string, milestoneId: string) {
  return apiRequest<{ extensions: MilestoneExtension[] }>(
    `/api/v1/milestones/${milestoneId}/extensions`,
    { ...auth(token), method: 'GET' },
  )
}

export function proposeExtension(
  token: string,
  milestoneId: string,
  input: { newDueDate: string; reason: string },
) {
  return apiRequest<{ extension: MilestoneExtension }>(
    `/api/v1/milestones/${milestoneId}/extensions`,
    { ...auth(token), method: 'POST', body: input },
  )
}

export function respondExtension(
  token: string,
  milestoneId: string,
  extensionId: string,
  input: { decision: 'ACCEPT' | 'REJECT'; responseNote?: string | null },
) {
  return apiRequest<{ extension: MilestoneExtension; milestone: Milestone }>(
    `/api/v1/milestones/${milestoneId}/extensions/${extensionId}/respond`,
    { ...auth(token), method: 'POST', body: input },
  )
}

export function cancelAndReclaimMilestone(
  token: string,
  milestoneId: string,
  input: { reason?: string | null } = {},
) {
  return apiRequest<{ milestone: Milestone; notice: string }>(
    `/api/v1/milestones/${milestoneId}/cancel-and-reclaim`,
    { ...auth(token), method: 'POST', body: input },
  )
}

export function executeAutoRelease(token: string, milestoneId: string) {
  return apiRequest<{
    submitted: boolean
    txHash?: string
    payment?: Payment
    notice?: string
    reason?: string
  }>(`/api/v1/milestones/${milestoneId}/execute-auto-release`, {
    ...auth(token),
    method: 'POST',
    body: {},
  })
}

export function executeReclaim(token: string, milestoneId: string) {
  return apiRequest<{
    submitted: boolean
    txHash?: string
    payment?: Payment
    notice?: string
    reason?: string
  }>(`/api/v1/milestones/${milestoneId}/execute-reclaim`, {
    ...auth(token),
    method: 'POST',
    body: {},
  })
}

export function listProjectAuditLogs(
  token: string,
  projectId: string,
  options: { limit?: number; offset?: number } = {},
) {
  const params = new URLSearchParams()
  if (options.limit != null) params.set('limit', String(options.limit))
  if (options.offset != null) params.set('offset', String(options.offset))
  const query = params.toString()
  return apiRequest<{
    auditLogs: AuditLog[]
    pagination?: AuditLogPagination
  }>(`/api/v1/projects/${projectId}/audit-logs${query ? `?${query}` : ''}`, {
    ...auth(token),
    method: 'GET',
  })
}
