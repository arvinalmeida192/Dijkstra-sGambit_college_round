import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Copy, Link2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { LoadingBlock } from '../components/ui/Spinner'
import { PageContainer } from '../components/ui/PageContainer'
import { Panel } from '../components/ui/Panel'
import { SectionHeader } from '../components/ui/SectionHeader'
import { ApiError, isApiConfigured } from '../lib/api/client'
import {
  createInvitation,
  getProject,
  inviteShareUrl,
  type Project,
  type ProjectInvitation,
} from '../lib/api/projects'
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
} from '../lib/projectStatus'
import { routes } from '../lib/routes'

function formatDate(iso: string) {
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

export function ProjectDetailPage() {
  const { projectId = '' } = useParams()
  const { token, user } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!token || !projectId || !isApiConfigured()) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await getProject(token, projectId)
      setProject(result.project)
    } catch (err) {
      setProject(null)
      setError(
        err instanceof ApiError ? err.message : 'Could not load project.',
      )
    } finally {
      setLoading(false)
    }
  }, [token, projectId])

  useEffect(() => {
    void load()
  }, [load])

  const isOwner =
    Boolean(user && project && user.id === project.clientId)
  const pendingInvite = project?.invitations?.find(
    (inv) => inv.status === 'PENDING',
  )
  const canInvite =
    isOwner && !project?.freelancerId && project?.status !== 'CANCELLED'

  async function onCreateInvite(event: FormEvent) {
    event.preventDefault()
    if (!token || !project) return
    setInviteError(null)
    setInviteSuccess(null)
    setCopied(false)
    setInviteLoading(true)
    try {
      const email = inviteEmail.trim() || undefined
      const result = await createInvitation(token, project.id, { email })
      const shareUrl = inviteShareUrl(result.invitation.token)
      setInviteSuccess(shareUrl)
      setInviteEmail('')
      await load()
    } catch (err) {
      setInviteError(
        err instanceof ApiError
          ? err.message
          : 'Could not create invitation.',
      )
    } finally {
      setInviteLoading(false)
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setInviteError('Could not copy to clipboard. Select the link manually.')
    }
  }

  const shareUrlForPending = pendingInvite
    ? inviteShareUrl(pendingInvite.token)
    : inviteSuccess

  return (
    <PageContainer variant="app" className="space-y-6">
      <SectionHeader
        eyebrow="// Project"
        title={project?.title ?? 'Project'}
        meta={
          <Link
            to={routes.projects}
            className="font-mono text-xs font-bold uppercase tracking-wider text-accent hover:underline"
          >
            ← Projects
          </Link>
        }
      />

      {!isApiConfigured() ? (
        <Alert tone="warning">
          Set <code className="font-bold">VITE_API_BASE_URL</code> to load
          project details.
        </Alert>
      ) : null}

      {loading ? <LoadingBlock label="Loading project" /> : null}

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {!loading && project ? (
        <>
          <Panel tone="surface" shadow="sm" className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={PROJECT_STATUS_TONES[project.status]} dot>
                {PROJECT_STATUS_LABELS[project.status]}
              </Badge>
              <span className="font-mono text-[11px] text-dark/50">
                Created {formatDate(project.createdAt)}
              </span>
            </div>

            {project.description ? (
              <p className="font-body text-sm text-dark/80 whitespace-pre-wrap">
                {project.description}
              </p>
            ) : (
              <p className="font-body text-sm text-dark/50 italic">
                No description provided.
              </p>
            )}

            {project.externalUrl ? (
              <div className="space-y-1">
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
                  External reference
                </p>
                <a
                  href={project.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-accent break-all hover:underline"
                >
                  {project.externalUrl}
                </a>
                <p className="font-mono text-[10px] text-dark/50">
                  Reference only — Fairwork does not control external platforms.
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t-2 border-dark/10">
              <ParticipantCard
                label="Client"
                name={project.client?.name}
                email={project.client?.email}
              />
              <ParticipantCard
                label="Freelancer"
                name={project.freelancer?.name}
                email={project.freelancer?.email}
                empty="Not assigned yet"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Link to={routes.agreement(project.id)}>
                <Button size="sm" variant="secondary">
                  Agreement
                </Button>
              </Link>
              <Link to={routes.progress(project.id)}>
                <Button size="sm" variant="secondary">
                  Progress
                </Button>
              </Link>
              <Link to={routes.disputes(project.id)}>
                <Button size="sm" variant="secondary">
                  Disputes
                </Button>
              </Link>
              <Link to={routes.payments(project.id)}>
                <Button size="sm" variant="secondary">
                  Payments
                </Button>
              </Link>
            </div>
          </Panel>

          {canInvite ? (
            <Panel tone="surface" shadow="sm" className="space-y-4">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-accent" aria-hidden />
                <h3 className="font-display font-bold text-lg uppercase tracking-tight">
                  Invite freelancer
                </h3>
              </div>
              <p className="font-body text-sm text-dark/70">
                Generate a shareable link. Optionally lock the invite to an
                email address. Creating a new invite revokes any previous
                pending link.
              </p>

              <form
                onSubmit={onCreateInvite}
                className="flex flex-col sm:flex-row gap-3 items-end"
              >
                <div className="flex-1 w-full">
                  <Input
                    label="Freelancer email (optional)"
                    name="inviteEmail"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="freelancer@studio.design"
                    disabled={inviteLoading}
                  />
                </div>
                <Button type="submit" loading={inviteLoading} size="md">
                  {pendingInvite ? 'Regenerate link' : 'Create invite'}
                </Button>
              </form>

              {inviteError ? (
                <Alert tone="danger" role="alert">
                  {inviteError}
                </Alert>
              ) : null}

              {shareUrlForPending ? (
                <div className="space-y-2">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
                    Shareable link
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <code className="flex-1 p-3 bg-white border-2 border-dark font-mono text-[11px] break-all">
                      {shareUrlForPending}
                    </code>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      leftIcon={<Copy className="w-3.5 h-3.5" />}
                      onClick={() => void copyLink(shareUrlForPending)}
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  {pendingInvite ? (
                    <p className="font-mono text-[11px] text-dark/50">
                      Expires {formatDate(pendingInvite.expiresAt)}
                      {pendingInvite.invitedEmail
                        ? ` · Locked to ${pendingInvite.invitedEmail}`
                        : ' · Open invite'}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {isOwner && project.invitations && project.invitations.length > 0 ? (
                <InvitationHistory invitations={project.invitations} />
              ) : null}
            </Panel>
          ) : null}

          {isOwner && project.freelancerId ? (
            <Alert tone="success">
              Freelancer assigned. Invitation controls are closed for this
              project.
            </Alert>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  )
}

function ParticipantCard({
  label,
  name,
  email,
  empty,
}: {
  label: string
  name?: string | null
  email?: string | null
  empty?: string
}) {
  return (
    <div>
      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50 mb-1">
        {label}
      </p>
      {name ? (
        <>
          <p className="font-body text-sm font-bold text-dark">{name}</p>
          {email ? (
            <p className="font-mono text-[11px] text-dark/60">{email}</p>
          ) : null}
        </>
      ) : (
        <p className="font-body text-sm text-dark/50">{empty ?? '—'}</p>
      )}
    </div>
  )
}

function InvitationHistory({
  invitations,
}: {
  invitations: ProjectInvitation[]
}) {
  return (
    <div className="pt-3 border-t-2 border-dark/10 space-y-2">
      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
        Invitation history
      </p>
      <ul className="space-y-1">
        {invitations.map((inv) => (
          <li
            key={inv.id}
            className="font-mono text-[11px] text-dark/70 flex flex-wrap gap-x-3 gap-y-1"
          >
            <Badge
              tone={
                inv.status === 'PENDING'
                  ? 'warning'
                  : inv.status === 'ACCEPTED'
                    ? 'success'
                    : 'neutral'
              }
            >
              {inv.status}
            </Badge>
            <span>{inv.invitedEmail ?? 'Open link'}</span>
            <span className="text-dark/40">
              {formatDate(inv.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
