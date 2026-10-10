import { useState, type FormEvent } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import type { SubmissionInput } from '../../lib/api/submissions'

type SubmissionFormProps = {
  submitLabel?: string
  onSubmit: (input: SubmissionInput) => Promise<void>
  onCancel?: () => void
  disabled?: boolean
}

export function SubmissionForm({
  submitLabel = 'Submit deliverable',
  onSubmit,
  onCancel,
  disabled = false,
}: SubmissionFormProps) {
  const [notes, setNotes] = useState('')
  const [externalUrl, setExternalUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function validate(): SubmissionInput | null {
    const errors: Record<string, string> = {}
    const trimmedNotes = notes.trim()
    const trimmedUrl = externalUrl.trim()

    if (trimmedUrl) {
      try {
        const parsed = new URL(trimmedUrl)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          errors.externalUrl = 'URL must use http or https.'
        }
      } catch {
        errors.externalUrl = 'Enter a valid URL.'
      }
    }

    if (!file && !trimmedNotes && !trimmedUrl) {
      errors.payload = 'Provide a file, link, and/or notes.'
    }

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return null

    return {
      notes: trimmedNotes || null,
      externalUrl: trimmedUrl || null,
      file,
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
      setNotes('')
      setExternalUrl('')
      setFile(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Submission failed.')
    } finally {
      setLoading(false)
    }
  }

  const busy = loading || disabled

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Alert tone="info">
        If you upload a file, the server computes a SHA-256 hash from the bytes.
        A hash checks integrity only — not quality, authorship, or correctness.
        Do not send a client-side hash.
      </Alert>

      <Textarea
        label="Notes"
        name="notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={busy}
        rows={3}
        hint="Describe what you delivered"
      />
      <Input
        label="External link"
        name="externalUrl"
        type="url"
        value={externalUrl}
        onChange={(e) => setExternalUrl(e.target.value)}
        error={fieldErrors.externalUrl}
        disabled={busy}
        placeholder="https://"
      />
      <div>
        <label
          htmlFor="submission-file"
          className="block font-mono text-xs font-bold uppercase text-dark mb-1"
        >
          File (optional)
        </label>
        <input
          id="submission-file"
          name="file"
          type="file"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full font-mono text-xs text-dark/80 file:mr-3 file:border-2 file:border-dark file:bg-white file:px-3 file:py-2 file:font-mono file:text-xs file:font-bold file:uppercase"
        />
        {file ? (
          <p className="mt-1 font-mono text-[11px] text-dark/60">
            Selected: {file.name} ({file.size} bytes)
          </p>
        ) : null}
      </div>

      {fieldErrors.payload ? (
        <Alert tone="danger" role="alert">
          {fieldErrors.payload}
        </Alert>
      ) : null}

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
