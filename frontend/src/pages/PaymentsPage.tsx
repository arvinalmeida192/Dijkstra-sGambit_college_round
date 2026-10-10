import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { RefreshCw, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { LoadingBlock } from '../components/ui/Spinner'
import { PageContainer } from '../components/ui/PageContainer'
import { Panel } from '../components/ui/Panel'
import { SectionHeader } from '../components/ui/SectionHeader'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { formatAmountBaseUnits } from '../lib/agreementStatus'
import { ApiError, isApiConfigured } from '../lib/api/client'
import {
  ACTIVITY_PAGE_SIZE,
  ActivityTimeline,
} from '../components/activity/ActivityTimeline'
import {
  listMilestones,
  listProjectAuditLogs,
  type AuditLog,
  type Milestone,
} from '../lib/api/milestones'
import {
  listProjectPayments,
  reportMilestonePayment,
  syncPayment,
  type Payment,
  type PaymentStatus,
} from '../lib/api/payments'
import {
  getFundingStatus,
  createFundingOrder,
  verifyFundingPayment,
  releaseMilestonePayment,
  type FundingStatusResponse,
} from '../lib/api/funding'
import { getProject, type Project } from '../lib/api/projects'
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
} from '../lib/paymentStatus'
import { routes } from '../lib/routes'

declare global {
  interface Window {
    Razorpay?: any
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

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
  const { user, token } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [fundingStatus, setFundingStatus] = useState<FundingStatusResponse | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditLoadingMore, setAuditLoadingMore] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Razorpay Checkout modal state
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  // Release modal state
  const [releaseTarget, setReleaseTarget] = useState<{
    milestoneId: string
    title: string
    amount: number
  } | null>(null)
  const [releasing, setReleasing] = useState(false)

  // Blockchain fallback accordion
  const [showBlockchain, setShowBlockchain] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [milestoneId, setMilestoneId] = useState('')
  const [txHash, setTxHash] = useState('')
  const [txError, setTxError] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)

  const isClient = Boolean(user && project && user.id === project.client?.id)
  const isFreelancer = Boolean(user && project && user.id === project.freelancer?.id)

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
      const [projectResult, milestonesResult, fundingResult, paymentsResult, auditResult] =
        await Promise.all([
          getProject(token, projectId),
          listMilestones(token, projectId),
          getFundingStatus(token, projectId).catch(() => null),
          listProjectPayments(token, projectId).catch(() => ({ payments: [] })),
          listProjectAuditLogs(token, projectId, {
            limit: ACTIVITY_PAGE_SIZE,
            offset: 0,
          }).catch(() => ({ auditLogs: [], pagination: { limit: ACTIVITY_PAGE_SIZE, offset: 0, total: 0 } })),
        ])
      setProject(projectResult.project)
      setMilestones(milestonesResult.milestones)
      setFundingStatus(fundingResult)
      setPayments(paymentsResult.payments)
      setAuditLogs(auditResult.auditLogs)
      setAuditTotal(auditResult.pagination?.total ?? auditResult.auditLogs.length)
      setAuditError(null)
      setMilestoneId((current) =>
        current || milestonesResult.milestones[0]?.id || '',
      )
    } catch (err) {
      setProject(null)
      setMilestones([])
      setFundingStatus(null)
      setPayments([])
      setAuditLogs([])
      setAuditTotal(0)
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not load payment information.',
      )
    } finally {
      setLoading(false)
    }
  }, [token, projectId])

  useEffect(() => {
    void load()
  }, [load])

  const loadMoreAudit = useCallback(async () => {
    if (!token || !projectId || auditLoadingMore) return
    if (auditLogs.length >= auditTotal) return
    setAuditLoadingMore(true)
    setAuditError(null)
    try {
      const result = await listProjectAuditLogs(token, projectId, {
        limit: ACTIVITY_PAGE_SIZE,
        offset: auditLogs.length,
      })
      setAuditLogs((prev) => {
        const seen = new Set(prev.map((item) => item.id))
        const next = result.auditLogs.filter((item) => !seen.has(item.id))
        return [...prev, ...next]
      })
      setAuditTotal(result.pagination?.total ?? auditTotal)
    } catch (err) {
      setAuditError(
        err instanceof ApiError
          ? err.message
          : 'Could not load more activity.',
      )
    } finally {
      setAuditLoadingMore(false)
    }
  }, [token, projectId, auditLogs.length, auditTotal, auditLoadingMore])

  async function handleCheckout() {
    if (!token || !projectId) return
    setActionError(null)
    setActionSuccess(null)
    setCheckoutLoading(true)

    try {
      const scriptLoaded = await loadRazorpayScript()
      if (!scriptLoaded) {
        throw new Error('Failed to load Razorpay Checkout SDK. Check your internet connection.')
      }

      const orderData = await createFundingOrder(token, projectId)

      const options = {
        key: orderData.keyId,
        amount: orderData.amountPaise,
        currency: orderData.currency,
        name: 'Fairwork Escrow (Sandbox)',
        description: `Project Funding: ${orderData.projectTitle} (v${orderData.agreementVersion})`,
        order_id: orderData.orderId,
        handler: async (response: {
          razorpay_payment_id: string
          razorpay_order_id: string
          razorpay_signature: string
        }) => {
          try {
            setLoading(true)
            const verifyRes = await verifyFundingPayment(token, projectId, {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            })
            setActionSuccess(verifyRes.notice || 'Payment verified. Project successfully funded!')
            await load()
          } catch (err) {
            setActionError(
              err instanceof ApiError ? err.message : 'Payment verification failed.',
            )
          } finally {
            setLoading(false)
          }
        },
        prefill: {
          name: user?.name,
          email: user?.email,
        },
        theme: {
          color: '#18181b',
        },
        modal: {
          ondismiss: () => {
            setCheckoutLoading(false)
          },
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', (resp: any) => {
        setActionError(`Payment failed: ${resp.error?.description || 'Unknown error'}`)
        setCheckoutLoading(false)
      })
      rzp.open()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : (err as Error).message)
      setCheckoutLoading(false)
    }
  }

  async function handleConfirmRelease() {
    if (!token || !projectId || !releaseTarget) return
    setActionError(null)
    setActionSuccess(null)
    setReleasing(true)

    try {
      const res = await releaseMilestonePayment(token, projectId, releaseTarget.milestoneId)
      if (res.success) {
        setActionSuccess(res.notice || 'Milestone funds released successfully.')
      } else {
        setActionError(res.notice || 'Milestone release failed. State recorded as FAILED for retry.')
      }
      setReleaseTarget(null)
      await load()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Release failed.')
    } finally {
      setReleasing(false)
    }
  }

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
      await reportMilestonePayment(token, milestoneId, trimmed)
      setActionSuccess('Reported transaction hash. Verification is in progress.')
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

  const enabled = fundingStatus?.enabled ?? false
  const isFunded = fundingStatus?.isFunded ?? false
  const agreement = fundingStatus?.activeAgreement
  const feeEstimate = fundingStatus?.feeEstimate
  const milestoneFunds = fundingStatus?.milestoneFunds ?? []
  const fundingRecord = fundingStatus?.funding

  return (
    <PageContainer variant="app" className="space-y-6">
      <SectionHeader
        eyebrow="// Project Payments"
        title={project ? `Payments — ${project.title}` : 'Payments & Escrow'}
        meta={
          projectId ? (
            <Link
              to={routes.project(projectId)}
              className="font-mono text-xs font-bold uppercase tracking-wider text-accent hover:underline"
            >
              ← Overview
            </Link>
          ) : null
        }
      />

      {/* Feature Flag Disabled Banner */}
      {!enabled && (
        <Alert tone="warning">
          <strong>Razorpay Payments Disabled:</strong> Gateway payments are currently disabled (
          <code>GATEWAY_PAYMENTS_ENABLED=false</code>). Set <code>GATEWAY_PAYMENTS_ENABLED=true</code> with Razorpay test keys in backend <code>.env</code> to activate Razorpay checkout.
        </Alert>
      )}

      {/* Sandbox Notice Banner */}
      {enabled && (
        <Alert tone="info">
          <strong>Razorpay Test Mode:</strong> Checkout uses Razorpay Sandbox test credentials.
          Milestone releases use <strong>Simulated Payouts</strong> (<code>SIM-PAYOUT-&lt;id&gt;</code>) for safe demonstration. No live money is transferred.
        </Alert>
      )}

      {!isApiConfigured() ? (
        <Alert tone="warning">
          Set <code className="font-bold">VITE_API_BASE_URL</code> to load payments.
        </Alert>
      ) : null}

      {loading ? <LoadingBlock label="Loading payments and funding ledger..." /> : null}

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

      {!loading && !error && (
        <>
          {/* PRIMARY EXPERIENCE: Razorpay Gateway & Milestone Escrow Ledger */}
          <Panel tone="surface" shadow="sm" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-dark/60 block">
                  Project Funding Status
                </span>
                <div className="flex items-center gap-2 mt-1">
                  {isFunded ? (
                    <>
                      <Badge tone="success">PROJECT FUNDED</Badge>
                      <span className="font-mono text-xs text-dark/70">
                        Agreement funds are secured in the milestone ledger.
                      </span>
                    </>
                  ) : (
                    <>
                      <Badge tone="warning">AWAITING FUNDING</Badge>
                      <span className="font-mono text-xs text-dark/70">
                        Work cannot begin until the client funds the active agreement.
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={load}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Refresh
                </Button>
              </div>
            </div>

            {agreement ? (
              <div className="space-y-3 pt-3 border-t-2 border-dark/10">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
                  <div>
                    <span className="text-dark/60 block uppercase">Agreement</span>
                    <span className="font-bold text-dark text-sm">v{agreement.version}</span>
                    <span className="text-dark/50 block truncate">{agreement.title}</span>
                  </div>
                  <div>
                    <span className="text-dark/60 block uppercase">Project Deliverables</span>
                    <span className="font-bold text-dark text-sm">
                      ₹{(agreement.totalPayment / 100).toFixed(2)}
                    </span>
                    <span className="text-dark/50 block">
                      {agreement.totalPayment} cents
                    </span>
                  </div>
                  <div>
                    <span className="text-dark/60 block uppercase">Payment Reference</span>
                    <span className="font-bold text-dark text-sm truncate block">
                      {fundingRecord?.gatewayPaymentId || (isFunded ? 'Verified' : 'Pending')}
                    </span>
                    <span className="text-dark/50 block">
                      {fundingRecord?.paidAt ? new Date(fundingRecord.paidAt).toLocaleString() : 'Not paid'}
                    </span>
                  </div>
                </div>

                {/* Surcharge / Fee Breakdown */}
                {!isFunded && feeEstimate && (
                  <div className="p-3 bg-dark/5 border border-dark/10 rounded font-mono text-xs space-y-1">
                    <div className="flex justify-between text-dark/70">
                      <span>Agreed Project Deliverables:</span>
                      <span>₹{(feeEstimate.projectAmountCents / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-dark/70">
                      <span>Estimated Processing Fee ({(feeEstimate.feeRate * 100).toFixed(1)}% surcharge):</span>
                      <span>+ ₹{(feeEstimate.feeAmountCents / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-dark text-sm pt-1 border-t border-dark/10">
                      <span>Total Payable at Checkout:</span>
                      <span>₹{(feeEstimate.totalPayableCents / 100).toFixed(2)}</span>
                    </div>
                    <p className="font-body text-[11px] text-dark/50 pt-1">
                      * Note: The processing fee is paid on top by the client. The freelancer's agreed milestone compensation remains untouched.
                    </p>
                  </div>
                )}

                {isFunded && fundingRecord && (
                  <div className="p-3 bg-dark/5 border border-dark/10 rounded font-mono text-xs space-y-1">
                    <div className="flex justify-between text-dark/70">
                      <span>Freelancer Allocated Amount:</span>
                      <span>₹{(fundingRecord.amount / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-dark/70">
                      <span>Processing Fee ({(fundingRecord.feeStatus || 'CONFIRMED').toLowerCase()}):</span>
                      <span>₹{((fundingRecord.feeAmount ?? 0) / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-dark text-sm pt-1 border-t border-dark/10">
                      <span>Total Paid by Client:</span>
                      <span>₹{((fundingRecord.totalPayable ?? fundingRecord.amount) / 100).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="font-mono text-xs text-dark/60">
                No active agreement found. Both parties must review and accept the agreement before funding.
              </p>
            )}

            {/* Client CTA to fund project */}
            {enabled && isClient && !isFunded && agreement && (
              <div className="pt-4 border-t-2 border-dark/10 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h4 className="font-display font-bold uppercase text-dark">
                    Pay &amp; Fund Project
                  </h4>
                  <p className="font-body text-xs text-dark/70 mt-0.5">
                    Pay ₹{feeEstimate ? (feeEstimate.totalPayableCents / 100).toFixed(2) : (agreement.totalPayment / 100).toFixed(2)} via Razorpay Checkout test mode.
                  </p>
                </div>
                <Button
                  size="md"
                  variant="primary"
                  disabled={checkoutLoading}
                  onClick={handleCheckout}
                >
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  {checkoutLoading
                    ? 'Opening Checkout...'
                    : `Pay ₹${feeEstimate ? (feeEstimate.totalPayableCents / 100).toFixed(2) : (agreement.totalPayment / 100).toFixed(2)} (Test Mode)`}
                </Button>
              </div>
            )}

            {/* Freelancer notice */}
            {enabled && isFreelancer && !isFunded && (
              <div className="pt-4 border-t-2 border-dark/10">
                <Alert tone="warning">
                  <strong>Freelancer Notice:</strong> You cannot start work on milestones until the client funds the project.
                </Alert>
              </div>
            )}
          </Panel>

          {/* Milestone Escrow Ledger */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg uppercase tracking-tight">
                Milestone Escrow Ledger &amp; Payouts
              </h3>
              <span className="font-mono text-xs text-dark/60">
                {milestoneFunds.length} Milestone{milestoneFunds.length === 1 ? '' : 's'}
              </span>
            </div>

            {milestoneFunds.length === 0 ? (
              <Panel tone="surface" shadow="sm">
                <p className="font-mono text-xs text-dark/60">
                  No milestone funds allocated yet. Once the project is funded, each milestone is allocated its share in the ledger.
                </p>
              </Panel>
            ) : (
              <div className="space-y-3">
                {milestoneFunds.map((fund, idx) => {
                  const isApproved = fund.milestoneStatus === 'APPROVED'
                  const isDisputed = fund.milestoneStatus === 'DISPUTED'
                  const isHeld = fund.status === 'HELD'
                  const isFailed = fund.status === 'FAILED'
                  const isReleased = fund.status === 'RELEASED'
                  const canRelease = isClient && (isHeld || isFailed) && isApproved && !isDisputed

                  return (
                    <Panel key={fund.id} tone="surface" shadow="sm" className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-dark/50">
                              #{idx + 1}
                            </span>
                            <h4 className="font-display font-bold text-md text-dark">
                              {fund.milestoneTitle || `Milestone ${idx + 1}`}
                            </h4>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <Badge
                              tone={
                                isReleased
                                  ? 'success'
                                  : isDisputed || isFailed
                                  ? 'danger'
                                  : isHeld
                                  ? 'warning'
                                  : 'neutral'
                              }
                            >
                              FUNDS {fund.status}
                            </Badge>
                            <span className="font-mono text-xs text-dark/60">
                              Milestone: {fund.milestoneStatus || 'PENDING'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="font-display font-bold text-lg text-dark block">
                            ₹{(fund.amount / 100).toFixed(2)}
                          </span>
                          <span className="font-mono text-[11px] text-dark/50 block">
                            ({fund.amount} cents)
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t-2 border-dark/10 flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                        <div className="text-dark/60 space-y-0.5">
                          {fund.payoutReference && (
                            <div>
                              <span className="font-bold text-dark">Payout Reference:</span>{' '}
                              <code className="bg-dark/5 px-1 py-0.5 rounded text-[11px]">{fund.payoutReference}</code>
                              <span className="text-[10px] text-accent ml-1">(Sandbox payout)</span>
                            </div>
                          )}
                          {fund.releasedAt && (
                            <div>
                              <span className="font-bold text-dark">Released:</span>{' '}
                              {new Date(fund.releasedAt).toLocaleString()}
                            </div>
                          )}
                          {isFailed && fund.failureReason && (
                            <div className="text-danger font-bold">
                              Payout Failed: {fund.failureReason}
                            </div>
                          )}
                          {isDisputed && (
                            <div className="text-danger font-bold">
                              Disputed — Funds held until resolution. Other milestones proceed independently.
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div>
                          {canRelease && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() =>
                                setReleaseTarget({
                                  milestoneId: fund.milestoneId,
                                  title: fund.milestoneTitle || `Milestone #${idx + 1}`,
                                  amount: fund.amount,
                                })
                              }
                            >
                              {isFailed ? 'Retry Release →' : 'Release Funds →'}
                            </Button>
                          )}
                          {isHeld && !isApproved && !isDisputed && (
                            <span className="font-mono text-[11px] text-dark/40 italic">
                              Awaiting client approval
                            </span>
                          )}
                        </div>
                      </div>
                    </Panel>
                  )
                })}
              </div>
            )}
          </div>

          {/* SECONDARY / COMPATIBILITY: Blockchain Escrow Panel */}
          <div className="pt-4 border-t-2 border-dark/10">
            <button
              type="button"
              className="flex items-center justify-between w-full text-left font-mono text-xs uppercase tracking-wider text-dark/60 hover:text-dark py-2"
              onClick={() => setShowBlockchain(!showBlockchain)}
            >
              <span>On-Chain Escrow &amp; Blockchain Transactions (Advanced)</span>
              {showBlockchain ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showBlockchain && (
              <div className="space-y-4 pt-2">
                <Alert tone="info">
                  Fairwork indexes verified escrow events from local/test chains when configured.
                  This section is independent of Razorpay Gateway funding.
                </Alert>

                <Panel className="space-y-3">
                  <h2 className="font-display text-md text-dark">Blockchain Status Totals</h2>
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
                  <h2 className="font-display text-md text-dark">
                    Report On-Chain Transaction Hash
                  </h2>
                  <p className="font-body text-xs text-dark/70">
                    Wallet signs and broadcasts off-app. Paste the hash here so the
                    API can verify receipt + escrow events.
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
                  <Button size="sm" loading={reporting} onClick={() => void handleReport()}>
                    Verify &amp; record
                  </Button>
                </Panel>

                {payments.length > 0 && (
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
                            <RefreshCw className="h-3.5 w-3.5 aria-hidden" />
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
              </div>
            )}
          </div>

          <Panel className="space-y-3">
            <h2 className="font-display text-lg text-dark">
              Activity timeline
            </h2>
            <p className="font-body text-sm text-dark/70">
              Auditable project events (funding, releases, protection, disputes).
              Collapsed rows show summary, time, and actor only.
            </p>
            <ActivityTimeline
              items={auditLogs}
              loadingMore={auditLoadingMore}
              error={auditError}
              total={auditTotal}
              onLoadMore={() => void loadMoreAudit()}
            />
          </Panel>
        </>
      )}

      {/* Confirmation Modal for Releasing Funds */}
      {releaseTarget && (
        <Modal
          open={true}
          title="Confirm Milestone Payment Release"
          onClose={() => !releasing && setReleaseTarget(null)}
        >
          <div className="space-y-4 font-body">
            <p className="text-sm text-dark/80">
              Are you sure you want to release <strong>₹{(releaseTarget.amount / 100).toFixed(2)}</strong> for{' '}
              <strong>"{releaseTarget.title}"</strong>?
            </p>
            <Alert tone="info">
              In sandbox mode, this generates a simulated payout reference (
              <code>SIM-PAYOUT-&lt;fundId&gt;</code>) and marks the ledger as <strong>RELEASED</strong>.
            </Alert>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={releasing}
                onClick={() => setReleaseTarget(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={releasing}
                onClick={handleConfirmRelease}
              >
                {releasing ? 'Releasing...' : 'Confirm Release'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PageContainer>
  )
}
