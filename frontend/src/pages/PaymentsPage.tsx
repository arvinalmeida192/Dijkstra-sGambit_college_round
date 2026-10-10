import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
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
import { formatAmountBaseUnits } from '../lib/agreementStatus'
import { ApiError, isApiConfigured } from '../lib/api/client'
import { listMilestones, type Milestone } from '../lib/api/milestones'
import {
  listProjectPayments,
  reportMilestonePayment,
  syncPayment,
  type Payment,
  type PaymentStatus,
} from '../lib/api/payments'
import { getProject, type Project } from '../lib/api/projects'
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
} from '../lib/paymentStatus'
import { routes } from '../lib/routes'

const TX_RE = /^0x[a-fA-F0-9]{64}$/

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

function shortHash(hash: string | null) {
  if (!hash) return '—'
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}

function summarizeByStatus(payments: Payment[]) {
  const totals: Partial<Record<PaymentStatus, number>> = {}
  for (const p of payments) {
    totals[p.status] = (totals[p.status] ?? 0) + p.amount
  }
  return totals
}

export function PaymentsPage() {
  const { projectId = '' } = useParams()
  const { token } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [milestoneId, setMilestoneId] = useState('')
  const [txHash, setTxHash] = useState('')
  const [txError, setTxError] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)

  const milestoneTitle = useMemo(() => {
    const map = new Map(milestones.map((m) => [m.id, m.title]))
    return (id: string) => map.get(id) ?? id.slice(0, 8)
  }, [milestones])

  const totals = useMemo(() => summarizeByStatus(payments), [payments])

  const load = useCallback(async () => {
    if (!token || !projectId || !isApiConfigured()) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [projectResult, milestonesResult, paymentsResult] =
        await Promise.all([
          getProject(token, projectId),
          listMilestones(token, projectId),
          listProjectPayments(token, projectId),
        ])
      setProject(projectResult.project)
      setMilestones(milestonesResult.milestones)
      setPayments(paymentsResult.payments)
      setMilestoneId((current) =>
        current || milestonesResult.milestones[0]?.id || '',
      )
    } catch (err) {
      setProject(null)
      setMilestones([])
      setPayments([])
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not load payments.',
      )
    } finally {
      setLoading(false)
    }
  }, [token, projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleReport() {
    if (!token) return
    const trimmed = txHash.trim()
    if (!TX_RE.test(trimmed)) {
      setTxError('Enter a 0x-prefixed 32-byte transaction hash.')
      return
    }
    if (!milestoneId) {
      setTxError('Select a milestone.')
      return
    }
    setTxError(null)
    setReporting(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      const result = await reportMilestonePayment(token, milestoneId, trimmed)
      setActionSuccess(
        `Payment ${PAYMENT_STATUS_LABELS[result.payment.status]}${
          result.verification.pending ? ' (awaiting confirmation)' : ''
        }. Status comes from chain verification only.`,
      )
      setTxHash('')
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'Could not report transaction.',
      )
    } finally {
      setReporting(false)
    }
  }

  async function handleSync(payment: Payment) {
    if (!token) return
    setBusyId(payment.id)
    setActionError(null)
    setActionSuccess(null)
    try {
      const result = await syncPayment(token, payment.id)
      setActionSuccess(
        `Synced ${shortHash(payment.txHash)} → ${PAYMENT_STATUS_LABELS[result.payment.status]}.`,
      )
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not sync payment.',
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <PageContainer variant="app" className="space-y-6">
      <SectionHeader
        eyebrow="// Payments"
        title={project ? `Payments — ${project.title}` : 'Payments & Activity'}
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
        Fairwork indexes verified escrow events from the local/test chain. A
        row in this list is not proof of funds by itself — status updates only
        after chain verification. All amounts below are{' '}
        <strong>testnet / local demo</strong> settlements.
      </Alert>

      {!isApiConfigured() ? (
        <Alert tone="warning">
          Set <code className="font-bold">VITE_API_BASE_URL</code> to load
          payments.
        </Alert>
      ) : null}

      {loading ? <LoadingBlock label="Loading payments" /> : null}

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
          <Panel className="space-y-3">
            <h2 className="font-display text-lg text-dark">Status totals</h2>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map(
                (status) => (
                  <Badge key={status} tone={PAYMENT_STATUS_TONES[status]} dot>
                    {PAYMENT_STATUS_LABELS[status]}:{' '}
                    {formatAmountBaseUnits(totals[status] ?? 0)}
                  </Badge>
                ),
              )}
            </div>
          </Panel>

          <Panel className="space-y-4">
            <h2 className="font-display text-lg text-dark">
              Report transaction hash
            </h2>
            <p className="font-body text-sm text-dark/70">
              Wallet signs and broadcasts off-app. Paste the hash here so the
              API can verify receipt + escrow events. Client-supplied status is
              ignored.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                label="Milestone"
                name="milestoneId"
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
                options={milestones.map((m) => ({
                  value: m.id,
                  label: `${m.title} (${formatAmountBaseUnits(m.amount)})`,
                }))}
                disabled={reporting || milestones.length === 0}
              />
              <Input
                label="Transaction hash"
                name="txHash"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                error={txError ?? undefined}
                placeholder="0x…"
                disabled={reporting}
              />
            </div>
            <Button loading={reporting} onClick={() => void handleReport()}>
              Verify & record
            </Button>
          </Panel>

          {payments.length === 0 ? (
            <EmptyState
              title="No payment records yet"
              description="Fund or release a milestone on the local chain, then report the transaction hash."
            />
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <Panel key={payment.id} className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={PAYMENT_STATUS_TONES[payment.status]}
                          dot
                        >
                          {PAYMENT_STATUS_LABELS[payment.status]}
                        </Badge>
                        {payment.isTestNetwork ? (
                          <Badge tone="warning">Testnet / local</Badge>
                        ) : null}
                      </div>
                      <p className="font-mono text-sm font-bold text-dark">
                        {milestoneTitle(payment.milestoneId)} ·{' '}
                        {formatAmountBaseUnits(payment.amount)}
                      </p>
                      <p className="font-mono text-xs text-dark/60">
                        tx {shortHash(payment.txHash)}
                        {payment.eventName ? ` · ${payment.eventName}` : ''}
                        {payment.blockNumber != null
                          ? ` · block ${payment.blockNumber}`
                          : ''}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busyId === payment.id}
                      onClick={() => void handleSync(payment)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                      Sync
                    </Button>
                  </div>
                  {payment.failureReason ? (
                    <Alert tone="danger">{payment.failureReason}</Alert>
                  ) : null}
                  <p className="font-mono text-[10px] uppercase text-dark/50">
                    Verified {formatDate(payment.verifiedAt)} · Updated{' '}
                    {formatDate(payment.updatedAt)}
                  </p>
                </Panel>
              ))}
            </div>
          )}
        </>
      ) : null}
    </PageContainer>
  )
}
