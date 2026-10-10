import { useCallback, useEffect, useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import {
  createDisputeAssessment,
  getLatestDisputeAssessment,
  type AiAssessment,
  type AiAssessmentStatus,
} from '../../lib/api/ai'
import { ApiError, isApiConfigured } from '../../lib/api/client'
import type { BadgeTone } from '../../lib/milestoneStatus'

type DisputeAiPanelProps = {
  token: string | null
  disputeId: string
  canRequest: boolean
}

const STATUS_TONE: Record<AiAssessmentStatus, BadgeTone> = {
  COMPLETED: 'success',
  NEEDS_HUMAN_REVIEW: 'warning',
  MODEL_DISAGREEMENT: 'warning',
  MODEL_UNAVAILABLE: 'danger',
  INVALID_OUTPUT: 'danger',
  SKIPPED: 'neutral',
}

export function DisputeAiPanel({
  token,
  disputeId,
  canRequest,
}: DisputeAiPanelProps) {
  const [assessment, setAssessment] = useState<AiAssessment | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token || !isApiConfigured()) return
    setLoading(true)
    setError(null)
    try {
      const res = await getLatestDisputeAssessment(token, disputeId)
      setAssessment(res.assessment)
      setNotice(res.notice)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not load dispute AI summary.',
      )
    } finally {
      setLoading(false)
    }
  }, [token, disputeId])

  useEffect(() => {
    void load()
  }, [load])

  async function onSummarize() {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      const res = await createDisputeAssessment(token, disputeId)
      setAssessment(res.assessment)
      setNotice(res.notice)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not run dispute summary.',
      )
    } finally {
      setBusy(false)
    }
  }

  const summary = assessment?.result?.summary
  const failed =
    assessment &&
    ['MODEL_UNAVAILABLE', 'INVALID_OUTPUT', 'SKIPPED'].includes(
      assessment.status,
    )

  return (
    <div className="space-y-3 border-t border-dark/10 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg text-dark">AI evidence summary</h3>
        {assessment ? (
          <Badge tone={STATUS_TONE[assessment.status]} dot>
            {assessment.status.replaceAll('_', ' ')}
          </Badge>
        ) : null}
      </div>

      <Alert tone="info">
        Advisory only. AI does not recommend a winner, decide the dispute, or
        move funds. Human reviewers remain authoritative.
      </Alert>

      {loading ? <Spinner label="Loading summary" size="sm" /> : null}
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      {failed ? (
        <Alert tone="warning">
          {assessment?.errorMessage ??
            'Model unavailable or invalid output. No fabricated summary.'}
        </Alert>
      ) : null}

      {summary ? (
        <div className="space-y-2">
          {summary.summary ? (
            <p className="font-body text-sm text-dark/80">{summary.summary}</p>
          ) : null}
          {summary.claims?.length ? (
            <ul className="space-y-1">
              {summary.claims.map((c, i) => (
                <li
                  key={`${c.claim}-${i}`}
                  className="font-mono text-[11px] text-dark/80"
                >
                  {c.party ? (
                    <span className="font-bold uppercase">{c.party}: </span>
                  ) : null}
                  {c.claim}
                </li>
              ))}
            </ul>
          ) : null}
          {summary.contradictions?.length ? (
            <p className="font-mono text-[11px] text-dark/60">
              Contradictions: {summary.contradictions.join('; ')}
            </p>
          ) : null}
          {summary.missingInformation?.length ? (
            <p className="font-mono text-[11px] text-dark/60">
              Missing: {summary.missingInformation.join('; ')}
            </p>
          ) : null}
          {assessment?.modelPrimary ? (
            <p className="font-mono text-[10px] text-dark/45">
              {assessment.provider}/{assessment.modelPrimary}
            </p>
          ) : null}
        </div>
      ) : null}

      {canRequest ? (
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          disabled={!token || !isApiConfigured()}
          onClick={() => void onSummarize()}
        >
          {assessment ? 'Re-run summary' : 'Summarize evidence'}
        </Button>
      ) : null}

      {notice ? (
        <p className="font-mono text-[10px] text-dark/45">{notice}</p>
      ) : null}
    </div>
  )
}
