import { useCallback, useEffect, useMemo, useState } from 'react'
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
  addDisputeEvidence,
  claimDispute,
  decideDispute,
  downloadDisputeEvidenceFile,
  getDispute,
  listProjectDisputes,
  openDispute,
  type Dispute,
  type DisputeDecision,
  type DisputeEvidence,
} from '../lib/api/disputes'
import { listMilestones, type Milestone } from '../lib/api/milestones'
import { getProject, type Project } from '../lib/api/projects'
import {
  DISPUTE_DECISION_LABELS,
  DISPUTE_STATUS_LABELS,
  DISPUTE_STATUS_TONES,
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

function formatDate(iso: string | null) {
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

  const load = useCallback(async () => {
    if (!token || !projectId || !isApiConfigured()) {
      setLoading(false)
      return
    }
    setLoading(true)
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
        requires a verified transaction on the Payments page. AI summaries are
        not part of this screen.
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
                      </p>
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
