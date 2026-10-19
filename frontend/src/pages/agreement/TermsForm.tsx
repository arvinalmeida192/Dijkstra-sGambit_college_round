import { useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { formatAmountBaseUnits } from '../../lib/agreementStatus'
import type { AgreementTermsInput } from '../../lib/api/agreements'
import type {
  AutomatedCheckType,
  VerificationMethod,
} from '../../lib/api/verification'

type MilestoneDraft = {
  title: string
  description: string
  deliverables: string
  acceptanceCriteria: string
  /** Major currency units as a string, e.g. "250.00" → stored as cents. */
  amountMajor: string
  dueDate: string
  reviewWindowDays: string
  gracePeriodDays: string
  maxRevisions: string
  verificationMethod: VerificationMethod
  challengeWindowHours: string
  disputeEscalationDays: string
  expectedSha256: string
  automatedCheckType: AutomatedCheckType
  automatedCheckConfigText: string
}

type TermsFormProps = {
  initial?: AgreementTermsInput
  submitLabel: string
  onSubmit: (terms: AgreementTermsInput) => Promise<void>
  onCancel?: () => void
  disabled?: boolean
}

function emptyMilestone(): MilestoneDraft {
  return {
    title: '',
    description: '',
    deliverables: '',
    acceptanceCriteria: '',
    amountMajor: '',
    dueDate: '',
    reviewWindowDays: '7',
    gracePeriodDays: '3',
    maxRevisions: '3',
    verificationMethod: 'HUMAN_REVIEWED',
    challengeWindowHours: '24',
    disputeEscalationDays: '7',
    expectedSha256: '',
    automatedCheckType: 'JSON_ASSERTIONS',
    automatedCheckConfigText: '',
  }
}

function fromTerms(terms?: AgreementTermsInput): {
  title: string
  description: string
  finalDeliverable: string
  completionCriteria: string
  totalPaymentMajor: string
  finalDueDate: string
  notes: string
  milestones: MilestoneDraft[]
} {
  if (!terms) {
    return {
      title: '',
      description: '',
      finalDeliverable: '',
      completionCriteria: '',
      totalPaymentMajor: '',
      finalDueDate: '',
      notes: '',
      milestones: [emptyMilestone()],
    }
  }

  const legacyTotalCents =
    terms.totalPayment ??
    terms.milestones.reduce((acc, m) => acc + (m.amount || 0), 0)
  const legacyLastDue =
    terms.finalDueDate ??
    [...terms.milestones].filter((m) => m.dueDate).pop()?.dueDate ??
    ''

  return {
    title: terms.title ?? terms.summary ?? '',
    description: terms.description ?? '',
    finalDeliverable: terms.finalDeliverable ?? '',
    completionCriteria: terms.completionCriteria ?? '',
    totalPaymentMajor:
      legacyTotalCents > 0 ? (legacyTotalCents / 100).toFixed(2) : '',
    finalDueDate: legacyLastDue,
    notes: terms.notes ?? '',
    milestones: terms.milestones.map((m) => {
      const firstCheck = m.verificationCriteria?.automatedChecks?.[0]
      return {
        title: m.title,
        description: m.description ?? '',
        deliverables: m.deliverables ?? m.description ?? '',
        acceptanceCriteria: m.acceptanceCriteria ?? '',
        amountMajor: (m.amount / 100).toFixed(2),
        dueDate: m.dueDate ?? '',
        reviewWindowDays:
          m.reviewWindowDays != null ? String(m.reviewWindowDays) : '7',
        gracePeriodDays:
          m.gracePeriodDays != null ? String(m.gracePeriodDays) : '3',
        maxRevisions: m.maxRevisions != null ? String(m.maxRevisions) : '3',
        verificationMethod: m.verificationMethod ?? 'HUMAN_REVIEWED',
        challengeWindowHours:
          m.challengeWindowHours != null ? String(m.challengeWindowHours) : '24',
        disputeEscalationDays:
          m.disputeEscalationDays != null ? String(m.disputeEscalationDays) : '7',
        expectedSha256:
          m.verificationCriteria?.requiredEvidence?.expectedSha256 ?? '',
        automatedCheckType: firstCheck?.type ?? 'JSON_ASSERTIONS',
        automatedCheckConfigText: firstCheck?.config
          ? JSON.stringify(firstCheck.config, null, 2)
          : '',
      }
    }),
  }
}

function parseAmountMajor(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const cents = Math.round(Number(trimmed) * 100)
  if (!Number.isFinite(cents) || cents <= 0) return null
  return cents
}

function isValidDateOnly(val: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false
  const [y, m, d] = val.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

export function TermsForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  disabled = false,
}: TermsFormProps) {
  const seed = fromTerms(initial)
  const [title, setTitle] = useState(seed.title)
  const [description, setDescription] = useState(seed.description)
  const [finalDeliverable, setFinalDeliverable] = useState(seed.finalDeliverable)
  const [completionCriteria, setCompletionCriteria] = useState(
    seed.completionCriteria,
  )
  const [totalPaymentMajor, setTotalPaymentMajor] = useState(
    seed.totalPaymentMajor,
  )
  const [finalDueDate, setFinalDueDate] = useState(seed.finalDueDate)
  const [notes, setNotes] = useState(seed.notes)
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(seed.milestones)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Calculations for dynamic allocation
  const totalCents = parseAmountMajor(totalPaymentMajor) ?? 0
  const allocatedCents = milestones.reduce((sum, m) => {
    const parsed = parseAmountMajor(m.amountMajor)
    return sum + (parsed ?? 0)
  }, 0)
  const remainingCents = totalCents - allocatedCents
  const isOverAllocated = allocatedCents > totalCents && totalCents > 0
  const isUnderAllocated = allocatedCents < totalCents && totalCents > 0
  const isFullyAllocated = allocatedCents === totalCents && totalCents > 0

  function updateMilestone(index: number, patch: Partial<MilestoneDraft>) {
    setMilestones((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    )
  }

  function moveMilestone(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= milestones.length) return
    setMilestones((prev) => {
      const copy = [...prev]
      const temp = copy[index]
      copy[index] = copy[targetIndex]
      copy[targetIndex] = temp
      return copy
    })
  }

  function validate(): {
    errors: Record<string, string>
    terms?: AgreementTermsInput
  } {
    const errors: Record<string, string> = {}

    if (!title.trim()) errors.title = 'Agreement title is required.'
    if (!description.trim()) {
      errors.description = 'Scope and description are required.'
    }
    if (!finalDeliverable.trim()) {
      errors.finalDeliverable = 'Final deliverable is required.'
    }
    if (!completionCriteria.trim()) {
      errors.completionCriteria = 'Completion criteria are required.'
    }

    const parsedTotal = parseAmountMajor(totalPaymentMajor)
    if (parsedTotal == null) {
      errors.totalPayment =
        'Enter a valid positive total payment (e.g. 1000.00).'
    }

    if (!finalDueDate.trim()) {
      errors.finalDueDate = 'Final project due date is required.'
    } else if (!isValidDateOnly(finalDueDate.trim())) {
      errors.finalDueDate = 'Enter a valid calendar date in YYYY-MM-DD format.'
    }

    if (milestones.length === 0) {
      errors.milestones = 'Add at least one milestone.'
    }

    let runningAllocatedCents = 0
    let previousDueDate: string | null = null
    let lastMilestoneDueDate: string | null = null

    const parsedMilestones: AgreementTermsInput['milestones'] = []
    for (let index = 0; index < milestones.length; index++) {
      const m = milestones[index]
      const prefix = `m${index}`
      if (!m.title.trim()) errors[`${prefix}.title`] = 'Title is required.'
      if (!m.deliverables.trim() && !m.description.trim()) {
        errors[`${prefix}.deliverables`] = 'Deliverables are required.'
      }

      const amount = parseAmountMajor(m.amountMajor)
      if (amount == null) {
        errors[`${prefix}.amount`] =
          'Enter a valid positive amount (e.g. 250.00).'
      } else {
        runningAllocatedCents += amount
      }

      if (!m.dueDate.trim()) {
        errors[`${prefix}.dueDate`] = 'Due date is required.'
      } else if (!isValidDateOnly(m.dueDate.trim())) {
        errors[`${prefix}.dueDate`] = 'Valid date (YYYY-MM-DD) required.'
      } else {
        const currentDue = m.dueDate.trim()
        if (previousDueDate && currentDue < previousDueDate) {
          errors[`${prefix}.dueDate`] =
            `Must be on or after previous milestone (${previousDueDate}).`
        }
        previousDueDate = currentDue
        lastMilestoneDueDate = currentDue
      }
      let reviewWindowDays: number | undefined = 7
      if (m.reviewWindowDays.trim()) {
        const n = Number(m.reviewWindowDays)
        if (!Number.isInteger(n) || n < 1) {
          errors[`${prefix}.reviewWindowDays`] = 'Enter a positive integer.'
        } else {
          reviewWindowDays = n
        }
      }

      let gracePeriodDays: number | undefined = 3
      if (m.gracePeriodDays.trim()) {
        const n = Number(m.gracePeriodDays)
        if (!Number.isInteger(n) || n < 0) {
          errors[`${prefix}.gracePeriodDays`] = 'Enter a non-negative integer.'
        } else {
          gracePeriodDays = n
        }
      }

      let maxRevisions: number | undefined = 3
      if (m.maxRevisions.trim()) {
        const n = Number(m.maxRevisions)
        if (!Number.isInteger(n) || n < 1) {
          errors[`${prefix}.maxRevisions`] = 'Enter a positive integer.'
        } else {
          maxRevisions = n
        }
      }

      let challengeWindowHours: number | undefined = 24
      if (m.challengeWindowHours.trim()) {
        const n = Number(m.challengeWindowHours)
        if (!Number.isInteger(n) || n < 0 || n > 720) {
          errors[`${prefix}.challengeWindowHours`] = '0 to 720 hours.'
        } else {
          challengeWindowHours = n
        }
      }

      let disputeEscalationDays: number | undefined = 7
      if (m.disputeEscalationDays.trim()) {
        const n = Number(m.disputeEscalationDays)
        if (!Number.isInteger(n) || n < 1 || n > 90) {
          errors[`${prefix}.disputeEscalationDays`] = '1 to 90 days.'
        } else {
          disputeEscalationDays = n
        }
      }

      let parsedAutoConfig: Record<string, unknown> = {}
      if (
        m.verificationMethod === 'AUTOMATED_CHECK' &&
        m.automatedCheckConfigText.trim()
      ) {
        try {
          const parsed = JSON.parse(m.automatedCheckConfigText.trim())
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            errors[`${prefix}.automatedCheckConfigText`] =
              'Must be a JSON object.'
          } else {
            parsedAutoConfig = parsed as Record<string, unknown>
          }
        } catch {
          errors[`${prefix}.automatedCheckConfigText`] = 'Invalid JSON syntax.'
        }
      }

      if (
        !errors[`${prefix}.title`] &&
        !errors[`${prefix}.deliverables`] &&
        !errors[`${prefix}.amount`] &&
        !errors[`${prefix}.dueDate`] &&
        !errors[`${prefix}.reviewWindowDays`] &&
        !errors[`${prefix}.gracePeriodDays`] &&
        !errors[`${prefix}.maxRevisions`] &&
        !errors[`${prefix}.challengeWindowHours`] &&
        !errors[`${prefix}.disputeEscalationDays`] &&
        !errors[`${prefix}.automatedCheckConfigText`]
      ) {
        const criteriaLines = (m.acceptanceCriteria.trim() || 'Deliverable accepted')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)

        const automatedChecks =
          m.verificationMethod === 'AUTOMATED_CHECK'
            ? [
                {
                  id: `check-${index + 1}`,
                  name: `${m.automatedCheckType} Verification`,
                  type: m.automatedCheckType,
                  config: parsedAutoConfig,
                },
              ]
            : []

        parsedMilestones.push({
          title: m.title.trim(),
          description: m.description.trim() || undefined,
          deliverables: m.deliverables.trim() || m.description.trim(),
          deliverableDescription: m.deliverables.trim() || m.description.trim(),
          acceptanceCriteria:
            m.acceptanceCriteria.trim() || 'Deliverable accepted',
          verificationMethod: m.verificationMethod,
          challengeWindowHours,
          disputeEscalationDays,
          verificationCriteria: {
            acceptanceCriteria: criteriaLines,
            requiredEvidence: {
              requireFile:
                m.verificationMethod === 'AUTOMATED_CHECK' ||
                m.verificationMethod === 'EVIDENCE_INTEGRITY_CHECK',
              expectedSha256: m.expectedSha256.trim() || null,
            },
            automatedChecks,
            challengeWindowHours,
            disputeEscalationDays,
          },
          amount: amount!,
          dueDate: m.dueDate.trim(),
          reviewWindowDays,
          gracePeriodDays,
          maxRevisions,
        })
      }
    }

    if (parsedTotal != null) {
      if (runningAllocatedCents > parsedTotal) {
        errors.allocations = `Allocated milestone amount (${formatAmountBaseUnits(runningAllocatedCents)}) exceeds total agreement payment (${formatAmountBaseUnits(parsedTotal)}).`
      } else if (runningAllocatedCents < parsedTotal) {
        errors.allocations = `Milestone payments (${formatAmountBaseUnits(runningAllocatedCents)}) must equal the total agreement payment (${formatAmountBaseUnits(parsedTotal)}). Remaining: ${formatAmountBaseUnits(parsedTotal - runningAllocatedCents)}.`
      }
    }

    if (
      finalDueDate.trim() &&
      isValidDateOnly(finalDueDate.trim()) &&
      lastMilestoneDueDate &&
      finalDueDate.trim() < lastMilestoneDueDate
    ) {
      errors.finalDueDate = `Final project due date must be on or after the last milestone's due date (${lastMilestoneDueDate}).`
    }

    if (Object.keys(errors).length > 0) return { errors }

    return {
      errors,
      terms: {
        title: title.trim(),
        description: description.trim(),
        summary: title.trim(),
        finalDeliverable: finalDeliverable.trim(),
        completionCriteria: completionCriteria.trim(),
        totalPayment: parsedTotal!,
        finalDueDate: finalDueDate.trim(),
        notes: notes.trim() || undefined,
        milestones: parsedMilestones,
      },
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const { errors, terms } = validate()
    setFieldErrors(errors)
    if (!terms) return

    setLoading(true)
    try {
      await onSubmit(terms)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setLoading(false)
    }
  }

  const busy = loading || disabled

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* 1. Overall Agreement Section */}
      <div className="border-2 border-dark/20 bg-white p-5 space-y-4">
        <div>
          <h3 className="font-display font-bold text-base uppercase tracking-tight text-dark">
            Overall Project Agreement
          </h3>
          <p className="font-mono text-xs text-dark/60 mt-1">
            Define the overall scope, deliverables, total budget, and final deadline.
          </p>
        </div>

        <Input
          label="Agreement Title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={fieldErrors.title}
          disabled={busy}
          placeholder="e.g. Full-Stack Web Application Development"
        />

        <Textarea
          label="Project Scope & Description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={fieldErrors.description}
          disabled={busy}
          rows={3}
          placeholder="Detailed scope, technical requirements, and agreed expectations…"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Textarea
            label="Final Deliverable"
            name="finalDeliverable"
            value={finalDeliverable}
            onChange={(e) => setFinalDeliverable(e.target.value)}
            error={fieldErrors.finalDeliverable}
            disabled={busy}
            rows={2}
            placeholder="e.g. Production code repository, deployment config, and documentation"
          />

          <Textarea
            label="Final Completion Criteria"
            name="completionCriteria"
            value={completionCriteria}
            onChange={(e) => setCompletionCriteria(e.target.value)}
            error={fieldErrors.completionCriteria}
            disabled={busy}
            rows={2}
            placeholder="e.g. All milestones approved, test suite passes, and handover verified"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Total Agreed Payment"
            name="totalPaymentMajor"
            value={totalPaymentMajor}
            onChange={(e) => setTotalPaymentMajor(e.target.value)}
            error={fieldErrors.totalPayment}
            hint="Major currency units (stored as integer cents ×100)"
            placeholder="1000.00"
            disabled={busy}
          />

          <Input
            label="Final Project Due Date"
            name="finalDueDate"
            type="date"
            value={finalDueDate}
            onChange={(e) => setFinalDueDate(e.target.value)}
            error={fieldErrors.finalDueDate}
            hint="Must be on or after the last milestone due date"
            disabled={busy}
          />
        </div>
      </div>

      {/* 2. Milestone Builder Section */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display font-bold text-base uppercase tracking-tight text-dark">
              Milestone Builder
            </h3>
            <p className="font-mono text-xs text-dark/60">
              Add, reorder, and schedule milestones. Total milestone allocations must match the total payment.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || milestones.length >= 20}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setMilestones((prev) => [...prev, emptyMilestone()])}
          >
            Add milestone
          </Button>
        </div>

        {/* Dynamic Allocation Summary Box */}
        <div className="border-2 border-dark/20 bg-neutral-50 p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
            <div>
              <span className="text-dark/60">Total Agreed: </span>
              <span className="font-bold text-dark">
                {totalCents > 0 ? formatAmountBaseUnits(totalCents) : '0.00 units'}
              </span>
            </div>
            <div>
              <span className="text-dark/60">Allocated: </span>
              <span className="font-bold text-dark">
                {formatAmountBaseUnits(allocatedCents)}
              </span>
            </div>
            <div>
              <span className="text-dark/60">Remaining: </span>
              <span
                className={`font-bold ${
                  remainingCents < 0
                    ? 'text-status-danger'
                    : remainingCents === 0 && totalCents > 0
                      ? 'text-status-success'
                      : 'text-status-warning'
                }`}
              >
                {formatAmountBaseUnits(Math.abs(remainingCents))}
                {remainingCents < 0 ? ' (over-allocated)' : ''}
              </span>
            </div>
          </div>

          {isOverAllocated ? (
            <Alert tone="danger">
              Allocated amount ({formatAmountBaseUnits(allocatedCents)}) exceeds total agreement payment ({formatAmountBaseUnits(totalCents)}). Reduce milestone amounts before saving.
            </Alert>
          ) : isUnderAllocated ? (
            <Alert tone="warning">
              {formatAmountBaseUnits(remainingCents)} remaining to be allocated across milestones.
            </Alert>
          ) : isFullyAllocated ? (
            <Alert tone="success">
              Total payment fully allocated across {milestones.length} milestone(s).
            </Alert>
          ) : null}

          {fieldErrors.allocations ? (
            <p className="font-mono text-[11px] text-status-danger" role="alert">
              {fieldErrors.allocations}
            </p>
          ) : null}
        </div>

        {fieldErrors.milestones ? (
          <p className="font-mono text-[11px] text-status-danger" role="alert">
            {fieldErrors.milestones}
          </p>
        ) : null}

        {milestones.map((m, index) => (
          <div
            key={index}
            className="border-2 border-dark/20 bg-white p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-bold uppercase text-dark/70">
                Milestone {index + 1} of {milestones.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy || index === 0}
                  aria-label="Move milestone up"
                  leftIcon={<ArrowUp className="w-3.5 h-3.5" />}
                  onClick={() => moveMilestone(index, 'up')}
                >
                  Up
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy || index === milestones.length - 1}
                  aria-label="Move milestone down"
                  leftIcon={<ArrowDown className="w-3.5 h-3.5" />}
                  onClick={() => moveMilestone(index, 'down')}
                >
                  Down
                </Button>
                {milestones.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label="Remove milestone"
                    leftIcon={<Trash2 className="w-3.5 h-3.5 text-status-danger" />}
                    onClick={() =>
                      setMilestones((prev) =>
                        prev.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>

            <Input
              label="Title"
              name={`m${index}-title`}
              value={m.title}
              onChange={(e) =>
                updateMilestone(index, { title: e.target.value })
              }
              error={fieldErrors[`m${index}.title`]}
              disabled={busy}
              placeholder="e.g. Frontend Architecture & Prototyping"
            />

            <Textarea
              label="Description / Scope"
              name={`m${index}-description`}
              value={m.description}
              onChange={(e) =>
                updateMilestone(index, { description: e.target.value })
              }
              error={fieldErrors[`m${index}.description`]}
              disabled={busy}
              rows={2}
              placeholder="Specific scope and work required for this milestone…"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Textarea
                label="Deliverables"
                name={`m${index}-deliverables`}
                value={m.deliverables}
                onChange={(e) =>
                  updateMilestone(index, { deliverables: e.target.value })
                }
                error={fieldErrors[`m${index}.deliverables`]}
                disabled={busy}
                rows={2}
                placeholder="What tangible artifacts will be delivered…"
              />
              <Textarea
                label="Acceptance criteria"
                name={`m${index}-criteria`}
                value={m.acceptanceCriteria}
                onChange={(e) =>
                  updateMilestone(index, {
                    acceptanceCriteria: e.target.value,
                  })
                }
                error={fieldErrors[`m${index}.acceptanceCriteria`]}
                disabled={busy}
                rows={2}
                placeholder="Conditions required for milestone signoff…"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Amount"
                name={`m${index}-amount`}
                value={m.amountMajor}
                onChange={(e) =>
                  updateMilestone(index, { amountMajor: e.target.value })
                }
                error={fieldErrors[`m${index}.amount`]}
                hint="Major units (×100 cents)"
                placeholder="250.00"
                disabled={busy}
              />
              <Input
                label="Due date"
                name={`m${index}-due`}
                type="date"
                value={m.dueDate}
                onChange={(e) =>
                  updateMilestone(index, { dueDate: e.target.value })
                }
                error={fieldErrors[`m${index}.dueDate`]}
                disabled={busy}
              />
              <Input
                label="Review window (days)"
                name={`m${index}-review`}
                inputMode="numeric"
                value={m.reviewWindowDays}
                onChange={(e) =>
                  updateMilestone(index, { reviewWindowDays: e.target.value })
                }
                error={fieldErrors[`m${index}.reviewWindowDays`]}
                disabled={busy}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Grace period (days)"
                name={`m${index}-grace`}
                inputMode="numeric"
                value={m.gracePeriodDays}
                onChange={(e) =>
                  updateMilestone(index, { gracePeriodDays: e.target.value })
                }
                error={fieldErrors[`m${index}.gracePeriodDays`]}
                disabled={busy}
              />
              <Input
                label="Max revision rounds"
                name={`m${index}-revisions`}
                inputMode="numeric"
                value={m.maxRevisions}
                onChange={(e) =>
                  updateMilestone(index, { maxRevisions: e.target.value })
                }
                error={fieldErrors[`m${index}.maxRevisions`]}
                disabled={busy}
              />
            </div>

            <div className="border-t-2 border-dark/10 pt-3 space-y-3 bg-neutral-50/70 p-3">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/60">
                Verifiable Fulfilment &amp; Smart-Contract Release Rules
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Select
                  label="Verification method"
                  name={`m${index}-verification-method`}
                  value={m.verificationMethod}
                  disabled={busy}
                  options={[
                    {
                      value: 'HUMAN_REVIEWED',
                      label: 'Human-Reviewed (Subjective Criteria)',
                    },
                    {
                      value: 'EVIDENCE_INTEGRITY_CHECK',
                      label: 'Cryptographic Evidence Integrity Check',
                    },
                    {
                      value: 'AUTOMATED_CHECK',
                      label: 'Automated Objective Check (Sandbox / JSON / Text)',
                    },
                  ]}
                  onChange={(e) =>
                    updateMilestone(index, {
                      verificationMethod: e.target.value as VerificationMethod,
                    })
                  }
                />
                <Input
                  label="Challenge window (hours)"
                  name={`m${index}-challenge-hours`}
                  inputMode="numeric"
                  value={m.challengeWindowHours}
                  onChange={(e) =>
                    updateMilestone(index, {
                      challengeWindowHours: e.target.value,
                    })
                  }
                  error={fieldErrors[`m${index}.challengeWindowHours`]}
                  hint="0 = immediate verified release"
                  disabled={busy}
                />
                <Input
                  label="Dispute escalation (days)"
                  name={`m${index}-escalation-days`}
                  inputMode="numeric"
                  value={m.disputeEscalationDays}
                  onChange={(e) =>
                    updateMilestone(index, {
                      disputeEscalationDays: e.target.value,
                    })
                  }
                  error={fieldErrors[`m${index}.disputeEscalationDays`]}
                  hint="Max days before arbitrator escalation"
                  disabled={busy}
                />
              </div>

              {m.verificationMethod !== 'HUMAN_REVIEWED' ? (
                <Input
                  label="Expected Artifact SHA-256 Digest (optional)"
                  name={`m${index}-expected-sha256`}
                  value={m.expectedSha256}
                  onChange={(e) =>
                    updateMilestone(index, { expectedSha256: e.target.value })
                  }
                  hint="64-char hex digest if a specific pre-agreed artifact hash is required"
                  placeholder="e.g. e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
                  disabled={busy}
                />
              ) : null}

              {m.verificationMethod === 'AUTOMATED_CHECK' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Automated check runner"
                    name={`m${index}-auto-type`}
                    value={m.automatedCheckType}
                    disabled={busy}
                    options={[
                      {
                        value: 'JSON_ASSERTIONS',
                        label: 'JSON Schema / Key-Value Assertions',
                      },
                      {
                        value: 'TEXT_PATTERNS',
                        label: 'Source / Text Pattern Verification',
                      },
                      {
                        value: 'SANDBOX_JS_TEST',
                        label: 'Isolated Sandboxed JS Deliverable Test',
                      },
                    ]}
                    onChange={(e) =>
                      updateMilestone(index, {
                        automatedCheckType: e.target.value as AutomatedCheckType,
                      })
                    }
                  />
                  <Textarea
                    label="Check configuration (JSON)"
                    name={`m${index}-auto-config`}
                    value={m.automatedCheckConfigText}
                    onChange={(e) =>
                      updateMilestone(index, {
                        automatedCheckConfigText: e.target.value,
                      })
                    }
                    error={fieldErrors[`m${index}.automatedCheckConfigText`]}
                    rows={3}
                    placeholder={
                      m.automatedCheckType === 'SANDBOX_JS_TEST'
                        ? '{"assertions":[{"name":"fn(2,3)==5","fn":"add","args":[2,3],"expected":5}]}'
                        : m.automatedCheckType === 'TEXT_PATTERNS'
                          ? '{"mustContain":["export"],"mustNotContain":["TODO"]}'
                          : '{"requiredKeys":["version"],"rules":[{"path":"version","equals":"1.0.0"}]}'
                    }
                    disabled={busy}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <Textarea
        label="Additional Notes / Terms"
        name="notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        hint="Optional contractual notes or stipulations"
        disabled={busy}
        rows={2}
      />

      {formError ? (
        <Alert tone="danger" role="alert">
          {formError}
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={loading} disabled={disabled}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  )
}
