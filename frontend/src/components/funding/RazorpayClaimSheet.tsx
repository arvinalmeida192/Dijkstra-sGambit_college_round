import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { cn } from '../../lib/cn'

export type RazorpayClaimTarget = {
  milestoneId: string
  title: string
  amount: number
}

export type RazorpayClaimResult = {
  payoutReference: string
}

type RazorpayClaimSheetProps = {
  open: boolean
  target: RazorpayClaimTarget | null
  keyId?: string
  busy?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: (details: {
    upiId: string
    accountHolder: string
  }) => Promise<RazorpayClaimResult | null>
}

function formatInr(paise: number) {
  return (paise / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  })
}

/**
 * Razorpay-styled payout sheet for freelancer claims (sandbox).
 * Mirrors Checkout branding so the claim path feels like a real Razorpay flow.
 */
export function RazorpayClaimSheet({
  open,
  target,
  keyId,
  busy = false,
  error = null,
  onClose,
  onConfirm,
}: RazorpayClaimSheetProps) {
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [upiId, setUpiId] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<{
    payoutReference: string
    upiId: string
    accountHolder: string
  } | null>(null)

  useEffect(() => {
    if (!open) return
    setUpiId('')
    setAccountHolder('')
    setFieldError(null)
    setReceipt(null)
  }, [open, target?.milestoneId])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy && !receipt) onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, busy, receipt])

  useEffect(() => {
    if (!receipt) return
    const timer = window.setTimeout(() => onCloseRef.current(), 2200)
    return () => window.clearTimeout(timer)
  }, [receipt])

  if (!open || !target) return null

  const maskedKey =
    keyId && keyId.length > 12
      ? `${keyId.slice(0, 10)}…${keyId.slice(-4)}`
      : keyId || 'rzp_test_••••'

  async function submit() {
    const upi = upiId.trim()
    const holder = accountHolder.trim()
    if (!holder) {
      setFieldError('Enter the account holder name.')
      return
    }
    if (!upi || !upi.includes('@')) {
      setFieldError('Enter a valid UPI ID (e.g. name@okaxis).')
      return
    }
    setFieldError(null)
    const result = await onConfirm({ upiId: upi, accountHolder: holder })
    if (result?.payoutReference) {
      setReceipt({
        payoutReference: result.payoutReference,
        upiId: upi,
        accountHolder: holder,
      })
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center bg-[#0b1b33]/70 p-0 sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy && !receipt) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'w-full max-w-md overflow-hidden bg-white shadow-2xl',
          'sm:rounded-xl border border-[#d6dde8]',
        )}
      >
        <div className="bg-[#072654] px-5 py-4 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-md bg-[#3395ff] font-display text-sm font-black"
                aria-hidden
              >
                R
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                  Razorpay · Test Mode
                </p>
                <h2 id={titleId} className="font-display text-lg font-bold leading-tight">
                  {receipt ? 'Payout processed' : 'Claim payout'}
                </h2>
              </div>
            </div>
            {!receipt ? (
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="rounded px-2 py-1 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50"
                aria-label="Close"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>

        {receipt ? (
          <div className="space-y-4 px-5 py-6">
            <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white"
                aria-hidden
              >
                ✓
              </span>
              <div>
                <p className="text-sm font-semibold text-emerald-900">
                  Payout queued successfully
                </p>
                <p className="text-xs text-emerald-800/80">
                  Status · PROCESSED (test)
                </p>
              </div>
            </div>

            <dl className="space-y-2 rounded-lg border border-[#e5ebf3] bg-[#f7f9fc] px-4 py-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[#5b6b86]">Payout ID</dt>
                <dd className="font-mono text-xs font-semibold text-[#072654]">
                  {receipt.payoutReference}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#5b6b86]">Amount</dt>
                <dd className="font-semibold text-[#072654]">
                  {formatInr(target.amount)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#5b6b86]">UPI</dt>
                <dd className="font-mono text-xs text-[#072654]">{receipt.upiId}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#5b6b86]">Account</dt>
                <dd className="text-[#072654]">{receipt.accountHolder}</dd>
              </div>
            </dl>

            <p className="text-center text-[11px] text-[#5b6b86]">
              Escrow marked RELEASED in Fairwork. Closing…
            </p>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            <div className="rounded-lg border border-[#e5ebf3] bg-[#f7f9fc] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5b6b86]">
                Amount to withdraw
              </p>
              <p className="mt-1 font-display text-3xl font-black tracking-tight text-[#072654]">
                {formatInr(target.amount)}
              </p>
              <p className="mt-1 text-sm text-[#3d4f6f]">
                Milestone: <span className="font-semibold">{target.title}</span>
              </p>
            </div>

            <div className="space-y-3">
              <Input
                label="Account holder"
                name="rzpAccountHolder"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder="Name as on bank / UPI"
                disabled={busy}
                autoComplete="name"
              />
              <Input
                label="UPI ID"
                name="rzpUpiId"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="you@okaxis"
                disabled={busy}
                autoComplete="off"
                hint="Sandbox only — no real bank transfer is sent."
              />
            </div>

            {(fieldError || error) && (
              <p
                className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700"
                role="alert"
              >
                {fieldError || error}
              </p>
            )}

            <div className="rounded-lg border border-dashed border-[#c9d4e5] bg-[#f0f6ff] px-3 py-2 text-[11px] text-[#2f4f7a]">
              <p>
                Powered by Razorpay Payouts (test). Key{' '}
                <code className="font-mono">{maskedKey}</code>
              </p>
              <p className="mt-1 text-[#5b6b86]">
                Completing this claim records a Razorpay sandbox payout id (
                <code className="font-mono">pout_…</code>) and releases held escrow
                in Fairwork. Live Route/X transfers are not enabled.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <Button
                fullWidth
                disabled={busy}
                loading={busy}
                onClick={() => void submit()}
                className="!border-[#072654] !bg-[#3395ff] !shadow-none hover:!bg-[#2b84e6]"
              >
                {busy ? 'Processing with Razorpay…' : 'Withdraw via Razorpay'}
              </Button>
              <Button
                fullWidth
                variant="secondary"
                disabled={busy}
                onClick={onClose}
                className="!shadow-none"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
