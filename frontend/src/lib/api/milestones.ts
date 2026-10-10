import { apiRequest } from './client'
import type { MilestoneStatus } from '../milestoneStatus'

export type Milestone = {
  id: string
  projectId: string
  agreementId: string | null
  title: string
  deliverables: string
  acceptanceCriteria: string
  amount: number
  dueDate: string | null
  reviewWindowDays: number | null
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
}

export type MilestoneInput = {
  title: string
  deliverables: string
  acceptanceCriteria: string
  amount: number
  dueDate?: string | null
  reviewWindowDays?: number | null
  agreementId?: string | null
  sortOrder?: number
}

export type MilestoneUpdateInput = Partial<
  Pick<
    MilestoneInput,
    | 'title'
    | 'deliverables'
    | 'acceptanceCriteria'
    | 'amount'
    | 'dueDate'
    | 'reviewWindowDays'
    | 'sortOrder'
  >
>

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
