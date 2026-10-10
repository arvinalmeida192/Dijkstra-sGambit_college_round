import { apiRequest } from './client'
import type { UserRole } from '../roles'

export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'

export type ProjectParticipant = {
  id: string
  name: string
  email: string
  role: UserRole
}

export type ProjectInvitation = {
  id: string
  projectId: string
  token: string
  invitedEmail: string | null
  invitedRole: UserRole
  status: InvitationStatus
  createdBy: string
  acceptedBy: string | null
  acceptedAt: string | null
  expiresAt: string
  createdAt: string
}

export type Project = {
  id: string
  title: string
  description: string
  externalUrl: string | null
  status: ProjectStatus
  clientId: string
  freelancerId: string | null
  client: ProjectParticipant | null
  freelancer: ProjectParticipant | null
  invitations?: ProjectInvitation[]
  createdAt: string
  updatedAt: string
}

export type CreateProjectInput = {
  title: string
  description?: string
  externalUrl?: string
}

export type InvitationPreview = {
  token: string
  status: InvitationStatus
  invitedEmail: string | null
  invitedRole: UserRole
  expiresAt: string
  project: {
    id: string
    title: string
    status: ProjectStatus
    hasFreelancer: boolean
  }
  note: string
}

function auth(token: string) {
  return { token }
}

export function listProjects(
  token: string,
  params: { limit?: number; offset?: number } = {},
) {
  const search = new URLSearchParams()
  if (params.limit != null) search.set('limit', String(params.limit))
  if (params.offset != null) search.set('offset', String(params.offset))
  const qs = search.toString()
  return apiRequest<{
    projects: Project[]
    pagination: { limit: number; offset: number; total: number }
  }>(`/api/v1/projects${qs ? `?${qs}` : ''}`, auth(token))
}

export function createProject(token: string, input: CreateProjectInput) {
  return apiRequest<{ project: Project }>('/api/v1/projects', {
    ...auth(token),
    method: 'POST',
    body: input,
  })
}

export function getProject(token: string, projectId: string) {
  return apiRequest<{ project: Project }>(`/api/v1/projects/${projectId}`, {
    ...auth(token),
    method: 'GET',
  })
}

export function createInvitation(
  token: string,
  projectId: string,
  input: { email?: string } = {},
) {
  return apiRequest<{
    invitation: ProjectInvitation
    invitePath: string
    note: string
  }>(`/api/v1/projects/${projectId}/invitations`, {
    ...auth(token),
    method: 'POST',
    body: input,
  })
}

export function previewInvitation(inviteToken: string) {
  return apiRequest<{ invitation: InvitationPreview }>(
    `/api/v1/invitations/${encodeURIComponent(inviteToken)}`,
    { method: 'GET' },
  )
}

export function acceptInvitation(token: string, inviteToken: string) {
  return apiRequest<{ project: Project }>(
    `/api/v1/invitations/${encodeURIComponent(inviteToken)}/accept`,
    {
      ...auth(token),
      method: 'POST',
    },
  )
}

/** Absolute share URL for an invitation token (preferred over register?invite=). */
export function inviteShareUrl(token: string): string {
  const path = `/invite/${encodeURIComponent(token)}`
  if (typeof window === 'undefined') return path
  return `${window.location.origin}${path}`
}

export function absoluteInviteUrl(invitePath: string): string {
  if (typeof window === 'undefined') return invitePath
  return `${window.location.origin}${invitePath}`
}
