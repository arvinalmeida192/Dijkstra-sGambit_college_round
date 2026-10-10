import { apiRequest } from './client'

export type NotificationKind =
  | 'DEADLINE_APPROACHING'
  | 'DEADLINE_PASSED'
  | 'INACTIVITY'

export type AppNotification = {
  id: string
  userId: string
  projectId: string | null
  milestoneId: string | null
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
