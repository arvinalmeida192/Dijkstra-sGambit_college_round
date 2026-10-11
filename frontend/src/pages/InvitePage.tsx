import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, X } from 'lucide-react'
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
  rejectInvitation,
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
  const [rejecting, setRejecting] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

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
    if (!token || !inviteToken || accepting || rejecting) return
    setAcceptError(null)
    setActionMessage(null)
    setAccepting(true)
    try {
      const { project } = await acceptInvitation(token, inviteToken)
      window.dispatchEvent(new CustomEvent('fairwork:invitation-updated'))
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

  async function onReject() {
    if (!token || !inviteToken || accepting || rejecting) return
    setAcceptError(null)
    setActionMessage(null)
    setRejecting(true)
    try {
      await rejectInvitation(token, inviteToken)
      setConfirmReject(false)
      setPreview((prev) =>
        prev ? { ...prev, status: 'REJECTED' } : prev,
      )
      setActionMessage('You have declined this work invitation.')
      window.dispatchEvent(new CustomEvent('fairwork:invitation-updated'))
    } catch (err) {
      setConfirmReject(false)
      setAcceptError(
        err instanceof ApiError
          ? err.message
          : 'Could not decline invitation.',
      )
    } finally {
      setRejecting(false)
    }
  }

  const canRespond =
    status === 'authenticated' &&
    user?.role === 'FREELANCER' &&
    preview?.status === 'PENDING' &&
    !preview.project.hasFreelancer &&
    preview.project.status !== 'CANCELLED' &&
    preview.project.status !== 'COMPLETED'

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
                        : preview.status === 'REJECTED'
                          ? 'danger'
                          : 'neutral'
                  }
                >
                  Invite {preview.status === 'REVOKED' ? 'WITHDRAWN' : preview.status}
                </Badge>
                <Badge
                  tone={PROJECT_STATUS_TONES[preview.project.status]}
                  dot
                >
                  {PROJECT_STATUS_LABELS[preview.project.status]}
                </Badge>
              </div>
              {preview.sender ? (
                <p className="font-mono text-xs text-dark/75">
                  Client: <span className="font-bold">{preview.sender.name}</span> ({preview.sender.email})
                </p>
              ) : null}
              {preview.invitedEmail ? (
                <p className="font-mono text-xs text-dark/60">
                  Locked to {preview.invitedEmail}
                </p>
              ) : (
                <p className="font-mono text-xs text-dark/60">
                  Open invite · Freelancer role
                </p>
              )}
              {preview.message ? (
                <div className="border-l-2 border-accent pl-3 py-1 bg-accent/5">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-dark/50">
                    Invitation message
                  </p>
                  <p className="font-body text-sm text-dark/80 italic">
                    “{preview.message}”
                  </p>
                </div>
              ) : null}
              <p className="font-body text-sm text-dark/70">{preview.note}</p>
            </div>

            {actionMessage ? (
              <Alert tone="info" role="status">
                {actionMessage}
              </Alert>
            ) : null}

            {preview.status !== 'PENDING' || preview.project.hasFreelancer ? (
              <Alert tone="info">
                This invitation is no longer available to accept (status:{' '}
                {preview.status === 'REVOKED' ? 'WITHDRAWN' : preview.status}).
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
                  Sign in or create a freelancer account to respond to this project invitation.
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
                Only freelancer accounts can accept or decline project invitations. You are
                signed in as {user?.role}.
              </Alert>
            ) : null}

            {canRespond ? (
              <div className="space-y-3">
                {preview.invitedEmail &&
                user?.email.toLowerCase() !==
                  preview.invitedEmail.toLowerCase() ? (
                  <Alert tone="warning">
                    This invite is locked to {preview.invitedEmail}. Sign in
                    with that email to respond.
                  </Alert>
                ) : confirmReject ? (
                  <div
                    role="alertdialog"
                    aria-label="Confirm invitation rejection"
                    className="border-2 border-status-danger/40 bg-status-danger/5 p-4 space-y-3"
                  >
                    <p className="font-mono text-xs font-bold text-dark">
                      Decline invitation to “{preview.project.title}”?
                    </p>
                    <p className="font-body text-xs text-dark/70">
                      This invitation will be marked as rejected and cannot be accepted later unless the client sends a new invite.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        loading={rejecting}
                        disabled={rejecting}
                        onClick={() => void onReject()}
                      >
                        Confirm reject
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={rejecting}
                        onClick={() => setConfirmReject(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      onClick={() => void onAccept()}
                      loading={accepting}
                      disabled={accepting || rejecting}
                      fullWidth
                      size="lg"
                      rightIcon={<ArrowRight className="w-4 h-4" />}
                    >
                      Accept invitation
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => setConfirmReject(true)}
                      disabled={accepting || rejecting}
                      size="lg"
                      leftIcon={<X className="w-4 h-4" />}
                    >
                      Reject invitation
                    </Button>
                  </div>
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
