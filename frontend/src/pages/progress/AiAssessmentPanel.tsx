import { useCallback, useEffect, useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import {
  createSubmissionAssessment,
  getLatestSubmissionAssessment,
  type AiAssessment,
  type AiAssessmentStatus,
  type DeliverableType,
} from '../../lib/api/ai'
import { ApiError, isApiConfigured } from '../../lib/api/client'
import type { BadgeTone } from '../../lib/milestoneStatus'

type AiAssessmentPanelProps = {
  token: string | null
  submissionId: string | null
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

function statusLabel(status: AiAssessmentStatus) {
  return status.replaceAll('_', ' ')
}

export function AiAssessmentPanel({
  token,
  submissionId,
  canRequest,
}: AiAssessmentPanelProps) {
  const [assessment, setAssessment] = useState<AiAssessment | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deliverableType, setDeliverableType] = useState<
    DeliverableType | ''
  >('')

  const load = useCallback(async () => {
    if (!token || !submissionId || !isApiConfigured()) {
      setAssessment(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await getLatestSubmissionAssessment(token, submissionId)
      setAssessment(res.assessment)
      setNotice(res.notice)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not load AI assessment.',
      )
    } finally {
      setLoading(false)
    }
  }, [token, submissionId])

  useEffect(() => {
    void load()
  }, [load])

  async function onAssess() {
    if (!token || !submissionId) return
    setBusy(true)
    setError(null)
    try {
      const res = await createSubmissionAssessment(token, submissionId, {
        ...(deliverableType ? { deliverableType } : {}),
      })
      setAssessment(res.assessment)
      setNotice(res.notice)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not run AI assessment.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!submissionId) {
    return (
      <div className="space-y-2">
        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
          AI assessment
        </p>
        <Alert tone="info">
          Submit a deliverable first. Assessments are advisory only and never
          approve milestones or authorize payments.
        </Alert>
      </div>
    )
  }

  const structured = assessment?.result?.assessment
  const failureStatuses: AiAssessmentStatus[] = [
    'MODEL_UNAVAILABLE',
    'INVALID_OUTPUT',
    'SKIPPED',
  ]
  const showFailure =
    assessment && failureStatuses.includes(assessment.status)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
          AI assessment
        </p>
        {assessment ? (
          <Badge tone={STATUS_TONE[assessment.status]} dot>
            {statusLabel(assessment.status)}
          </Badge>
        ) : null}
      </div>

      <Alert tone="info">
        Advisory only. Existing agreement rules and human review remain
        authoritative. AI cannot approve milestones, decide disputes, or
        authorize payments.
      </Alert>

      {loading ? <Spinner label="Loading assessment" size="sm" /> : null}

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {showFailure ? (
        <Alert tone="warning">
          {assessment.errorMessage ??
            'Model unavailable or output invalid. No fabricated success.'}
        </Alert>
      ) : null}

      {structured ? (
        <div className="space-y-2 border-t-2 border-dark/10 pt-3">
          {structured.summary ? (
            <p className="font-body text-sm text-dark/80">{structured.summary}</p>
          ) : null}
          {structured.criteria?.length ? (
            <ul className="space-y-1">
              {structured.criteria.map((c, i) => (
                <li
                  key={`${c.criterion}-${i}`}
                  className="font-mono text-[11px] text-dark/80"
                >
                  <span className="font-bold">{c.status}</span> · {c.criterion}
                  {c.notes ? (
                    <span className="text-dark/50"> — {c.notes}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {structured.outstandingWork?.length ? (
            <p className="font-mono text-[11px] text-dark/60">
              Outstanding: {structured.outstandingWork.join('; ')}
            </p>
          ) : null}
          {structured.uncertainty?.length ? (
            <p className="font-mono text-[11px] text-dark/60">
              Uncertainty: {structured.uncertainty.join('; ')}
            </p>
          ) : null}
          {assessment?.modelPrimary ? (
            <p className="font-mono text-[10px] text-dark/45">
              {assessment.provider}/{assessment.modelPrimary}
              {assessment.modelSecondary
                ? ` vs ${assessment.modelSecondary}`
                : ''}
              {typeof structured.confidence === 'number'
                ? ` · confidence ${structured.confidence.toFixed(2)}`
                : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      {canRequest ? (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
              Type (optional)
            </span>
            <select
              className="border-2 border-dark bg-white px-2 py-1.5 font-mono text-xs"
              value={deliverableType}
              onChange={(e) =>
                setDeliverableType(
                  (e.target.value || '') as DeliverableType | '',
                )
              }
              disabled={busy}
            >
              <option value="">Auto-detect</option>
              <option value="CODE">Code</option>
              <option value="TEXT">Text</option>
              <option value="VISUAL">Visual</option>
            </select>
          </label>
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            disabled={!token || !isApiConfigured()}
            onClick={() => void onAssess()}
          >
            {assessment ? 'Re-run assessment' : 'Run assessment'}
          </Button>
        </div>
      ) : null}

      {notice ? (
        <p className="font-mono text-[10px] text-dark/45">{notice}</p>
      ) : null}
    </div>
  )
}
