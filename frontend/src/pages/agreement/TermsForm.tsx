import { useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import type { AgreementTermsInput } from '../../lib/api/agreements'

type MilestoneDraft = {
  title: string
  deliverables: string
  acceptanceCriteria: string
  /** Major currency units as a string, e.g. "250.00" → stored as cents. */
  amountMajor: string
  dueDate: string
  reviewWindowDays: string
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
    deliverables: '',
    acceptanceCriteria: '',
    amountMajor: '',
    dueDate: '',
    reviewWindowDays: '',
  }
}

function fromTerms(terms?: AgreementTermsInput): {
  summary: string
  notes: string
  milestones: MilestoneDraft[]
} {
  if (!terms) {
    return { summary: '', notes: '', milestones: [emptyMilestone()] }
  }
  return {
    summary: terms.summary,
    notes: terms.notes ?? '',
    milestones: terms.milestones.map((m) => ({
      title: m.title,
      deliverables: m.deliverables,
      acceptanceCriteria: m.acceptanceCriteria,
      amountMajor: (m.amount / 100).toFixed(2),
      dueDate: m.dueDate ?? '',
      reviewWindowDays:
        m.reviewWindowDays != null ? String(m.reviewWindowDays) : '',
    })),
  }
}

function parseAmountMajor(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const cents = Math.round(Number(trimmed) * 100)
  if (!Number.isFinite(cents) || cents < 0) return null
  return cents
}

export function TermsForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  disabled = false,
}: TermsFormProps) {
  const seed = fromTerms(initial)
  const [summary, setSummary] = useState(seed.summary)
  const [notes, setNotes] = useState(seed.notes)
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(seed.milestones)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function updateMilestone(index: number, patch: Partial<MilestoneDraft>) {
    setMilestones((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    )
  }

  function validate(): {
    errors: Record<string, string>
    terms?: AgreementTermsInput
  } {
    const errors: Record<string, string> = {}
    if (!summary.trim()) errors.summary = 'Summary is required.'

    const parsedMilestones: AgreementTermsInput['milestones'] = []
    milestones.forEach((m, index) => {
      const prefix = `m${index}`
      if (!m.title.trim()) errors[`${prefix}.title`] = 'Title is required.'
      if (!m.deliverables.trim()) {
        errors[`${prefix}.deliverables`] = 'Deliverables are required.'
      }
      if (!m.acceptanceCriteria.trim()) {
        errors[`${prefix}.acceptanceCriteria`] =
          'Acceptance criteria are required.'
      }
      const amount = parseAmountMajor(m.amountMajor)
      if (amount == null) {
        errors[`${prefix}.amount`] = 'Enter a valid amount (e.g. 250.00).'
      }
      if (m.dueDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(m.dueDate.trim())) {
        errors[`${prefix}.dueDate`] = 'Use YYYY-MM-DD.'
      }
      let reviewWindowDays: number | undefined
      if (m.reviewWindowDays.trim()) {
        const n = Number(m.reviewWindowDays)
        if (!Number.isInteger(n) || n < 1) {
          errors[`${prefix}.reviewWindowDays`] = 'Enter a positive integer.'
        } else {
          reviewWindowDays = n
        }
      }

      if (
        !errors[`${prefix}.title`] &&
        !errors[`${prefix}.deliverables`] &&
        !errors[`${prefix}.acceptanceCriteria`] &&
        !errors[`${prefix}.amount`] &&
        !errors[`${prefix}.dueDate`] &&
        !errors[`${prefix}.reviewWindowDays`]
      ) {
        parsedMilestones.push({
          title: m.title.trim(),
          deliverables: m.deliverables.trim(),
          acceptanceCriteria: m.acceptanceCriteria.trim(),
          amount: amount!,
          dueDate: m.dueDate.trim() || undefined,
          reviewWindowDays,
        })
      }
    })

    if (milestones.length === 0) {
      errors.milestones = 'Add at least one milestone.'
    }

    if (Object.keys(errors).length > 0) return { errors }

    return {
      errors,
      terms: {
        summary: summary.trim(),
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
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <Textarea
        label="Summary"
        name="summary"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        error={fieldErrors.summary}
        disabled={busy}
        rows={3}
        placeholder="What both parties are agreeing to…"
      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-xs font-bold uppercase tracking-wider">
            Milestones
          </p>
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
              <span className="font-mono text-[11px] font-bold uppercase text-dark/50">
                Milestone {index + 1}
              </span>
              {milestones.length > 1 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={() =>
                    setMilestones((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </Button>
              ) : null}
            </div>
            <Input
              label="Title"
              name={`m${index}-title`}
              value={m.title}
              onChange={(e) => updateMilestone(index, { title: e.target.value })}
              error={fieldErrors[`m${index}.title`]}
              disabled={busy}
            />
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
            />
            <Textarea
              label="Acceptance criteria"
              name={`m${index}-criteria`}
              value={m.acceptanceCriteria}
              onChange={(e) =>
                updateMilestone(index, { acceptanceCriteria: e.target.value })
              }
              error={fieldErrors[`m${index}.acceptanceCriteria`]}
              disabled={busy}
              rows={2}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Amount"
                name={`m${index}-amount`}
                value={m.amountMajor}
                onChange={(e) =>
                  updateMilestone(index, { amountMajor: e.target.value })
                }
                error={fieldErrors[`m${index}.amount`]}
                hint="Major units (stored as integer ×100)"
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
          </div>
        ))}
      </div>

      <Textarea
        label="Notes"
        name="notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        hint="Optional"
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
