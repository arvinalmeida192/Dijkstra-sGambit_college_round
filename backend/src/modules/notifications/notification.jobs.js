import { env } from '../../config/env.js'
import {
  finishJobRun,
  hasOpenDispute,
  insertJobRun,
  insertNotificationIgnoreConflict,
  listMilestonesForDeadlineScan,
  listMilestonesForInactivityScan,
  listMilestonesForReviewScan,
} from './notification.repository.js'
import { applyStatusPatch } from '../milestones/milestone.repository.js'
import { trySystemAutoRelease } from '../milestones/milestone.protection.js'
import {
  insertAuditLog,
  listSubmissionsForMilestone,
} from '../submissions/submission.repository.js'

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
 * Deterministic deadline + review expiry + inactivity scan. Idempotent via unique subject_key.
 * Independent of AI judgment.
 */
export async function runNotificationJobs({
  now = new Date(),
  deadlineWarnDays = env.deadlineWarnDays,
  inactivityDays = env.inactivityDays,
} = {}) {
  const job = await insertJobRun({
    jobName: 'participant_protection_scan',
    metadata: {
      deadlineWarnDays,
      inactivityDays,
      asOf: now.toISOString(),
    },
  })

  let created = 0
  let skipped = 0
  const dayKey = utcDateKey(now)

  // 1. Deadline & Grace Period Scan
  const deadlineRows = await listMilestonesForDeadlineScan()
  for (const row of deadlineRows) {
    const days = daysUntilDue(row.due_date, now)
    const graceDays = row.grace_period_days ?? 3
    let kind = null
    let title = null
    let body = null
    let subjectKey = null

    if (days < 0) {
      const daysPast = Math.abs(days)
      if (daysPast <= graceDays) {
        if (daysPast === graceDays) {
          // Final warning: 24h before grace expires
          kind = 'GRACE_EXPIRING_WARNING'
          subjectKey = `grace:warning:${row.id}:${dayKey}`
          title = `Final warning: Grace period expiring for ${row.title}`
          body = `Milestone "${row.title}" is in grace period (day ${daysPast} of ${graceDays}). In 24 hours, client cancellation and funds reclaim will become eligible.`
          await applyStatusPatch(row.id, { escalationStatus: 'WARNING_SENT' })
        } else {
          // Grace period active reminder
          kind = 'DEADLINE_PASSED_GRACE_ACTIVE'
          subjectKey = `grace:active:${row.id}:${dayKey}`
          title = `Deadline passed (grace period active): ${row.title}`
          body = `Milestone "${row.title}" passed its deadline on ${row.due_date}. Grace period is active (day ${daysPast} of ${graceDays}).`
          await applyStatusPatch(row.id, { escalationStatus: 'REMINDER_SENT' })
        }
      } else {
        // Grace period expired — never escalate past an open dispute.
        const disputed = await hasOpenDispute(row.id)
        if (disputed || row.status === 'DISPUTED') {
          continue
        }

        if (row.status === 'IN_PROGRESS' || row.status === 'REVISION_REQUESTED') {
          const subs = await listSubmissionsForMilestone(row.id)
          if (subs.length === 0) {
            await applyStatusPatch(row.id, {
              status: 'OVERDUE',
              escalationStatus: 'ACTION_ELIGIBLE',
              statusNote: 'Milestone overdue: deadline and grace period expired with no submission.',
            })
            await insertAuditLog({
              actorId: null,
              projectId: row.project_id,
              milestoneId: row.id,
              action: 'OVERDUE_DECLARED',
              metadata: {
                daysPast,
                graceDays,
                asOf: now.toISOString(),
                rule: 'deadline_plus_grace',
                oldStatus: row.status,
                newStatus: 'OVERDUE',
              },
            })
          }
        } else if (row.status === 'OVERDUE') {
          await applyStatusPatch(row.id, { escalationStatus: 'ACTION_ELIGIBLE' })
        }

        kind = 'DEADLINE_PASSED'
        subjectKey = `deadline:passed:${row.id}:${dayKey}`
        title = `Milestone Overdue: ${row.title}`
        body = `Milestone "${row.title}" grace period has ended with no delivery. The client is now eligible to cancel and reclaim unreleased funds.`
      }
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

  // 2. Client Review Window Expiry & Auto-Approval Scan
  const reviewRows = await listMilestonesForReviewScan()
  for (const row of reviewRows) {
    // A timeout or auto-action NEVER bypasses an open dispute!
    if (row.status === 'DISPUTED') continue
    const isDisputed = await hasOpenDispute(row.id)
    if (isDisputed) continue

    let reviewDueAt = row.review_due_at ? new Date(row.review_due_at) : null
    if (!reviewDueAt && row.submitted_at) {
      const windowDays = row.review_window_days ?? 7
      reviewDueAt = new Date(new Date(row.submitted_at).getTime() + windowDays * 24 * 60 * 60 * 1000)
    }

    if (!reviewDueAt) continue

    const msRemaining = reviewDueAt.getTime() - now.getTime()
    const hoursRemaining = msRemaining / (1000 * 60 * 60)

    if (hoursRemaining > 0 && hoursRemaining <= 24) {
      // 24h Warning reminder before review window closes
      const subjectKey = `review:warning:${row.id}:${dayKey}`
      for (const userId of recipientIds(row)) {
        const inserted = await insertNotificationIgnoreConflict({
          userId,
          projectId: row.project_id,
          milestoneId: row.id,
          kind: 'REVIEW_EXPIRING_WARNING',
          subjectKey,
          title: `Action needed: Review window expiring for ${row.title}`,
          body: `Client review window for "${row.title}" will expire in less than 24 hours. If no review or dispute is recorded, the milestone will automatically approve.`,
        })
        if (inserted) created += 1
        else skipped += 1
      }
      await applyStatusPatch(row.id, { escalationStatus: 'WARNING_SENT' })
    } else if (msRemaining <= 0) {
      // Window expired! Auto-approve milestone (idempotent: scan only picks SUBMITTED/IN_REVIEW)
      await applyStatusPatch(row.id, {
        status: 'APPROVED',
        approvedAt: now,
        statusNote: 'Auto-approved: client review window expired without review or dispute.',
        escalationStatus: 'AUTO_APPROVED',
      })

      await insertAuditLog({
        actorId: null,
        projectId: row.project_id,
        milestoneId: row.id,
        action: 'AUTO_APPROVAL_TRIGGERED',
        metadata: {
          reviewDueAt: reviewDueAt.toISOString(),
          autoApprovedAt: now.toISOString(),
          rule: 'review_window_expired',
          oldStatus: row.status,
          newStatus: 'APPROVED',
        },
      })

      // Optional operator on-chain auto-release (local/test). Retries cannot double-pay.
      const chain = await trySystemAutoRelease(row.id)
      if (chain.submitted) {
        await insertAuditLog({
          actorId: null,
          projectId: row.project_id,
          milestoneId: row.id,
          action: 'AUTO_RELEASE_EXECUTED',
          metadata: {
            txHash: chain.txHash,
            duplicate: Boolean(chain.duplicate),
            rule: 'operator_auto_release',
          },
        })
      }

      const subjectKey = `review:auto_approved:${row.id}`
      for (const userId of recipientIds(row)) {
        const inserted = await insertNotificationIgnoreConflict({
          userId,
          projectId: row.project_id,
          milestoneId: row.id,
          kind: 'AUTO_APPROVED',
          subjectKey,
          title: `Milestone Auto-Approved: ${row.title}`,
          body: `Milestone "${row.title}" was automatically approved because the review window expired without dispute or rejection. Payment release is now eligible.`,
        })
        if (inserted) created += 1
        else skipped += 1
      }
    }
  }

  // 3. Inactivity Scan
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
