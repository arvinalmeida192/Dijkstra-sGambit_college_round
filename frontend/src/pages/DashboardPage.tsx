import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingBlock } from '../components/ui/Spinner'
import { PageContainer } from '../components/ui/PageContainer'
import { Panel } from '../components/ui/Panel'
import { SectionHeader } from '../components/ui/SectionHeader'
import { ApiError, isApiConfigured } from '../lib/api/client'
import { listProjects, type Project } from '../lib/api/projects'
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
} from '../lib/projectStatus'
import { routes } from '../lib/routes'

export function DashboardPage() {
  const { token, user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isClient = user?.role === 'CLIENT'

  useEffect(() => {
    if (!token || !isApiConfigured()) {
      setLoading(false)
      return
    }

    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const result = await listProjects(token!, { limit: 5 })
        if (cancelled) return
        setProjects(result.projects)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load dashboard.',
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    const handler = () => void load()
    window.addEventListener('fairwork:invitation-updated', handler)
    return () => {
      cancelled = true
      window.removeEventListener('fairwork:invitation-updated', handler)
    }
  }, [token])

  return (
    <PageContainer variant="app" className="space-y-6">
      <SectionHeader
        eyebrow="// App"
        title="Dashboard"
        meta={
          user ? (
            <span>
              {user.name} · {user.role}
            </span>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-body text-sm text-dark/70 max-w-xl">
          Your recent projects. Agreements, milestones, and payments connect in
          later phases.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to={routes.projects}>
            <Button size="sm" variant="secondary">
              All projects
            </Button>
          </Link>
          {isClient ? (
            <Link to={routes.projectNew}>
              <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}>
                New project
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      {!isApiConfigured() ? (
        <Alert tone="warning">
          Set <code className="font-bold">VITE_API_BASE_URL</code> to load live
          data.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {loading ? <LoadingBlock label="Loading dashboard" /> : null}

      {!loading && !error && projects.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description={
            isClient
              ? 'Create a project to get started.'
              : 'Accept an invitation to see projects on your dashboard.'
          }
          action={
            isClient ? (
              <Link to={routes.projectNew}>
                <Button size="sm">Create project</Button>
              </Link>
            ) : null
          }
        />
      ) : null}

      {!loading && projects.length > 0 ? (
        <ul className="space-y-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link to={routes.project(project.id)} className="block group">
                <Panel
                  tone="surface"
                  shadow="sm"
                  padding="md"
                  className="flex flex-wrap items-center justify-between gap-3 transition-transform group-hover:translate-x-[2px] group-hover:translate-y-[2px] group-hover:shadow-none"
                >
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-display font-bold text-lg uppercase tracking-tight truncate">
                      {project.title}
                    </span>
                    <Badge tone={PROJECT_STATUS_TONES[project.status]} dot>
                      {PROJECT_STATUS_LABELS[project.status]}
                    </Badge>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-accent font-bold">
                    Open →
                  </span>
                </Panel>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </PageContainer>
  )
}
