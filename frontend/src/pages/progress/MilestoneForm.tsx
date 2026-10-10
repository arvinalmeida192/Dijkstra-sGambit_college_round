import { useState, type FormEvent } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import type {
  Milestone,
  MilestoneInput,
} from '../../lib/api/milestones'

type MilestoneFormProps = {
  initial?: Milestone | null
  submitLabel: string
  onSubmit: (input: MilestoneInput) => Promise<void>
  onCancel?: () => void
  disabled?: boolean
}

function parseAmountMajor(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const cents = Math.round(Number(trimmed) * 100)
  if (!Number.isFinite(cents) || cents < 0) return null
  return cents
}

export function MilestoneForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  disabled = false,
}: MilestoneFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [deliverables, setDeliverables] = useState(initial?.deliverables ?? '')
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(
    initial?.acceptanceCriteria ?? '',
  )
  const [amountMajor, setAmountMajor] = useState(
    initial ? (initial.amount / 100).toFixed(2) : '',
  )
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '')
  const [reviewWindowDays, setReviewWindowDays] = useState(
    initial?.reviewWindowDays != null ? String(initial.reviewWindowDays) : '',
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function validate(): MilestoneInput | null {
    const errors: Record<string, string> = {}
    if (title.trim().length < 2) errors.title = 'Title is required (min 2).'
    if (!deliverables.trim()) errors.deliverables = 'Deliverables are required.'
    if (!acceptanceCriteria.trim()) {
      errors.acceptanceCriteria = 'Acceptance criteria are required.'
    }
    const amount = parseAmountMajor(amountMajor)
    if (amount == null) {
      errors.amount = 'Enter a valid amount (e.g. 250.00).'
    }
    if (dueDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) {
      errors.dueDate = 'Use YYYY-MM-DD.'
    }
    let review: number | null | undefined
    if (reviewWindowDays.trim()) {
      const n = Number(reviewWindowDays)
      if (!Number.isInteger(n) || n < 1) {
        errors.reviewWindowDays = 'Enter a positive integer.'
      } else {
        review = n
      }
    } else {
      review = null
    }

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0 || amount == null) return null

    return {
      title: title.trim(),
      deliverables: deliverables.trim(),
      acceptanceCriteria: acceptanceCriteria.trim(),
      amount,
      dueDate: dueDate.trim() || null,
      reviewWindowDays: review ?? null,
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const input = validate()
    if (!input) return

    setLoading(true)
    try {
      await onSubmit(input)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setLoading(false)
    }
  }

  const busy = loading || disabled

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Input
        label="Title"
        name="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={fieldErrors.title}
        disabled={busy}
      />
      <Textarea
        label="Deliverables"
        name="deliverables"
        value={deliverables}
        onChange={(e) => setDeliverables(e.target.value)}
        error={fieldErrors.deliverables}
        disabled={busy}
        rows={2}
      />
      <Textarea
        label="Acceptance criteria"
        name="acceptanceCriteria"
        value={acceptanceCriteria}
        onChange={(e) => setAcceptanceCriteria(e.target.value)}
        error={fieldErrors.acceptanceCriteria}
        disabled={busy}
        rows={2}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          label="Amount"
          name="amount"
          value={amountMajor}
          onChange={(e) => setAmountMajor(e.target.value)}
          error={fieldErrors.amount}
          hint="Major units (stored as integer ×100)"
          placeholder="250.00"
          disabled={busy}
        />
        <Input
          label="Due date"
          name="dueDate"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          error={fieldErrors.dueDate}
          disabled={busy}
        />
        <Input
          label="Review window (days)"
          name="reviewWindowDays"
          inputMode="numeric"
          value={reviewWindowDays}
          onChange={(e) => setReviewWindowDays(e.target.value)}
          error={fieldErrors.reviewWindowDays}
          disabled={busy}
        />
      </div>

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
