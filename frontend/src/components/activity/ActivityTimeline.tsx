import { useId, useState, type ReactNode } from 'react'
import {
  Bot,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Gavel,
  GitPullRequestArrow,
  Shield,
  Upload,
  Activity,
} from 'lucide-react'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { LoadingBlock } from '../ui/Spinner'
import type { AuditLog } from '../../lib/api/milestones'
import { cn } from '../../lib/cn'

export const ACTIVITY_PAGE_SIZE = 20

type ActivityTimelineProps = {
  items: AuditLog[]
  loading?: boolean
  loadingMore?: boolean
  error?: string | null
  total?: number
  onLoadMore?: () => void
  className?: string
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function actorRoleLabel(role?: string) {
  switch (role) {
    case 'CLIENT':
      return 'Client'
    case 'FREELANCER':
      return 'Freelancer'
    case 'ARBITRATOR':
      return 'Arbitrator'
    case 'SYSTEM':
      return 'System'
    default:
      return role ? role.replace(/_/g, ' ') : null
  }
}

function categoryIcon(category?: string): ReactNode {
  const className = 'h-3.5 w-3.5'
  switch (category) {
    case 'submission':
      return <Upload className={className} aria-hidden />
    case 'review':
      return <GitPullRequestArrow className={className} aria-hidden />
    case 'extension':
    case 'deadline':
      return <Clock3 className={className} aria-hidden />
    case 'payment':
      return <CircleDollarSign className={className} aria-hidden />
    case 'dispute':
      return <Gavel className={className} aria-hidden />
    case 'protection':
      return <Shield className={className} aria-hidden />
    case 'ai':
      return <Bot className={className} aria-hidden />
    default:
      return <Activity className={className} aria-hidden />
  }
}

function formatDetailValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function detailEntries(details: Record<string, unknown> | undefined) {
  if (!details) return []
  return Object.entries(details).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  )
}

function ActivityEntry({
  item,
  isLast,
}: {
  item: AuditLog
  isLast: boolean
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const summary = item.summary?.trim() || item.action
  const actorLabel =
    item.actorName || (item.actor === 'system' ? 'System' : 'Participant')
  const roleLabel = actorRoleLabel(item.actorRole)
  const details = item.details ?? item.metadata
  const entries = detailEntries(details)

  return (
    <li className="relative pl-10">
      {!isLast ? (
        <span
          className="absolute left-[11px] top-8 bottom-[-12px] w-px bg-dark/15"
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          'absolute left-0 top-2.5 z-[1] flex h-6 w-6 items-center justify-center border-2 border-dark bg-surface text-dark',
          open && 'bg-dark text-base',
        )}
        aria-hidden
      >
        {categoryIcon(item.category)}
      </span>

      <button
        type="button"
        className={cn(
          'w-full border-2 border-dark/10 bg-white/70 px-3 py-2.5 text-left transition-colors',
          'hover:border-dark/30 hover:bg-white',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          open && 'border-dark/40 bg-white',
        )}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 text-dark/50" aria-hidden>
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-body text-sm font-medium text-dark">{summary}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-dark/50">
              <time dateTime={item.createdAt}>
                {formatDateTime(item.createdAt)}
              </time>
              <span>{actorLabel}</span>
            </div>
          </div>
        </div>
      </button>

      {open ? (
        <div
          id={panelId}
          className="mt-2 space-y-2 border-2 border-dark/10 bg-surface/80 px-3 py-3"
        >
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/45">
            Event details
            <span className="sr-only"> (expanded)</span>
          </p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="font-mono text-[10px] uppercase text-dark/45">
                Type
              </dt>
              <dd className="break-all font-mono text-[11px] text-dark/80">
                {item.eventType || item.action}
              </dd>
            </div>
            {item.milestoneTitle || item.milestoneId ? (
              <div>
                <dt className="font-mono text-[10px] uppercase text-dark/45">
                  Milestone
                </dt>
                <dd className="break-all font-mono text-[11px] text-dark/80">
                  {item.milestoneTitle ||
                    (item.milestoneId
                      ? `${item.milestoneId.slice(0, 8)}…`
                      : '—')}
                </dd>
              </div>
            ) : null}
            {item.submissionId ? (
              <div>
                <dt className="font-mono text-[10px] uppercase text-dark/45">
                  Submission
                </dt>
                <dd className="break-all font-mono text-[11px] text-dark/80">
                  {item.submissionId.slice(0, 8)}…
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="font-mono text-[10px] uppercase text-dark/45">
                Actor
              </dt>
              <dd className="font-mono text-[11px] text-dark/80">
                {actorLabel}
                {roleLabel ? ` (${roleLabel})` : ''}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase text-dark/45">
                Occurred
              </dt>
              <dd className="font-mono text-[11px] text-dark/80">
                {formatDateTime(item.createdAt)}
              </dd>
            </div>
          </dl>

          {entries.length > 0 ? (
            <div className="space-y-1 border-t border-dark/10 pt-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/45">
                Metadata
              </p>
              <ul className="space-y-1">
                {entries.map(([key, value]) => (
                  <li
                    key={key}
                    className="flex flex-wrap gap-x-2 font-mono text-[11px] text-dark/75"
                  >
                    <span className="text-dark/45">{key}:</span>
                    <span className="break-all">{formatDetailValue(value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="font-mono text-[11px] text-dark/45">
              No additional metadata for this event.
            </p>
          )}
        </div>
      ) : null}
    </li>
  )
}

export function ActivityTimeline({
  items,
  loading = false,
  loadingMore = false,
  error = null,
  total,
  onLoadMore,
  className,
}: ActivityTimelineProps) {
  const hasMore =
    typeof total === 'number' ? items.length < total : Boolean(onLoadMore)

  if (loading && items.length === 0) {
    return <LoadingBlock label="Loading activity" />
  }

  if (error && items.length === 0) {
    return (
      <Alert tone="danger" role="alert">
        {error}
      </Alert>
    )
  }

  if (!loading && items.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="Agreement, submission, review, payment, and protection events will appear here as the project progresses."
        className={className}
      />
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      <ol className="space-y-3">
        {items.map((item, index) => (
          <ActivityEntry
            key={item.id}
            item={item}
            isLast={index === items.length - 1 && !hasMore}
          />
        ))}
      </ol>

      {hasMore && onLoadMore ? (
        <div className="flex justify-center pt-1">
          <Button
            variant="secondary"
            size="sm"
            loading={loadingMore}
            onClick={onLoadMore}
          >
            Load more
          </Button>
        </div>
      ) : null}

      {typeof total === 'number' ? (
        <p className="text-center font-mono text-[10px] uppercase tracking-wider text-dark/40">
          Showing {items.length} of {total}
        </p>
      ) : null}
    </div>
  )
}
