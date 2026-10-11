import { apiRequest } from './client'

import type { InvitationStatus, ProjectStatus } from './projects'

export type NotificationKind =
  | 'DEADLINE_APPROACHING'
  | 'DEADLINE_PASSED'
  | 'INACTIVITY'
  | 'DEADLINE_PASSED_GRACE_ACTIVE'
  | 'GRACE_EXPIRING_WARNING'
  | 'REVIEW_EXPIRING_WARNING'
  | 'AUTO_APPROVED'
  | 'PROJECT_INVITATION'
  | 'INVITATION_ACCEPTED'
  | 'INVITATION_REJECTED'

export type NotificationInvitationDetails = {
  id: string
  token: string
  status: InvitationStatus
  invitedEmail: string | null
  invitedUserId: string | null
  message: string | null
  expiresAt: string | null
  createdAt: string | null
  acceptedAt: string | null
  rejectedAt: string | null
  revokedAt: string | null
  projectTitle: string | null
  projectStatus: ProjectStatus | null
  hasFreelancer: boolean
  sender: {
    id: string
    name: string
    email: string
  } | null
}

export type AppNotification = {
  id: string
  userId: string
  projectId: string | null
  milestoneId: string | null
  invitationId?: string | null
  invitation?: NotificationInvitationDetails | null
  kind: NotificationKind
  subjectKey: string
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

function auth(token: string) {
  return { token }
}

export function listNotifications(
  token: string,
  { unreadOnly = false }: { unreadOnly?: boolean } = {},
) {
  const qs = unreadOnly ? '?unreadOnly=true' : ''
  return apiRequest<{ notifications: AppNotification[]; notice: string }>(
    `/api/v1/notifications${qs}`,
    auth(token),
  )
}

export function markNotificationRead(token: string, notificationId: string) {
  return apiRequest<{ notification: AppNotification }>(
    `/api/v1/notifications/${notificationId}/read`,
    { method: 'POST', token },
  )
}

export function markAllNotificationsRead(token: string) {
  return apiRequest<{ updated: number }>(
    '/api/v1/notifications/read-all',
    { method: 'POST', token },
  )
}

export function runNotificationJobs(token: string) {
  return apiRequest<{
    jobId: string
    created: number
    skipped: number
    notice: string
  }>('/api/v1/notifications/run-jobs', { method: 'POST', token })
}
