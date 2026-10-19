import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { LoadingBlock } from '../components/ui/Spinner'
import { PageContainer } from '../components/ui/PageContainer'
import { Panel } from '../components/ui/Panel'
import { SectionHeader } from '../components/ui/SectionHeader'
import { Select } from '../components/ui/Select'
import { Textarea } from '../components/ui/Textarea'
import { formatAmountBaseUnits } from '../lib/agreementStatus'
import { ApiError, isApiConfigured } from '../lib/api/client'
import {
  acceptDisputeResolution,
  addDisputeEvidence,
  claimDispute,
  decideDispute,
  downloadDisputeEvidenceFile,
  getDispute,
  listProjectDisputes,
  openDispute,
  proposeDisputeResolution,
  resolveDisputeAsArbitrator,
  type Dispute,
  type DisputeDecision,
  type DisputeEvidence,
  type DisputeResolutionOutcome,
} from '../lib/api/disputes'
import { listMilestones, type Milestone } from '../lib/api/milestones'
import { getProject, type Project } from '../lib/api/projects'
import {
  DISPUTE_DECISION_LABELS,
  DISPUTE_STATUS_LABELS,
  DISPUTE_STATUS_TONES,
  RESOLUTION_OUTCOME_LABELS,
  RESOLUTION_OUTCOME_TONES,
  RESOLUTION_TYPE_LABELS,
} from '../lib/disputeStatus'
import { routes } from '../lib/routes'

const DECISION_OPTIONS: { value: DisputeDecision; label: string }[] = [
  {
    value: 'RELEASE_TO_FREELANCER',
    label: DISPUTE_DECISION_LABELS.RELEASE_TO_FREELANCER,
  },
  {
    value: 'REFUND_TO_CLIENT',
    label: DISPUTE_DECISION_LABELS.REFUND_TO_CLIENT,
  },
  { value: 'SPLIT', label: DISPUTE_DECISION_LABELS.SPLIT },
]

const RESOLUTION_OUTCOME_OPTIONS: {
  value: DisputeResolutionOutcome
  label: string
}[] = [
  {
    value: 'RESUME_EXISTING',
    label: RESOLUTION_OUTCOME_LABELS.RESUME_EXISTING,
  },
  {
    value: 'RESUME_WITH_CHANGES',
    label: RESOLUTION_OUTCOME_LABELS.RESUME_WITH_CHANGES,
  },
  {
    value: 'TERMINATE_WORK',
    label: RESOLUTION_OUTCOME_LABELS.TERMINATE_WORK,
  },
]

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
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

export function DisputesPage() {
  const { projectId = '' } = useParams()
  const { token, user } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Dispute | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [openMilestoneId, setOpenMilestoneId] = useState('')
  const [reason, setReason] = useState('')
  const [claimSummary, setClaimSummary] = useState('')

  const [evidenceNotes, setEvidenceNotes] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null)

  const [decision, setDecision] = useState<DisputeDecision>('RELEASE_TO_FREELANCER')
  const [rationale, setRationale] = useState('')
  const [splitAmount, setSplitAmount] = useState('')

  const [arbOutcome, setArbOutcome] =
    useState<DisputeResolutionOutcome>('RESUME_EXISTING')
  const [arbSummary, setArbSummary] = useState('')

  const [mutualOutcome, setMutualOutcome] =
    useState<DisputeResolutionOutcome>('RESUME_EXISTING')
  const [mutualSummary, setMutualSummary] = useState('')
  const [showProposeForm, setShowProposeForm] = useState(false)

  const isClient = Boolean(user && project && user.id === project.clientId)
  const isFreelancer = Boolean(
    user && project && project.freelancerId && user.id === project.freelancerId,
  )
  const isArbitrator = user?.role === 'ARBITRATOR'
  const canOpen = isClient || isFreelancer

  const milestoneTitle = useMemo(() => {
    const map = new Map(milestones.map((m) => [m.id, m.title]))
    return (id: string) => map.get(id) ?? id.slice(0, 8)
  }, [milestones])

  const initialLoadDoneRef = useRef(false)

  const load = useCallback(async () => {
    if (!token || !projectId || !isApiConfigured()) {
      setLoading(false)
      return
    }
    // Only show the full-page loader on the first fetch. Refresh must not
    // unmount the open-dispute form (that would drop input focus).
    if (!initialLoadDoneRef.current) setLoading(true)
    setError(null)
    try {
      const [projectResult, milestonesResult, disputesResult] =
        await Promise.all([
          getProject(token, projectId),
          listMilestones(token, projectId),
          listProjectDisputes(token, projectId),
        ])
      setProject(projectResult.project)
      setMilestones(milestonesResult.milestones)
      setDisputes(disputesResult.disputes)
      setOpenMilestoneId((current) => {
        if (current) return current
        const disputable = milestonesResult.milestones.find((m) =>
          [
            'IN_PROGRESS',
            'SUBMITTED',
            'IN_REVIEW',
            'REVISION_REQUESTED',
            'DISPUTED',
          ].includes(m.status),
        )
        return disputable?.id ?? milestonesResult.milestones[0]?.id ?? ''
      })
      setSelectedId((current) => current ?? disputesResult.disputes[0]?.id ?? null)
      initialLoadDoneRef.current = true
    } catch (err) {
      setProject(null)
      setMilestones([])
      setDisputes([])
      setError(
        err instanceof ApiError ? err.message : 'Could not load disputes.',
      )
    } finally {
      setLoading(false)
    }
  }, [token, projectId])

  const loadDetail = useCallback(
    async (disputeId: string) => {
      if (!token) return
      setDetailLoading(true)
      try {
        const result = await getDispute(token, disputeId)
        setDetail(result.dispute)
      } catch (err) {
        setDetail(null)
        setActionError(
          err instanceof ApiError
            ? err.message
            : 'Could not load dispute detail.',
        )
      } finally {
        setDetailLoading(false)
      }
    },
    [token],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId, loadDetail])

  async function handleOpen() {
    if (!token) return
    const trimmed = reason.trim()
    if (trimmed.length < 3) {
      setActionError('Reason must be at least 3 characters.')
      return
    }
    if (!openMilestoneId) {
      setActionError('Select a milestone.')
      return
    }
    setBusy(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      const result = await openDispute(token, openMilestoneId, {
        reason: trimmed,
        claimSummary: claimSummary.trim() || null,
      })
      setActionSuccess(result.notice)
      setReason('')
      setClaimSummary('')
      setSelectedId(result.dispute.id)
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not open dispute.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleClaim() {
    if (!token || !detail) return
    setBusy(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      const result = await claimDispute(token, detail.id)
      setActionSuccess(result.notice)
      setDetail(result.dispute)
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not claim dispute.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleDecide() {
    if (!token || !detail) return
    const trimmed = rationale.trim()
    if (!trimmed) {
      setActionError('Rationale is required.')
      return
    }
    let splitReleaseToFreelancer: number | undefined
    if (decision === 'SPLIT') {
      const n = Number(splitAmount)
      if (!Number.isInteger(n) || n < 0) {
        setActionError('Enter split amount in app cents (integer).')
        return
      }
      splitReleaseToFreelancer = n
    }
    setBusy(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      const result = await decideDispute(token, detail.id, {
        decision,
        rationale: trimmed,
        ...(splitReleaseToFreelancer != null
          ? { splitReleaseToFreelancer }
          : {}),
      })
      setActionSuccess(result.notice)
      setDetail(result.dispute)
      setRationale('')
      setSplitAmount('')
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not record decision.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleArbitratorResolve() {
    if (!token || !detail) return
    const trimmed = arbSummary.trim()
    if (!trimmed) {
      setActionError('Resolution summary is required.')
      return
    }
    setBusy(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      const result = await resolveDisputeAsArbitrator(token, detail.id, {
        outcome: arbOutcome,
        summary: trimmed,
      })
      setActionSuccess(result.notice)
      setDetail(result.dispute)
      setArbSummary('')
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not resolve dispute.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleProposeResolution() {
    if (!token || !detail) return
    const trimmed = mutualSummary.trim()
    if (trimmed.length < 3) {
      setActionError('Proposal summary must be at least 3 characters.')
      return
    }
    setBusy(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      const result = await proposeDisputeResolution(token, detail.id, {
        outcome: mutualOutcome,
        summary: trimmed,
      })
      setActionSuccess(result.notice)
      setDetail(result.dispute)
      setMutualSummary('')
      setShowProposeForm(false)
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not propose resolution.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleAcceptResolution() {
    if (!token || !detail) return
    setBusy(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      const result = await acceptDisputeResolution(token, detail.id)
      setActionSuccess(result.notice)
      setDetail(result.dispute)
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not accept resolution.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleEvidence() {
    if (!token || !detail) return
    if (!evidenceNotes.trim() && !evidenceUrl.trim() && !evidenceFile) {
      setActionError('Add notes, a URL, or a file.')
      return
    }
    setBusy(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      await addDisputeEvidence(token, detail.id, {
        notes: evidenceNotes.trim() || null,
        externalUrl: evidenceUrl.trim() || null,
        file: evidenceFile,
      })
      setActionSuccess('Evidence attached (private storage).')
      setEvidenceNotes('')
      setEvidenceUrl('')
      setEvidenceFile(null)
      await loadDetail(detail.id)
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not add evidence.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload(ev: DisputeEvidence) {
    if (!token || !ev.hasFile) return
    try {
      const { blob } = await downloadDisputeEvidenceFile(token, ev.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = ev.originalFilename || 'evidence.bin'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'Could not download evidence.',
      )
    }
  }

  return (
    <PageContainer variant="app" className="space-y-6">
      <SectionHeader
        eyebrow="// Disputes"
        title={project ? `Disputes — ${project.title}` : 'Disputes'}
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
        Dispute decisions are recorded by an authorized human reviewer. They do{' '}
        <strong>not</strong> move escrow funds. On-chain release or refund still
        requires a verified transaction on the Payments page.
      </Alert>

      {!isApiConfigured() ? (
        <Alert tone="warning">
          Set <code className="font-bold">VITE_API_BASE_URL</code> to load
          disputes.
        </Alert>
      ) : null}

      {loading ? <LoadingBlock label="Loading disputes" /> : null}

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

      {!loading && !error ? (
        <>
          {canOpen ? (
            <Panel className="space-y-4">
              <h2 className="font-display text-lg text-dark">Open dispute</h2>
              <Select
                label="Milestone"
                name="openMilestoneId"
                value={openMilestoneId}
                onChange={(e) => setOpenMilestoneId(e.target.value)}
                options={milestones.map((m) => ({
                  value: m.id,
                  label: `${m.title} · ${m.status} · ${formatAmountBaseUnits(m.amount)}`,
                }))}
                disabled={busy || milestones.length === 0}
              />
              <Textarea
                label="Reason"
                name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                disabled={busy}
              />
              <Textarea
                label="Claim summary (optional)"
                name="claimSummary"
                value={claimSummary}
                onChange={(e) => setClaimSummary(e.target.value)}
                rows={2}
                disabled={busy}
              />
              <Button loading={busy} variant="danger" onClick={() => void handleOpen()}>
                Open dispute
              </Button>
            </Panel>
          ) : null}

          {disputes.length === 0 ? (
            <EmptyState
              title="No disputes"
              description="Client or freelancer can open a case when delivery is contested."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_1fr]">
              <div className="space-y-2">
                {disputes.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className={`w-full border-2 p-3 text-left transition ${
                      selectedId === d.id
                        ? 'border-accent bg-accent/10'
                        : 'border-dark/20 bg-white hover:border-dark'
                    }`}
                  >
                    <Badge tone={DISPUTE_STATUS_TONES[d.status]} dot>
                      {DISPUTE_STATUS_LABELS[d.status]}
                    </Badge>
                    <p className="mt-1 font-mono text-xs font-bold text-dark">
                      {milestoneTitle(d.milestoneId)}
                    </p>
                    {d.resolutionOutcome ? (
                      <p className="mt-0.5 font-mono text-[10px] text-accent font-semibold">
                        {RESOLUTION_OUTCOME_LABELS[d.resolutionOutcome]}
                      </p>
                    ) : null}
                    <p className="mt-1 line-clamp-2 font-body text-xs text-dark/70">
                      {d.reason}
                    </p>
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                {detailLoading ? (
                  <LoadingBlock label="Loading case" />
                ) : detail ? (
                  <>
                    <Panel className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={DISPUTE_STATUS_TONES[detail.status]}
                          dot
                        >
                          {DISPUTE_STATUS_LABELS[detail.status]}
                        </Badge>
                        <Badge tone="warning">App record only</Badge>
                      </div>
                      <h2 className="font-display text-xl text-dark">
                        {milestoneTitle(detail.milestoneId)}
                      </h2>
                      <p className="font-body text-sm text-dark/80">
                        {detail.reason}
                      </p>
                      {detail.claimSummary ? (
                        <p className="font-body text-sm text-dark/70">
                          {detail.claimSummary}
                        </p>
                      ) : null}
                      <p className="font-mono text-[10px] uppercase text-dark/50">
                        Opened {formatDate(detail.createdAt)}
                        {detail.arbitratorId
                          ? ` · Reviewer ${detail.arbitratorId.slice(0, 8)}`
                          : ''}
                        {detail.escalationDueAt
                          ? ` · Escalation due ${formatDate(detail.escalationDueAt)}`
                          : ''}
                        {detail.escalatedAt
                          ? ` · Escalated ${formatDate(detail.escalatedAt)}`
                          : ''}
                      </p>

                      {detail.verificationContext ? (
                        <div className="border-2 border-dark/15 bg-neutral-50 p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/60">
                              Agreed Milestone Verification &amp; Evidence Context
                            </span>
                            <Badge tone="accent">
                              {detail.verificationContext.verificationMethod.replace(
                                /_/g,
                                ' ',
                              )}
                            </Badge>
                          </div>
                          {detail.verificationContext.frozenCriteriaHash ? (
                            <p className="font-mono text-[11px] text-dark/70 break-all">
                              Frozen Criteria Hash (v
                              {detail.verificationContext
                                .frozenAgreementVersion ?? 1}
                              ):{' '}
                              <code className="bg-dark/5 px-1">
                                {detail.verificationContext.frozenCriteriaHash}
                              </code>
                            </p>
                          ) : null}
                          {detail.verificationContext.latestVerificationRun ? (
                            <p className="font-mono text-[11px] text-dark/80">
                              Latest Verification Outcome:{' '}
                              <strong>
                                {
                                  detail.verificationContext
                                    .latestVerificationRun.outcome
                                }
                              </strong>{' '}
                              —{' '}
                              {
                                detail.verificationContext.latestVerificationRun
                                  .summary
                              }
                            </p>
                          ) : null}
                          {(detail.disputedCriteriaRefs?.length ?? 0) > 0 ? (
                            <div className="font-mono text-[11px] text-dark/70">
                              <span className="font-bold">
                                Disputed Criteria:{' '}
                              </span>
                              {detail.disputedCriteriaRefs!.join(', ')}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {detail.resolutionOutcome ? (
                        <div className="space-y-2 border border-dark/20 bg-white p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              tone={
                                RESOLUTION_OUTCOME_TONES[
                                  detail.resolutionOutcome
                                ]
                              }
                              dot
                            >
                              {
                                RESOLUTION_OUTCOME_LABELS[
                                  detail.resolutionOutcome
                                ]
                              }
                            </Badge>
                            {detail.resolutionType ? (
                              <Badge tone="neutral">
                                {RESOLUTION_TYPE_LABELS[detail.resolutionType]}
                              </Badge>
                            ) : null}
                          </div>
                          {detail.resolutionSummary ? (
                            <p className="font-body text-sm text-dark/80">
                              <strong>Summary:</strong>{' '}
                              {detail.resolutionSummary}
                            </p>
                          ) : null}
                          <p className="font-mono text-[10px] text-dark/50">
                            Resolved {formatDate(detail.resolvedAt)}
                            {detail.resolvedBy
                              ? ` · By user ${detail.resolvedBy.slice(0, 8)}`
                              : ''}
                          </p>
                          {detail.resolutionOutcome === 'RESUME_EXISTING' ||
                          detail.resolutionOutcome === 'RESUME_WITH_CHANGES' ? (
                            <div className="pt-2 border-t border-dark/10 flex flex-wrap items-center justify-between gap-2">
                              <span className="font-body text-xs text-status-success font-medium">
                                Work resumed (Milestone is In Progress). Freelancer can submit deliverables.
                              </span>
                              <Link
                                to={
                                  projectId
                                    ? routes.progress(projectId)
                                    : routes.projects
                                }
                                className="font-mono text-xs font-bold text-accent hover:underline"
                              >
                                Go to Progress →
                              </Link>
                            </div>
                          ) : (
                            <p className="font-body text-xs text-status-danger pt-1">
                              Work terminated (Milestone is Cancelled). Further submissions are blocked.
                            </p>
                          )}
                        </div>
                      ) : null}

                      {detail.decision ? (
                        <Alert tone="info">
                          Decision:{' '}
                          <strong>
                            {DISPUTE_DECISION_LABELS[detail.decision]}
                          </strong>
                          {detail.splitReleaseToFreelancer != null
                            ? ` · split ${formatAmountBaseUnits(detail.splitReleaseToFreelancer)} to freelancer`
                            : ''}
                          . Funds moved by this decision:{' '}
                          {detail.fundsMovedByDecision ? 'yes' : 'no'}.
                          {detail.decisionRationale
                            ? ` Rationale: ${detail.decisionRationale}`
                            : ''}
                        </Alert>
                      ) : null}

                      {detail.status !== 'RESOLVED' &&
                      detail.resolutionProposal ? (
                        <div className="space-y-2 border-2 border-accent/40 bg-accent/5 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold uppercase text-accent">
                              Resolution proposal pending
                            </span>
                            <Badge
                              tone={
                                RESOLUTION_OUTCOME_TONES[
                                  detail.resolutionProposal.outcome
                                ]
                              }
                            >
                              {
                                RESOLUTION_OUTCOME_LABELS[
                                  detail.resolutionProposal.outcome
                                ]
                              }
                            </Badge>
                          </div>
                          <p className="font-body text-sm text-dark/80">
                            {detail.resolutionProposal.summary}
                          </p>
                          <p className="font-mono text-[10px] text-dark/50">
                            Proposed{' '}
                            {formatDate(
                              detail.resolutionProposal.proposedAt,
                            )}
                          </p>
                          {user &&
                          detail.resolutionProposal.proposedBy !== user.id &&
                          (isClient || isFreelancer) ? (
                            <div className="pt-2 border-t border-dark/10 flex flex-wrap items-center gap-3">
                              <Button
                                loading={busy}
                                size="sm"
                                onClick={() => void handleAcceptResolution()}
                              >
                                Accept proposal &amp; resolve dispute
                              </Button>
                              <span className="font-body text-xs text-dark/60">
                                Accepting will resolve the dispute and update milestone work state.
                              </span>
                            </div>
                          ) : user &&
                            detail.resolutionProposal.proposedBy === user.id ? (
                            <p className="font-body text-xs text-dark/60 italic pt-1">
                              You proposed this resolution. Waiting for counterparty to accept.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {isArbitrator && detail.status === 'OPEN' ? (
                        <Button
                          loading={busy}
                          onClick={() => void handleClaim()}
                        >
                          Claim for review
                        </Button>
                      ) : null}
                    </Panel>

                    <Panel className="space-y-3">
                      <h3 className="font-display text-lg text-dark">
                        Evidence
                      </h3>
                      {(detail.evidence ?? []).length === 0 ? (
                        <p className="font-body text-sm text-dark/60">
                          No evidence yet.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {(detail.evidence ?? []).map((ev) => (
                            <li
                              key={ev.id}
                              className="border border-dark/15 bg-white p-3"
                            >
                              {ev.notes ? (
                                <p className="font-body text-sm">{ev.notes}</p>
                              ) : null}
                              {ev.externalUrl ? (
                                <a
                                  href={ev.externalUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-mono text-xs text-accent underline"
                                >
                                  {ev.externalUrl}
                                </a>
                              ) : null}
                              {ev.hasFile ? (
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs text-dark/70">
                                    {ev.originalFilename} ·{' '}
                                    {ev.sha256Hash?.slice(0, 12)}…
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => void handleDownload(ev)}
                                  >
                                    Download
                                  </Button>
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}

                      {detail.status !== 'RESOLVED' ? (
                        <div className="space-y-3 border-t border-dark/10 pt-3">
                          <Textarea
                            label="Notes"
                            name="evidenceNotes"
                            value={evidenceNotes}
                            onChange={(e) => setEvidenceNotes(e.target.value)}
                            rows={2}
                            disabled={busy}
                          />
                          <Input
                            label="External URL (optional)"
                            name="evidenceUrl"
                            value={evidenceUrl}
                            onChange={(e) => setEvidenceUrl(e.target.value)}
                            disabled={busy}
                          />
                          <Input
                            label="File (optional)"
                            name="evidenceFile"
                            type="file"
                            onChange={(e) =>
                              setEvidenceFile(e.target.files?.[0] ?? null)
                            }
                            disabled={busy}
                          />
                          <Button
                            loading={busy}
                            variant="secondary"
                            onClick={() => void handleEvidence()}
                          >
                            Add evidence
                          </Button>
                        </div>
                      ) : null}
                    </Panel>

                    {isArbitrator &&
                    (detail.status === 'OPEN' ||
                      detail.status === 'UNDER_REVIEW') ? (
                      <Panel className="space-y-3">
                        <h3 className="font-display text-lg text-dark">
                          Resolve dispute (Arbitrator)
                        </h3>
                        <p className="font-body text-xs text-dark/70">
                          Resolve this dispute and determine the next workflow step for the milestone.
                          Choosing “Resume work” returns the milestone to In Progress so submissions can continue.
                          Choosing “End affected work” cancels the milestone.
                        </p>
                        <Select
                          label="Resolution outcome"
                          name="arbOutcome"
                          value={arbOutcome}
                          onChange={(e) =>
                            setArbOutcome(
                              e.target.value as DisputeResolutionOutcome,
                            )
                          }
                          options={RESOLUTION_OUTCOME_OPTIONS}
                          disabled={busy}
                        />
                        <Textarea
                          label="Resolution summary"
                          name="arbSummary"
                          value={arbSummary}
                          onChange={(e) => setArbSummary(e.target.value)}
                          rows={3}
                          disabled={busy}
                          hint="Summary of findings and instructions for work resumption or termination."
                        />
                        <Button
                          loading={busy}
                          onClick={() => void handleArbitratorResolve()}
                        >
                          Resolve dispute
                        </Button>
                      </Panel>
                    ) : null}

                    {(isClient || isFreelancer) &&
                    (detail.status === 'OPEN' ||
                      detail.status === 'UNDER_REVIEW') ? (
                      <Panel className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="font-display text-lg text-dark">
                              Mutual resolution
                            </h3>
                            <p className="font-body text-xs text-dark/70">
                              Propose an outcome to the counterparty. If accepted, work resumes or completes accordingly.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setShowProposeForm((v) => !v)}
                          >
                            {showProposeForm ? 'Hide form' : 'Propose resolution'}
                          </Button>
                        </div>
                        {showProposeForm ? (
                          <div className="space-y-3 border-t border-dark/10 pt-3">
                            <Select
                              label="Proposed outcome"
                              name="mutualOutcome"
                              value={mutualOutcome}
                              onChange={(e) =>
                                setMutualOutcome(
                                  e.target.value as DisputeResolutionOutcome,
                                )
                              }
                              options={RESOLUTION_OUTCOME_OPTIONS}
                              disabled={busy}
                            />
                            <Textarea
                              label="Proposal summary"
                              name="mutualSummary"
                              value={mutualSummary}
                              onChange={(e) => setMutualSummary(e.target.value)}
                              rows={3}
                              disabled={busy}
                              hint="Describe the agreed terms (minimum 3 characters)."
                            />
                            <Button
                              loading={busy}
                              onClick={() => void handleProposeResolution()}
                            >
                              Send proposal
                            </Button>
                          </div>
                        ) : null}
                      </Panel>
                    ) : null}

                    {isArbitrator &&
                    (detail.status === 'OPEN' ||
                      detail.status === 'UNDER_REVIEW') ? (
                      <Panel className="space-y-3">
                        <h3 className="font-display text-lg text-dark">
                          Record decision
                        </h3>
                        <Alert tone="warning">
                          This writes an application decision only. Report any
                          on-chain resolve / release / refund hash on the
                          Payments page afterward.
                        </Alert>
                        <Select
                          label="Decision"
                          name="decision"
                          value={decision}
                          onChange={(e) =>
                            setDecision(e.target.value as DisputeDecision)
                          }
                          options={DECISION_OPTIONS}
                          disabled={busy}
                        />
                        {decision === 'SPLIT' ? (
                          <Input
                            label="Split to freelancer (app cents)"
                            name="splitAmount"
                            value={splitAmount}
                            onChange={(e) => setSplitAmount(e.target.value)}
                            disabled={busy}
                            hint="Integer cents, e.g. 5000 = 50.00"
                          />
                        ) : null}
                        <Textarea
                          label="Rationale"
                          name="rationale"
                          value={rationale}
                          onChange={(e) => setRationale(e.target.value)}
                          rows={3}
                          disabled={busy}
                        />
                        <Button
                          loading={busy}
                          onClick={() => void handleDecide()}
                        >
                          Record human decision
                        </Button>
                      </Panel>
                    ) : null}
                  </>
                ) : (
                  <EmptyState
                    title="Select a dispute"
                    description="Choose a case from the list to view evidence and decisions."
                  />
                )}
              </div>
            </div>
          )}
        </>
      ) : null}
    </PageContainer>
  )
}
