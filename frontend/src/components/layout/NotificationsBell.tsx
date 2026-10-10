import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { ApiError, isApiConfigured } from '../../lib/api/client'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../../lib/api/notifications'
import { routes } from '../../lib/routes'
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

export function NotificationsBell() {
  const { token } = useAuth()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] border-2 border-dark bg-white shadow-[var(--shadow-brutal)]">
          <div className="flex items-center justify-between gap-2 border-b-2 border-dark/15 px-3 py-2">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/60">
              Alerts
            </p>
            <Button size="sm" variant="ghost" onClick={() => void onMarkAll()}>
              Mark all read
            </Button>
          </div>
          <div className="max-h-80 overflow-y-auto">
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
                No deadline or inactivity alerts yet.
              </p>
            ) : null}
            <ul>
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`border-b border-dark/10 px-3 py-2 ${
                    n.readAt ? 'opacity-70' : 'bg-accent/5'
                  }`}
                >
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
                    <Link
                      to={routes.progress(n.projectId)}
                      className="mt-1 inline-block font-mono text-[10px] font-bold uppercase text-accent hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      Open progress
                    </Link>
                  ) : null}
                </li>
              ))}
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
