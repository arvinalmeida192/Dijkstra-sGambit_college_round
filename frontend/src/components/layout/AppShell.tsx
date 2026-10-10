import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { BrandMark } from '../ui/BrandMark'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { PageContainer } from '../ui/PageContainer'
import { routes } from '../../lib/routes'
import { cn } from '../../lib/cn'
import { NotificationsBell } from './NotificationsBell'

const primaryNav = [
  { to: routes.dashboard, label: 'Dashboard' },
  { to: routes.projects, label: 'Projects' },
] as const

function navClassName({ isActive }: { isActive: boolean }) {
  return cn(
    'font-mono text-xs font-bold uppercase tracking-wider px-3 py-2 border-2 transition-colors whitespace-nowrap',
    isActive
      ? 'bg-dark text-white border-dark'
      : 'bg-transparent text-dark border-transparent hover:border-dark',
  )
}

function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/)
  if (!match) return null
  const id = match[1]
  return id === 'new' ? null : id
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const projectId = projectIdFromPath(pathname)
  const showProjectNav = Boolean(projectId)

  function onLogout() {
    logout()
    navigate(routes.login, { replace: true })
  }

  const projectNav = showProjectNav && projectId
    ? [
        { to: routes.project(projectId), label: 'Overview', end: true as const },
        { to: routes.agreement(projectId), label: 'Agreement' },
        { to: routes.progress(projectId), label: 'Progress' },
        { to: routes.disputes(projectId), label: 'Disputes' },
        { to: routes.payments(projectId), label: 'Payments' },
      ]
    : []

  return (
    <div className="min-h-screen bg-base flex flex-col">
      <header className="sticky top-0 z-50 bg-base/95 backdrop-blur-md border-b-2 border-dark">
        <PageContainer
          variant="app"
          className="h-16 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-6 min-w-0">
            <Link to={routes.dashboard} className="shrink-0">
              <BrandMark size="sm" />
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {primaryNav.map((item) => (
                <NavLink key={item.to} to={item.to} className={navClassName}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <NotificationsBell />
                <span className="font-mono text-[11px] uppercase tracking-wider text-dark/70 max-w-[12rem] truncate">
                  {user.name} · {user.role}
                </span>
                <Button variant="secondary" size="sm" onClick={onLogout}>
                  Sign out
                </Button>
              </>
            ) : null}
          </div>

          <IconButton
            label={mobileOpen ? 'Close menu' : 'Open menu'}
            className="md:hidden"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </IconButton>
        </PageContainer>

        {mobileOpen ? (
          <div className="md:hidden border-t-2 border-dark bg-surface">
            <PageContainer variant="app" className="py-4 flex flex-col gap-2">
              {primaryNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={navClassName}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
              {user ? (
                <>
                  <div className="px-1 py-1">
                    <NotificationsBell />
                  </div>
                  <button
                    type="button"
                    className={navClassName({ isActive: false })}
                    onClick={() => {
                      setMobileOpen(false)
                      onLogout()
                    }}
                  >
                    Sign out
                  </button>
                </>
              ) : null}
            </PageContainer>
          </div>
        ) : null}

        {projectNav.length > 0 ? (
          <div className="border-t-2 border-dark/15 bg-surface">
            <PageContainer
              variant="app"
              className="py-2 flex gap-1 overflow-x-auto"
            >
              {projectNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={'end' in item ? item.end : false}
                  className={navClassName}
                >
                  {item.label}
                </NavLink>
              ))}
            </PageContainer>
          </div>
        ) : null}
      </header>

      <main className="flex-1 pb-12 pt-6">
        <Outlet />
      </main>
    </div>
  )
}
