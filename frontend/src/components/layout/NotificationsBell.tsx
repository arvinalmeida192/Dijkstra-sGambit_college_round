import { useCallback, useEffect, useState } from 'react'
import { Bell, Check, ExternalLink, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { ApiError, isApiConfigured } from '../../lib/api/client'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../../lib/api/notifications'
import {
  acceptInvitation,
  rejectInvitation,
  type InvitationStatus,
} from '../../lib/api/projects'
import { routes } from '../../lib/routes'
import { Alert } from '../ui/Alert'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function invitationStatusTone(status: InvitationStatus) {
  switch (status) {
    case 'PENDING':
      return 'warning' as const
    case 'ACCEPTED':
      return 'success' as const
    case 'REJECTED':
      return 'danger' as const
    case 'REVOKED':
    case 'EXPIRED':
    default:
      return 'neutral' as const
  }
}

export function NotificationsBell() {
  const { token, user } = useAuth()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null)
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null)
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})
  const [actionSuccesses, setActionSuccesses] = useState<Record<string, string>>({})

  const unread = items.filter((n) => !n.readAt).length

  const refresh = useCallback(async () => {
    if (!token || !isApiConfigured()) return
    setLoading(true)
    setError(null)
    try {
      const res = await listNotifications(token)
      setItems(res.notifications)
      setNotice(res.notice)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not load notifications.',
      )
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(id)
  }, [refresh])

  async function onMarkOne(id: string) {
    if (!token) return
    try {
      await markNotificationRead(token, id)
      setItems((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
        ),
      )
    } catch {
      /* ignore — list will refresh */
    }
  }

  async function onMarkAll() {
    if (!token) return
    try {
      await markAllNotificationsRead(token)
      setItems((prev) =>
        prev.map((n) => ({
          ...n,
          readAt: n.readAt ?? new Date().toISOString(),
        })),
      )
    } catch {
      /* ignore */
    }
  }

  async function handleAcceptInvite(notification: AppNotification) {
    if (!token || !notification.invitation || busyInvitationId) return
    const inv = notification.invitation
    setBusyInvitationId(inv.id)
    setConfirmRejectId(null)
    setActionErrors((prev) => {
      const next = { ...prev }
      delete next[notification.id]
      return next
    })
    setActionSuccesses((prev) => {
      const next = { ...prev }
      delete next[notification.id]
      return next
    })

    try {
      await acceptInvitation(token, inv.token)
      if (!notification.readAt) {
        void onMarkOne(notification.id)
      }
      setItems((prev) =>
        prev.map((n) =>
          n.id === notification.id && n.invitation
            ? {
                ...n,
                readAt: n.readAt ?? new Date().toISOString(),
                invitation: {
                  ...n.invitation,
                  status: 'ACCEPTED',
                  hasFreelancer: true,
                  acceptedAt: new Date().toISOString(),
                },
              }
            : n,
        ),
      )
      setActionSuccesses((prev) => ({
        ...prev,
        [notification.id]:
          'Invitation accepted! Review the project and agreement before work begins.',
      }))
      window.dispatchEvent(new CustomEvent('fairwork:invitation-updated'))
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Could not accept invitation.'
      setActionErrors((prev) => ({
        ...prev,
        [notification.id]: message,
      }))
      void refresh()
    } finally {
      setBusyInvitationId(null)
    }
  }

  async function handleRejectInvite(notification: AppNotification) {
    if (!token || !notification.invitation || busyInvitationId) return
    const inv = notification.invitation
    setBusyInvitationId(inv.id)
    setActionErrors((prev) => {
      const next = { ...prev }
      delete next[notification.id]
      return next
    })
    setActionSuccesses((prev) => {
      const next = { ...prev }
      delete next[notification.id]
      return next
    })

    try {
      await rejectInvitation(token, inv.token)
      setConfirmRejectId(null)
      if (!notification.readAt) {
        void onMarkOne(notification.id)
      }
      setItems((prev) =>
        prev.map((n) =>
          n.id === notification.id && n.invitation
            ? {
                ...n,
                readAt: n.readAt ?? new Date().toISOString(),
                invitation: {
                  ...n.invitation,
                  status: 'REJECTED',
                  rejectedAt: new Date().toISOString(),
                },
              }
            : n,
        ),
      )
      setActionSuccesses((prev) => ({
        ...prev,
        [notification.id]: 'Invitation declined.',
      }))
      window.dispatchEvent(new CustomEvent('fairwork:invitation-updated'))
    } catch (err) {
      setConfirmRejectId(null)
      const message =
        err instanceof ApiError
          ? err.message
          : 'Could not decline invitation.'
      setActionErrors((prev) => ({
        ...prev,
        [notification.id]: message,
      }))
      void refresh()
    } finally {
      setBusyInvitationId(null)
    }
  }

  if (!token || !isApiConfigured()) return null

  return (
    <div className="relative">
      <IconButton
        label={
          unread > 0
            ? `Notifications, ${unread} unread`
            : 'Notifications'
        }
        onClick={() => {
          setOpen((v) => !v)
          if (!open) void refresh()
        }}
      >
        <span className="relative inline-flex">
          <Bell className="w-4 h-4" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center bg-accent px-0.5 font-mono text-[8px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </span>
      </IconButton>

      {open ? (
        <div
          role="region"
          aria-label="Notifications panel"
          className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] border-2 border-dark bg-white shadow-[var(--shadow-brutal)]"
        >
          <div className="flex items-center justify-between gap-2 border-b-2 border-dark/15 px-3 py-2">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/60">
              Notifications & Alerts
            </p>
            <Button size="sm" variant="ghost" onClick={() => void onMarkAll()}>
              Mark all read
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-3 py-4 font-mono text-xs text-dark/50">
                Loading…
              </p>
            ) : null}
            {error ? (
              <p className="px-3 py-3 font-mono text-xs text-status-danger">
                {error}
              </p>
            ) : null}
            {!loading && !error && items.length === 0 ? (
              <p className="px-3 py-4 font-mono text-xs text-dark/50">
                No notifications or alerts yet.
              </p>
            ) : null}
            <ul>
              {items.map((n) => {
                const inv = n.invitation
                const isWorkInvite = n.kind === 'PROJECT_INVITATION' && inv
                const isBusy = Boolean(inv && busyInvitationId === inv.id)
                const isConfirmingReject = Boolean(inv && confirmRejectId === inv.id)
                const canRespondToInvite =
                  Boolean(
                    isWorkInvite &&
                      user?.role === 'FREELANCER' &&
                      inv.status === 'PENDING' &&
                      !inv.hasFreelancer &&
                      inv.projectStatus !== 'CANCELLED' &&
                      inv.projectStatus !== 'COMPLETED',
                  )
                const itemError = actionErrors[n.id]
                const itemSuccess = actionSuccesses[n.id]

                return (
                  <li
                    key={n.id}
                    className={`border-b border-dark/10 px-3 py-2.5 ${
                      n.readAt ? 'opacity-80' : 'bg-accent/5'
                    }`}
                  >
                    {isWorkInvite ? (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            className="text-left flex-1"
                            onClick={() => void onMarkOne(n.id)}
                          >
                            <p className="font-mono text-[11px] font-bold uppercase tracking-tight text-dark">
                              New work invitation
                            </p>
                          </button>
                          <Badge tone={invitationStatusTone(inv.status)}>
                            {inv.status === 'REVOKED' ? 'WITHDRAWN' : inv.status}
                          </Badge>
                        </div>

                        <div className="space-y-0.5 font-mono text-[11px] text-dark/80">
                          {inv.sender ? (
                            <p>
                              <span className="font-bold text-dark/60">Client:</span>{' '}
                              {inv.sender.name} ({inv.sender.email})
                            </p>
                          ) : null}
                          <p>
                            <span className="font-bold text-dark/60">Project:</span>{' '}
                            {inv.projectTitle ?? n.title}
                          </p>
                          {inv.message ? (
                            <p className="font-body text-xs text-dark/75 pt-0.5 italic">
                              “{inv.message}”
                            </p>
                          ) : (
                            <p className="font-body text-xs text-dark/70 pt-0.5">
                              {n.body}
                            </p>
                          )}
                        </div>

                        <p className="font-mono text-[10px] text-dark/45">
                          Invited {formatWhen(inv.createdAt ?? n.createdAt)}
                        </p>

                        {itemError ? (
                          <Alert tone="danger" role="alert">
                            <span className="text-xs">{itemError}</span>
                          </Alert>
                        ) : null}

                        {itemSuccess ? (
                          <Alert tone="success" role="status">
                            <span className="text-xs">{itemSuccess}</span>
                          </Alert>
                        ) : null}

                        {canRespondToInvite && !isConfirmingReject ? (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="primary"
                              loading={isBusy}
                              disabled={isBusy}
                              leftIcon={<Check className="w-3 h-3" />}
                              onClick={() => void handleAcceptInvite(n)}
                              aria-label={`Accept invitation for ${inv.projectTitle ?? 'project'}`}
                            >
                              Accept invitation
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={isBusy}
                              leftIcon={<X className="w-3 h-3" />}
                              onClick={() => setConfirmRejectId(inv.id)}
                              aria-label={`Reject invitation for ${inv.projectTitle ?? 'project'}`}
                            >
                              Reject invitation
                            </Button>
                            <Link
                              to={routes.invite(inv.token)}
                              className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase text-accent hover:underline"
                              onClick={() => setOpen(false)}
                            >
                              View details <ExternalLink className="w-2.5 h-2.5" />
                            </Link>
                          </div>
                        ) : null}

                        {canRespondToInvite && isConfirmingReject ? (
                          <div
                            role="alertdialog"
                            aria-label="Confirm invitation rejection"
                            className="border-2 border-status-danger/40 bg-status-danger/5 p-2.5 space-y-2"
                          >
                            <p className="font-mono text-[11px] font-bold text-dark">
                              Decline invitation to “{inv.projectTitle ?? 'this project'}”?
                            </p>
                            <p className="font-body text-xs text-dark/70">
                              This action cannot be undone unless the client sends a new invitation.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="danger"
                                loading={isBusy}
                                disabled={isBusy}
                                onClick={() => void handleRejectInvite(n)}
                              >
                                Confirm reject
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={isBusy}
                                onClick={() => setConfirmRejectId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : null}

                        {!canRespondToInvite ? (
                          <div className="flex flex-wrap items-center gap-3 pt-1">
                            {inv.status === 'ACCEPTED' && n.projectId ? (
                              <>
                                <Link
                                  to={routes.project(n.projectId)}
                                  className="font-mono text-[10px] font-bold uppercase text-accent hover:underline"
                                  onClick={() => setOpen(false)}
                                >
                                  View project
                                </Link>
                                <Link
                                  to={routes.agreement(n.projectId)}
                                  className="font-mono text-[10px] font-bold uppercase text-accent hover:underline"
                                  onClick={() => setOpen(false)}
                                >
                                  Review agreement
                                </Link>
                              </>
                            ) : (
                              <Link
                                to={routes.invite(inv.token)}
                                className="font-mono text-[10px] font-bold uppercase text-accent hover:underline"
                                onClick={() => setOpen(false)}
                              >
                                View details
                              </Link>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => void onMarkOne(n.id)}
                        >
                          <p className="font-mono text-[11px] font-bold text-dark">
                            {n.title}
                          </p>
                          <p className="mt-0.5 font-body text-xs text-dark/70">
                            {n.body}
                          </p>
                          <p className="mt-1 font-mono text-[10px] text-dark/45">
                            {n.kind.replaceAll('_', ' ')} · {formatWhen(n.createdAt)}
                          </p>
                        </button>
                        {n.projectId ? (
                          <div className="mt-1 flex flex-wrap gap-3">
                            <Link
                              to={
                                n.kind === 'INVITATION_ACCEPTED' ||
                                n.kind === 'INVITATION_REJECTED'
                                  ? routes.project(n.projectId)
                                  : routes.progress(n.projectId)
                              }
                              className="inline-block font-mono text-[10px] font-bold uppercase text-accent hover:underline"
                              onClick={() => setOpen(false)}
                            >
                              {n.kind === 'INVITATION_ACCEPTED' ||
                              n.kind === 'INVITATION_REJECTED'
                                ? 'View project'
                                : 'Open progress'}
                            </Link>
                          </div>
                        ) : null}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          {notice ? (
            <p className="border-t border-dark/15 px-3 py-2 font-mono text-[9px] text-dark/45">
              {notice}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
