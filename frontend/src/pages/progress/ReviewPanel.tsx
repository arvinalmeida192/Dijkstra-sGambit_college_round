import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Textarea } from '../../components/ui/Textarea'
import type { ReviewDecision, Submission } from '../../lib/api/submissions'
import type { MilestoneStatus } from '../../lib/milestoneStatus'

type ReviewPanelProps = {
  latest: Submission
  milestoneStatus: MilestoneStatus
  busy: boolean
  onReview: (
    submissionId: string,
    decision: ReviewDecision,
    feedback?: string,
  ) => Promise<void>
}

export function ReviewPanel({
  latest,
  milestoneStatus,
  busy,
  onReview,
}: ReviewPanelProps) {
  const [showRevisionForm, setShowRevisionForm] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [loadingDecision, setLoadingDecision] = useState<ReviewDecision | null>(
    null,
  )

  async function run(decision: ReviewDecision, note?: string) {
    setActionError(null)
    setLoadingDecision(decision)
    try {
      await onReview(latest.id, decision, note)
      setShowRevisionForm(false)
      setFeedback('')
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
    setFeedbackError(null)
    void run('REVISION_REQUESTED', trimmed)
  }

  const canStart = milestoneStatus === 'SUBMITTED'
  const loading = Boolean(loadingDecision) || busy

  return (
    <div className="space-y-3 border-t-2 border-dark/10 pt-3">
      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
        Review latest submission (rev {latest.revision})
      </p>
      <p className="font-mono text-[11px] text-dark/60">
        Server authorization still applies. Freelancers cannot approve their own
        work through this UI or the API.
      </p>

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
            disabled={loading}
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
