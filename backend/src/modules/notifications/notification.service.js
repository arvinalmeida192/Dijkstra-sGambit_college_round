import { notFound } from '../../utils/errors.js'
import { runNotificationJobs } from './notification.jobs.js'
import {
  listNotificationsForUser,
  markAllRead,
  markNotificationRead,
  toPublicNotification,
} from './notification.repository.js'

export async function listMine(user, { unreadOnly = false } = {}) {
  const rows = await listNotificationsForUser(user.id, { unreadOnly })
  return {
    notifications: rows.map(toPublicNotification),
    notice:
      'Deadline and inactivity alerts are deterministic rules, independent of AI judgment.',
  }
}

export async function markRead(user, notificationId) {
  const row = await markNotificationRead(user.id, notificationId)
  if (!row) throw notFound('Notification not found.')
  return { notification: toPublicNotification(row) }
}

export async function markAll(user) {
  const count = await markAllRead(user.id)
  return { updated: count }
}

export async function runJobs(user) {
  // Allow any authenticated user to trigger a scan in demos; results remain
  // scoped per-user via recipient lists. Idempotent.
  void user
  const result = await runNotificationJobs()
  return {
    ...result,
    notice:
      'Job is idempotent: duplicate subject keys are skipped. Not AI-driven.',
  }
}
