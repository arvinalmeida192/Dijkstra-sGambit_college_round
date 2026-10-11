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

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export function ProjectsPage() {
  const { token, user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [total, setTotal] = useState(0)
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
        const result = await listProjects(token!, { limit: 50 })
        if (cancelled) return
        setProjects(result.projects)
        setTotal(result.pagination.total)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load projects.',
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
        eyebrow="// Projects"
        title="Projects"
        meta={
          <span>
            {loading ? '…' : `${total} total`}
          </span>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-body text-sm text-dark/70 max-w-xl">
          Projects you own or have joined. Create a project as a client, then
          invite a freelancer with a shareable link.
        </p>
        {isClient ? (
          <Link to={routes.projectNew}>
            <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Create project
            </Button>
          </Link>
        ) : null}
      </div>

      {!isApiConfigured() ? (
        <Alert tone="warning">
          Set <code className="font-bold">VITE_API_BASE_URL</code> to load
          projects from the API.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {loading ? <LoadingBlock label="Loading projects" /> : null}

      {!loading && !error && projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description={
            isClient
              ? 'Create your first project to invite a freelancer and set terms.'
              : 'When a client invites you, the project will appear here after you accept.'
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
                  className="transition-transform group-hover:translate-x-[2px] group-hover:translate-y-[2px] group-hover:shadow-none"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display font-bold text-xl uppercase tracking-tight text-dark truncate">
                          {project.title}
                        </h3>
                        <Badge
                          tone={PROJECT_STATUS_TONES[project.status]}
                          dot
                        >
                          {PROJECT_STATUS_LABELS[project.status]}
                        </Badge>
                      </div>
                      {project.description ? (
                        <p className="font-body text-sm text-dark/70 line-clamp-2">
                          {project.description}
                        </p>
                      ) : null}
                      <p className="font-mono text-[11px] text-dark/50">
                        Updated {formatDate(project.updatedAt)}
                        {project.client
                          ? ` · Client: ${project.client.name}`
                          : null}
                        {project.freelancer
                          ? ` · Freelancer: ${project.freelancer.name}`
                          : ' · Awaiting freelancer'}
                      </p>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-accent font-bold shrink-0">
                      Open →
                    </span>
                  </div>
                </Panel>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </PageContainer>
  )
}
