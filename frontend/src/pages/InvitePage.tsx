import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { LoadingBlock } from '../components/ui/Spinner'
import { PageContainer } from '../components/ui/PageContainer'
import { Panel } from '../components/ui/Panel'
import { SectionHeader } from '../components/ui/SectionHeader'
import { ApiError, isApiConfigured } from '../lib/api/client'
import {
  acceptInvitation,
  previewInvitation,
  type InvitationPreview,
} from '../lib/api/projects'
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
} from '../lib/projectStatus'
import { routes } from '../lib/routes'

export function InvitePage() {
  const { token: inviteTokenParam = '' } = useParams()
  const inviteToken = decodeURIComponent(inviteTokenParam)
  const { status, user, token } = useAuth()
  const navigate = useNavigate()

  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  useEffect(() => {
    if (!inviteToken || !isApiConfigured()) {
      setLoading(false)
      setError(
        !isApiConfigured()
          ? 'API is not configured (VITE_API_BASE_URL missing).'
          : 'Missing invitation token.',
      )
      return
    }

    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const result = await previewInvitation(inviteToken)
        if (cancelled) return
        setPreview(result.invitation)
      } catch (err) {
        if (cancelled) return
        setPreview(null)
        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load invitation.',
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [inviteToken])

  async function onAccept() {
    if (!token || !inviteToken) return
    setAcceptError(null)
    setAccepting(true)
    try {
      const { project } = await acceptInvitation(token, inviteToken)
      navigate(routes.project(project.id), { replace: true })
    } catch (err) {
      setAcceptError(
        err instanceof ApiError
          ? err.message
          : 'Could not accept invitation.',
      )
    } finally {
      setAccepting(false)
    }
  }

  const canAccept =
    status === 'authenticated' &&
    user?.role === 'FREELANCER' &&
    preview?.status === 'PENDING' &&
    !preview.project.hasFreelancer

  const registerHref = `${routes.register}?invite=${encodeURIComponent(inviteToken)}`
  const loginHref = `${routes.login}?invite=${encodeURIComponent(inviteToken)}`

  return (
    <div className="min-h-screen bg-base py-10">
      <PageContainer variant="app" className="space-y-6 max-w-xl mx-auto">
        <SectionHeader eyebrow="// Invitation" title="Join project" />

        {loading || status === 'loading' ? (
          <LoadingBlock label="Loading invitation" />
        ) : null}

        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}

        {!loading && preview ? (
          <Panel tone="surface" shadow="sm" className="space-y-5">
            <div className="space-y-2">
              <h3 className="font-display font-black text-2xl uppercase tracking-tight">
                {preview.project.title}
              </h3>
              <div className="flex flex-wrap gap-2">
                <Badge
                  tone={
                    preview.status === 'PENDING'
                      ? 'warning'
                      : preview.status === 'ACCEPTED'
                        ? 'success'
                        : 'neutral'
                  }
                >
                  Invite {preview.status}
                </Badge>
                <Badge
                  tone={PROJECT_STATUS_TONES[preview.project.status]}
                  dot
                >
                  {PROJECT_STATUS_LABELS[preview.project.status]}
                </Badge>
              </div>
              {preview.invitedEmail ? (
                <p className="font-mono text-xs text-dark/60">
                  Locked to {preview.invitedEmail}
                </p>
              ) : (
                <p className="font-mono text-xs text-dark/60">
                  Open invite · Freelancer role
                </p>
              )}
              <p className="font-body text-sm text-dark/70">{preview.note}</p>
            </div>

            {preview.status !== 'PENDING' || preview.project.hasFreelancer ? (
              <Alert tone="info">
                This invitation is no longer available to accept.
                {status === 'authenticated' ? (
                  <>
                    {' '}
                    <Link
                      to={routes.projects}
                      className="font-bold text-accent hover:underline"
                    >
                      View your projects
                    </Link>
                  </>
                ) : null}
              </Alert>
            ) : null}

            {status === 'anonymous' && preview.status === 'PENDING' ? (
              <div className="space-y-3">
                <p className="font-body text-sm text-dark/80">
                  Sign in or create a freelancer account to join this project.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link to={registerHref}>
                    <Button rightIcon={<ArrowRight className="w-4 h-4" />}>
                      Create account
                    </Button>
                  </Link>
                  <Link to={loginHref}>
                    <Button variant="secondary">Sign in</Button>
                  </Link>
                </div>
              </div>
            ) : null}

            {status === 'authenticated' && user?.role !== 'FREELANCER' ? (
              <Alert tone="warning">
                Only freelancer accounts can accept project invitations. You are
                signed in as {user?.role}.
              </Alert>
            ) : null}

            {canAccept ? (
              <div className="space-y-3">
                {preview.invitedEmail &&
                user?.email.toLowerCase() !==
                  preview.invitedEmail.toLowerCase() ? (
                  <Alert tone="warning">
                    This invite is locked to {preview.invitedEmail}. Sign in
                    with that email to accept.
                  </Alert>
                ) : (
                  <Button
                    onClick={() => void onAccept()}
                    loading={accepting}
                    fullWidth
                    size="lg"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Accept invitation
                  </Button>
                )}
              </div>
            ) : null}

            {acceptError ? (
              <Alert tone="danger" role="alert">
                {acceptError}
              </Alert>
            ) : null}
          </Panel>
        ) : null}

        <p className="font-mono text-xs text-dark/50 text-center">
          <Link to={routes.home} className="hover:underline">
            ← Fairwork home
          </Link>
        </p>
      </PageContainer>
    </div>
  )
}
