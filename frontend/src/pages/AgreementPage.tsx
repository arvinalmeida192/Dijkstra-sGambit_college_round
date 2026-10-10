import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, FilePenLine } from 'lucide-react'
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
import {
  acceptAgreement,
  createAgreement,
  listAgreements,
  proposeAgreementChange,
  type Agreement,
  type AgreementTermsInput,
} from '../lib/api/agreements'
import { getProject, type Project } from '../lib/api/projects'
import {
  AGREEMENT_STATUS_LABELS,
  AGREEMENT_STATUS_TONES,
} from '../lib/agreementStatus'
import { routes } from '../lib/routes'
import { TermsForm } from './agreement/TermsForm'
import { TermsView } from './agreement/TermsView'

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

export function AgreementPage() {
  const { projectId = '' } = useParams()
  const { token, user } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [proposedId, setProposedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [showProposeForm, setShowProposeForm] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const load = useCallback(async () => {
    if (!token || !projectId || !isApiConfigured()) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [projectResult, agreementsResult] = await Promise.all([
        getProject(token, projectId),
        listAgreements(token, projectId),
      ])
      setProject(projectResult.project)
      setAgreements(agreementsResult.agreements)
      setActiveId(agreementsResult.activeAgreementId)
      setProposedId(agreementsResult.proposedAgreementId)
    } catch (err) {
      setProject(null)
      setAgreements([])
      setActiveId(null)
      setProposedId(null)
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not load agreement data.',
      )
    } finally {
      setLoading(false)
    }
  }, [token, projectId])

  useEffect(() => {
    void load()
  }, [load])

  const isClient = Boolean(user && project && user.id === project.clientId)
  const isFreelancer = Boolean(
    user && project && project.freelancerId && user.id === project.freelancerId,
  )
  const isParticipant = isClient || isFreelancer
  const projectClosed =
    project?.status === 'CANCELLED' || project?.status === 'COMPLETED'

  const active = agreements.find((a) => a.id === activeId) ?? null
  const proposed = agreements.find((a) => a.id === proposedId) ?? null
  const history = agreements.filter(
    (a) => a.status === 'SUPERSEDED' || a.status === 'WITHDRAWN',
  )

  const proposeBaseId = activeId ?? proposedId ?? agreements[0]?.id ?? null
  const canCreate = isClient && agreements.length === 0 && !projectClosed
  const canPropose =
    isParticipant && agreements.length > 0 && !projectClosed && !!proposeBaseId

  async function onCreate(terms: AgreementTermsInput) {
    if (!token || !projectId) return
    setActionError(null)
    setActionSuccess(null)
    await createAgreement(token, projectId, terms)
    setShowCreateForm(false)
    setActionSuccess('Version 1 proposed. Both parties must accept to activate.')
    await load()
  }

  async function onPropose(terms: AgreementTermsInput) {
    if (!token || !proposeBaseId) return
    setActionError(null)
    setActionSuccess(null)
    await proposeAgreementChange(token, proposeBaseId, terms)
    setShowProposeForm(false)
    setActionSuccess(
      'New proposal created. The active version stays in effect until both parties accept.',
    )
    await load()
  }

  async function onAccept(agreementId: string) {
    if (!token) return
    setActionError(null)
    setActionSuccess(null)
    setAcceptingId(agreementId)
    try {
      const result = await acceptAgreement(token, agreementId)
      setActionSuccess(
        result.agreement.status === 'ACTIVE'
          ? `Version ${result.agreement.version} is now active.`
          : 'Your acceptance was recorded. Waiting for the other party.',
      )
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'Could not accept this agreement version.',
      )
    } finally {
      setAcceptingId(null)
    }
  }

  return (
    <PageContainer variant="app" className="space-y-6">
      <SectionHeader
        eyebrow="// Agreement"
        title={project ? `Agreement — ${project.title}` : 'Agreement'}
        meta={
          <Link
            to={projectId ? routes.project(projectId) : routes.projects}
            className="font-mono text-xs font-bold uppercase tracking-wider text-accent hover:underline"
          >
            ← Project
          </Link>
        }
      />

      <Alert tone="info">
        Acceptance is application-level. Recording accept here does not by itself
        prove a cryptographic wallet signature.
      </Alert>

      {!isApiConfigured() ? (
        <Alert tone="warning">
          Set <code className="font-bold">VITE_API_BASE_URL</code> to load
          agreements.
        </Alert>
      ) : null}

      {loading ? <LoadingBlock label="Loading agreements" /> : null}

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {actionError ? (
        <Alert tone="danger" role="alert">
          {actionError}
        </Alert>
      ) : null}

      {actionSuccess ? (
        <Alert tone="success" role="status">
          {actionSuccess}
        </Alert>
      ) : null}

      {!loading && project && !error ? (
        <>
          {!project.freelancerId ? (
            <Alert tone="warning">
              No freelancer assigned yet. A proposal can be created, but it
              cannot become active until both the client and freelancer have
              accepted.
            </Alert>
          ) : null}

          {agreements.length === 0 ? (
            <EmptyAgreementState
              canCreate={canCreate}
              showForm={showCreateForm}
              onShowForm={() => setShowCreateForm(true)}
              onCancel={() => setShowCreateForm(false)}
              onCreate={onCreate}
            />
          ) : (
            <>
              {active ? (
                <AgreementVersionPanel
                  title="Active terms"
                  agreement={active}
                  project={project}
                  highlight="active"
                />
              ) : (
                <Panel tone="surface" shadow="sm">
                  <p className="font-mono text-xs text-dark/60">
                    No active agreement yet. Accept a proposed version (both
                    parties) to activate terms.
                  </p>
                </Panel>
              )}

              {proposed ? (
                <AgreementVersionPanel
                  title="Proposed changes"
                  agreement={proposed}
                  project={project}
                  highlight="proposed"
                  currentUserId={user?.id}
                  canAccept={
                    isParticipant &&
                    !proposed.acceptances.some((a) => a.userId === user?.id)
                  }
                  accepting={acceptingId === proposed.id}
                  onAccept={() => void onAccept(proposed.id)}
                />
              ) : null}

              {canPropose ? (
                <Panel tone="surface" shadow="sm" className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display font-bold text-lg uppercase tracking-tight">
                        Propose a change
                      </h3>
                      <p className="font-body text-sm text-dark/70 mt-1">
                        Creates a new version. Any open proposal is withdrawn.
                        Active terms stay in force until the new version is
                        fully accepted.
                      </p>
                    </div>
                    {!showProposeForm ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<FilePenLine className="w-3.5 h-3.5" />}
                        onClick={() => setShowProposeForm(true)}
                      >
                        New proposal
                      </Button>
                    ) : null}
                  </div>
                  {showProposeForm ? (
                    <TermsForm
                      initial={active?.terms ?? proposed?.terms}
                      submitLabel="Submit proposal"
                      onSubmit={onPropose}
                      onCancel={() => setShowProposeForm(false)}
                    />
                  ) : null}
                </Panel>
              ) : null}

              {history.length > 0 ? (
                <Panel tone="surface" shadow="sm" className="space-y-4">
                  <h3 className="font-display font-bold text-lg uppercase tracking-tight">
                    Version history
                  </h3>
                  <ul className="space-y-3">
                    {history.map((agreement) => (
                      <li
                        key={agreement.id}
                        className="border-2 border-dark/15 bg-white p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold">
                            v{agreement.version}
                          </span>
                          <Badge
                            tone={AGREEMENT_STATUS_TONES[agreement.status]}
                            dot
                          >
                            {AGREEMENT_STATUS_LABELS[agreement.status]}
                          </Badge>
                          <span className="font-mono text-[11px] text-dark/50">
                            {formatDate(agreement.createdAt)}
                          </span>
                        </div>
                        <TermsView terms={agreement.terms} compact />
                      </li>
                    ))}
                  </ul>
                </Panel>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </PageContainer>
  )
}

function EmptyAgreementState({
  canCreate,
  showForm,
  onShowForm,
  onCancel,
  onCreate,
}: {
  canCreate: boolean
  showForm: boolean
  onShowForm: () => void
  onCancel: () => void
  onCreate: (terms: AgreementTermsInput) => Promise<void>
}) {
  if (canCreate && showForm) {
    return (
      <Panel tone="surface" shadow="sm" className="space-y-4">
        <h3 className="font-display font-bold text-lg uppercase tracking-tight">
          Create first agreement
        </h3>
        <p className="font-body text-sm text-dark/70">
          Define milestone terms. Both parties must accept before the agreement
          becomes active.
        </p>
        <TermsForm
          submitLabel="Propose v1"
          onSubmit={onCreate}
          onCancel={onCancel}
        />
      </Panel>
    )
  }

  return (
    <EmptyState
      title="No agreement yet"
      description={
        canCreate
          ? 'Create the first version of milestone terms for this project.'
          : 'Waiting for the client to propose the first agreement version.'
      }
      action={
        canCreate ? (
          <Button onClick={onShowForm}>Create agreement</Button>
        ) : undefined
      }
    />
  )
}

function AgreementVersionPanel({
  title,
  agreement,
  project,
  highlight,
  currentUserId,
  canAccept = false,
  accepting = false,
  onAccept,
}: {
  title: string
  agreement: Agreement
  project: Project
  highlight: 'active' | 'proposed'
  currentUserId?: string
  canAccept?: boolean
  accepting?: boolean
  onAccept?: () => void
}) {
  return (
    <Panel
      tone="surface"
      shadow="sm"
      className={
        highlight === 'proposed'
          ? 'space-y-4 border-status-warning'
          : 'space-y-4'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-display font-bold text-lg uppercase tracking-tight">
            {title}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold">
              v{agreement.version}
            </span>
            <Badge tone={AGREEMENT_STATUS_TONES[agreement.status]} dot>
              {AGREEMENT_STATUS_LABELS[agreement.status]}
            </Badge>
            <span className="font-mono text-[11px] text-dark/50">
              Proposed {formatDate(agreement.createdAt)}
              {agreement.activatedAt
                ? ` · Activated ${formatDate(agreement.activatedAt)}`
                : ''}
            </span>
          </div>
        </div>
        {canAccept && onAccept ? (
          <Button
            size="sm"
            loading={accepting}
            leftIcon={<Check className="w-3.5 h-3.5" />}
            onClick={onAccept}
          >
            Accept this version
          </Button>
        ) : null}
      </div>

      {highlight === 'proposed' ? (
        <AcceptanceStatus
          agreement={agreement}
          project={project}
          currentUserId={currentUserId}
        />
      ) : null}

      <TermsView terms={agreement.terms} />

      {agreement.acceptances.length > 0 && highlight === 'active' ? (
        <AcceptanceStatus
          agreement={agreement}
          project={project}
          currentUserId={currentUserId}
        />
      ) : null}

      <p className="font-mono text-[10px] text-dark/50">
        {agreement.acceptanceNote}
      </p>
    </Panel>
  )
}

function AcceptanceStatus({
  agreement,
  project,
  currentUserId,
}: {
  agreement: Agreement
  project: Project
  currentUserId?: string
}) {
  const acceptedIds = new Set(agreement.acceptances.map((a) => a.userId))
  const parties = [
    {
      key: 'client',
      label: 'Client',
      id: project.clientId,
      name: project.client?.name ?? 'Client',
    },
    {
      key: 'freelancer',
      label: 'Freelancer',
      id: project.freelancerId,
      name: project.freelancer?.name ?? 'Not assigned',
    },
  ]

  return (
    <div className="border-2 border-dark/10 bg-white p-3 space-y-2">
      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
        Acceptance status
      </p>
      <ul className="space-y-1">
        {parties.map((party) => {
          const accepted = party.id ? acceptedIds.has(party.id) : false
          const isYou = party.id && party.id === currentUserId
          return (
            <li
              key={party.key}
              className="flex flex-wrap items-center gap-2 font-mono text-[11px]"
            >
              <span className="font-bold uppercase text-dark/50 w-24">
                {party.label}
              </span>
              <span className="text-dark/80">
                {party.name}
                {isYou ? ' (you)' : ''}
              </span>
              {party.id ? (
                <Badge tone={accepted ? 'success' : 'warning'} dot>
                  {accepted ? 'Accepted' : 'Pending'}
                </Badge>
              ) : (
                <Badge tone="neutral" dot>
                  Unassigned
                </Badge>
              )}
              {accepted
                ? (() => {
                    const row = agreement.acceptances.find(
                      (a) => a.userId === party.id,
                    )
                    return row ? (
                      <span className="text-dark/40">
                        {formatDate(row.acceptedAt)}
                      </span>
                    ) : null
                  })()
                : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
