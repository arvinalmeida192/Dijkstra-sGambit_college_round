import { env } from '../../config/env.js'
import {
  finishJobRun,
  insertJobRun,
  insertNotificationIgnoreConflict,
  listMilestonesForDeadlineScan,
  listMilestonesForInactivityScan,
} from './notification.repository.js'

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

/** Normalize pg DATE / string / Date to YYYY-MM-DD. */
function toDateOnly(value) {
  if (value == null) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return null
}

function daysUntilDue(dueDateValue, now = new Date()) {
  const dueDateStr = toDateOnly(dueDateValue)
  if (!dueDateStr) return Number.POSITIVE_INFINITY
  // due_date is YYYY-MM-DD (date-only)
  const due = new Date(`${dueDateStr}T23:59:59.000Z`)
  const ms = due.getTime() - now.getTime()
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

function recipientIds(row) {
  const ids = new Set()
  if (row.client_id) ids.add(row.client_id)
  if (row.freelancer_id) ids.add(row.freelancer_id)
  return [...ids]
}

/**
 * Deterministic deadline + inactivity scan. Idempotent via unique subject_key.
 * Independent of AI judgment.
 */
export async function runNotificationJobs({
  now = new Date(),
  deadlineWarnDays = env.deadlineWarnDays,
  inactivityDays = env.inactivityDays,
} = {}) {
  const job = await insertJobRun({
    jobName: 'deadline_inactivity_scan',
    metadata: {
      deadlineWarnDays,
      inactivityDays,
      asOf: now.toISOString(),
    },
  })

  let created = 0
  let skipped = 0
  const dayKey = utcDateKey(now)

  const deadlineRows = await listMilestonesForDeadlineScan()
  for (const row of deadlineRows) {
    const days = daysUntilDue(row.due_date, now)
    let kind = null
    let title = null
    let body = null
    let subjectKey = null

    if (days < 0) {
      kind = 'DEADLINE_PASSED'
      subjectKey = `deadline:passed:${row.id}:${dayKey}`
      title = `Deadline passed: ${row.title}`
      body = `Milestone "${row.title}" on project "${row.project_title}" was due on ${row.due_date}. This alert is rule-based, not AI-generated.`
    } else if (days <= deadlineWarnDays) {
      kind = 'DEADLINE_APPROACHING'
      subjectKey = `deadline:warn:${row.id}:${row.due_date}`
      title = `Deadline approaching: ${row.title}`
      body = `Milestone "${row.title}" is due on ${row.due_date} (${days} day(s) remaining). This alert is rule-based, not AI-generated.`
    } else {
      continue
    }

    for (const userId of recipientIds(row)) {
      const inserted = await insertNotificationIgnoreConflict({
        userId,
        projectId: row.project_id,
        milestoneId: row.id,
        kind,
        subjectKey,
        title,
        body,
      })
      if (inserted) created += 1
      else skipped += 1
    }
  }

  const inactiveRows = await listMilestonesForInactivityScan({ inactivityDays })
  for (const row of inactiveRows) {
    const subjectKey = `inactivity:${row.id}:${dayKey}`
    const title = `Inactivity: ${row.title}`
    const body = `No recent submission activity on milestone "${row.title}" (project "${row.project_title}") for ${inactivityDays}+ days. This alert is rule-based, not AI-generated.`
    for (const userId of recipientIds(row)) {
      const inserted = await insertNotificationIgnoreConflict({
        userId,
        projectId: row.project_id,
        milestoneId: row.id,
        kind: 'INACTIVITY',
        subjectKey,
        title,
        body,
      })
      if (inserted) created += 1
      else skipped += 1
    }
  }

  const finished = await finishJobRun(job.id, {
    createdCount: created,
    skippedCount: skipped,
    metadata: { dayKey },
  })

  return {
    jobId: finished.id,
    created,
    skipped,
    finishedAt: finished.finished_at?.toISOString?.() ?? finished.finished_at,
  }
}

let intervalHandle = null

export function startNotificationScheduler() {
  if (!env.notificationJobEnabled || env.isTest) return null
  if (intervalHandle) return intervalHandle

  const tick = () => {
    runNotificationJobs().catch((err) => {
      console.error('[notifications] job failed:', err.message)
    })
  }
  // Initial delayed tick so boot is not blocked.
  setTimeout(tick, 5_000)
  intervalHandle = setInterval(tick, env.notificationJobIntervalMs)
  if (typeof intervalHandle.unref === 'function') intervalHandle.unref()
  return intervalHandle
}

export function stopNotificationScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}
