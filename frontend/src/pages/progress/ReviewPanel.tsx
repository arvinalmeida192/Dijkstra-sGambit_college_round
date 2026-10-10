import { useMemo, useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Textarea'
import type { ReviewDecision, Submission } from '../../lib/api/submissions'
import {
  parseAcceptanceCriteriaLines,
  type MilestoneStatus,
} from '../../lib/milestoneStatus'

type ReviewPanelProps = {
  latest: Submission
  milestoneStatus: MilestoneStatus
  acceptanceCriteria: string
  maxRevisions: number
  revisionRoundsUsed: number
  busy: boolean
  onReview: (
    submissionId: string,
    decision: ReviewDecision,
    feedback?: string,
    unmetCriteria?: string[],
  ) => Promise<void>
}

export function ReviewPanel({
  latest,
  milestoneStatus,
  acceptanceCriteria,
  maxRevisions,
  revisionRoundsUsed,
  busy,
  onReview,
}: ReviewPanelProps) {
  const [showRevisionForm, setShowRevisionForm] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [selectedCriteria, setSelectedCriteria] = useState<string[]>([])
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [loadingDecision, setLoadingDecision] = useState<ReviewDecision | null>(
    null,
  )

  const criteria = useMemo(
    () => parseAcceptanceCriteriaLines(acceptanceCriteria),
    [acceptanceCriteria],
  )

  const atRevisionLimit = revisionRoundsUsed >= maxRevisions

  async function run(
    decision: ReviewDecision,
    note?: string,
    unmet?: string[],
  ) {
    setActionError(null)
    setLoadingDecision(decision)
    try {
      await onReview(latest.id, decision, note, unmet)
      setShowRevisionForm(false)
      setFeedback('')
      setSelectedCriteria([])
      setFeedbackError(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Review failed.')
    } finally {
      setLoadingDecision(null)
    }
  }

  function confirmRevision() {
    const trimmed = feedback.trim()
    if (!trimmed) {
      setFeedbackError('Feedback is required when requesting a revision.')
      return
    }
    if (selectedCriteria.length === 0) {
      setFeedbackError('Select at least one unmet acceptance criterion.')
      return
    }
    setFeedbackError(null)
    void run('REVISION_REQUESTED', trimmed, selectedCriteria)
  }

  function toggleCriterion(item: string) {
    setSelectedCriteria((prev) =>
      prev.includes(item) ? prev.filter((c) => c !== item) : [...prev, item],
    )
  }

  const canStart = milestoneStatus === 'SUBMITTED'
  const loading = Boolean(loadingDecision) || busy

  return (
    <div className="space-y-3 border-t-2 border-dark/10 pt-3">
      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
        Review latest submission (rev {latest.revision})
      </p>
      <p className="font-mono text-[11px] text-dark/60">
        Revision rounds used: {revisionRoundsUsed}/{maxRevisions}. At the limit,
        only Approve or Open dispute remain.
      </p>

      {atRevisionLimit ? (
        <Alert tone="warning">
          Maximum revision rounds reached. Request revision is blocked —
          Approve or open a dispute.
        </Alert>
      ) : null}

      {actionError ? (
        <Alert tone="danger" role="alert">
          {actionError}
        </Alert>
      ) : null}

      {!showRevisionForm ? (
        <div className="flex flex-wrap gap-2">
          {canStart ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={loading}
              loading={loadingDecision === 'START_REVIEW'}
              onClick={() => void run('START_REVIEW')}
            >
              Start review
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="primary"
            disabled={loading}
            loading={loadingDecision === 'APPROVED'}
            onClick={() => void run('APPROVED')}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={loading || atRevisionLimit}
            onClick={() => {
              setShowRevisionForm(true)
              setActionError(null)
            }}
          >
            Request revision…
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
              Unmet acceptance criteria
            </legend>
            {criteria.map((item) => (
              <label
                key={item}
                className="flex items-start gap-2 font-body text-sm text-dark/80"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedCriteria.includes(item)}
                  disabled={loading}
                  onChange={() => toggleCriterion(item)}
                />
                <span>{item}</span>
              </label>
            ))}
          </fieldset>
          <Textarea
            label="Revision feedback"
            name="revisionFeedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            error={feedbackError ?? undefined}
            disabled={loading}
            rows={3}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={loadingDecision === 'REVISION_REQUESTED'}
              disabled={loading && loadingDecision !== 'REVISION_REQUESTED'}
              onClick={confirmRevision}
            >
              Send revision request
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={() => {
                setShowRevisionForm(false)
                setFeedback('')
                setSelectedCriteria([])
                setFeedbackError(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
