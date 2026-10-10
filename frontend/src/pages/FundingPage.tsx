import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ShieldCheck, RefreshCw } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { LoadingBlock } from '../components/ui/Spinner'
import { PageContainer } from '../components/ui/PageContainer'
import { Panel } from '../components/ui/Panel'
import { SectionHeader } from '../components/ui/SectionHeader'
import { Modal } from '../components/ui/Modal'
import { ApiError, isApiConfigured } from '../lib/api/client'
import { getProject, type Project } from '../lib/api/projects'
import {
  getFundingStatus,
  createFundingOrder,
  verifyFundingPayment,
  releaseMilestonePayment,
  type FundingStatusResponse,
} from '../lib/api/funding'
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

export function FundingPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { user, token } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [fundingStatus, setFundingStatus] = useState<FundingStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  // Release modal state
  const [releaseTarget, setReleaseTarget] = useState<{
    milestoneId: string
    title: string
    amount: number
  } | null>(null)
  const [releasing, setReleasing] = useState(false)

  const isClient = Boolean(user && project && user.id === project.client?.id)
  const isFreelancer = Boolean(user && project && user.id === project.freelancer?.id)

  const loadData = useCallback(async () => {
    if (!token || !projectId) return
    setError(null)
    try {
      const [projData, statusData] = await Promise.all([
        getProject(token, projectId),
        getFundingStatus(token, projectId),
      ])
      setProject(projData.project)
      setFundingStatus(statusData)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load funding information.')
    } finally {
      setLoading(false)
    }
  }, [token, projectId])

  useEffect(() => {
    loadData()
  }, [loadData])

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
            await loadData()
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
      setActionSuccess(res.notice || 'Milestone funds released successfully.')
      setReleaseTarget(null)
      await loadData()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Release failed.')
    } finally {
      setReleasing(false)
    }
  }

  if (loading) {
    return (
      <PageContainer variant="app">
        <LoadingBlock label="Loading funding status..." />
      </PageContainer>
    )
  }

  if (!isApiConfigured()) {
    return (
      <PageContainer variant="app">
        <Alert tone="warning">Set VITE_API_BASE_URL to access funding features.</Alert>
      </PageContainer>
    )
  }

  const enabled = fundingStatus?.enabled ?? false
  const isFunded = fundingStatus?.isFunded ?? false
  const agreement = fundingStatus?.agreement
  const milestoneFunds = fundingStatus?.milestoneFunds ?? []
  const fundingRecord = fundingStatus?.funding

  return (
    <PageContainer variant="app" className="space-y-6">
      <SectionHeader
        eyebrow="// Escrow Ledger"
        title="Fund Project (Sandbox)"
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
        <Alert tone="info">
          Gateway sandbox funding is currently <strong>disabled</strong> on the server (
          <code>GATEWAY_PAYMENTS_ENABLED=false</code>). Conventional milestones remain active.
        </Alert>
      )}

      {/* Sandbox Notice Banner */}
      {enabled && (
        <Alert tone="warning">
          <strong>Sandbox Test Mode:</strong> Uses Razorpay test credentials (UPI / NetBanking / Cards).
          Milestone payouts use <strong>Simulated Payouts</strong> (<code>SIM-PAYOUT-&lt;id&gt;</code>) for safe demonstration.
        </Alert>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
      {actionError && <Alert tone="danger">{actionError}</Alert>}
      {actionSuccess && <Alert tone="success">{actionSuccess}</Alert>}

      {/* Status Summary Panel */}
      <Panel tone="surface" shadow="sm" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-dark/60 block">
              Funding Status
            </span>
            <div className="flex items-center gap-2 mt-1">
              {isFunded ? (
                <>
                  <Badge tone="success">PROJECT FUNDED</Badge>
                  <span className="font-mono text-xs text-dark/70">
                    All milestones are backed by held funds in escrow.
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
            <Button size="sm" variant="secondary" onClick={loadData}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        {agreement ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t-2 border-dark/10 font-mono text-xs">
            <div>
              <span className="text-dark/60 block uppercase">Agreement Version</span>
              <span className="font-bold text-dark text-sm">v{agreement.version}</span>
              <span className="text-dark/50 block truncate">{agreement.title}</span>
            </div>
            <div>
              <span className="text-dark/60 block uppercase">Total Required</span>
              <span className="font-bold text-dark text-sm">
                ₹{(agreement.totalPayment / 100).toFixed(2)}
              </span>
              <span className="text-dark/50 block">
                {agreement.totalPayment} cents ({fundingStatus?.totalAmountPaise} paise)
              </span>
            </div>
            <div>
              <span className="text-dark/60 block uppercase">Funding Record</span>
              <span className="font-bold text-dark text-sm">
                {fundingRecord?.gatewayPaymentId || (isFunded ? 'Verified' : 'Pending')}
              </span>
              <span className="text-dark/50 block">
                {fundingRecord?.paidAt ? new Date(fundingRecord.paidAt).toLocaleString() : 'Not paid'}
              </span>
            </div>
          </div>
        ) : (
          <p className="font-mono text-xs text-dark/60">
            No active agreement found. Both parties must accept an agreement before funding.
          </p>
        )}

        {/* Client CTA to fund project */}
        {enabled && isClient && !isFunded && agreement && (
          <div className="pt-4 border-t-2 border-dark/10 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h4 className="font-display font-bold uppercase text-dark">
                Fund Milestone Escrow
              </h4>
              <p className="font-body text-xs text-dark/70 mt-0.5">
                Lock the total agreement amount (₹{(agreement.totalPayment / 100).toFixed(2)}) via Razorpay Checkout test mode.
              </p>
            </div>
            <Button
              size="md"
              variant="primary"
              disabled={checkoutLoading}
              onClick={handleCheckout}
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              {checkoutLoading ? 'Opening Checkout...' : `Pay ₹${(agreement.totalPayment / 100).toFixed(2)} (Test Mode)`}
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

      {/* Milestone Funds Ledger */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-lg uppercase tracking-tight">
            Milestone Escrow Ledger
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
              const isReleased = fund.status === 'RELEASED'
              const canRelease = isClient && isHeld && isApproved && !isDisputed

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
                              : isDisputed
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
                      {isDisputed && (
                        <div className="text-danger font-bold">
                          Disputed — Funds held until resolution.
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
                          Release Funds →
                        </Button>
                      )}
                      {isHeld && !isApproved && !isDisputed && (
                        <span className="font-mono text-[11px] text-dark/40 italic">
                          Awaiting milestone approval
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
