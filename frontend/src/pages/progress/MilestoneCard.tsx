import { useState } from 'react'
import { Pencil, Trash2, Upload } from 'lucide-react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { MilestoneStatusBadge } from '../../components/ui/MilestoneStatusBadge'
import { Panel } from '../../components/ui/Panel'
import { formatAmountBaseUnits } from '../../lib/agreementStatus'
import type { Milestone } from '../../lib/api/milestones'
import type {
  ReviewDecision,
  Submission,
  SubmissionInput,
} from '../../lib/api/submissions'
import {
  filterActionsForActor,
  getMilestoneActionLabel,
  transitionRequiresNote,
  type MilestoneActorRole,
  type MilestoneStatus,
} from '../../lib/milestoneStatus'
import {
  canReviewSubmission,
  canSubmitDeliverable,
} from '../../lib/submissionStatus'
import { AiAssessmentPanel } from './AiAssessmentPanel'
import { ReviewPanel } from './ReviewPanel'
import { SubmissionForm } from './SubmissionForm'
import { SubmissionHistory } from './SubmissionHistory'

type MilestoneCardProps = {
  milestone: Milestone
  submissions: Submission[]
  actorRole: MilestoneActorRole | null
  isClient: boolean
  isFreelancer: boolean
  projectClosed: boolean
  busy: boolean
  token: string | null
  onTransition: (toStatus: MilestoneStatus) => void
  onEdit: () => void
  onDelete: () => void
  onSubmitDeliverable: (input: SubmissionInput) => Promise<void>
  onReview: (
    submissionId: string,
    decision: ReviewDecision,
    feedback?: string,
  ) => Promise<void>
  onDownload: (submission: Submission) => void
}

function formatDateTime(iso: string | null) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatDateOnly(value: string | null) {
  if (!value) return null
  try {
    const [y, m, d] = value.split('-').map(Number)
    if (!y || !m || !d) return value
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return value
  }
}

export function MilestoneCard({
  milestone,
  submissions,
  actorRole,
  isClient,
  isFreelancer,
  projectClosed,
  busy,
  token,
  onTransition,
  onEdit,
  onDelete,
  onSubmitDeliverable,
  onReview,
  onDownload,
}: MilestoneCardProps) {
  const [showSubmitForm, setShowSubmitForm] = useState(false)

  const latest =
    submissions.length > 0
      ? [...submissions].sort((a, b) => b.revision - a.revision)[0]
      : null

  const canSubmit =
    isFreelancer &&
    !projectClosed &&
    canSubmitDeliverable(milestone.status)

  const showReview =
    isClient &&
    !projectClosed &&
    latest &&
    canReviewSubmission(milestone.status)

  const rawActions = filterActionsForActor(
    milestone.status,
    milestone.allowedTransitions,
    actorRole,
  )

  // Prefer submission/review APIs over raw status buttons for the same outcomes.
  const actions = rawActions.filter((toStatus) => {
    if (canSubmit && toStatus === 'SUBMITTED') return false
    if (
      showReview &&
      (toStatus === 'IN_REVIEW' ||
        toStatus === 'APPROVED' ||
        toStatus === 'REVISION_REQUESTED')
    ) {
      return false
    }
    return true
  })

  const canManagePending =
    isClient && milestone.status === 'PENDING' && !milestone.agreementId
  const dueLabel = formatDateOnly(milestone.dueDate)
  const overdue =
    Boolean(milestone.dueDate) &&
    milestone.status !== 'APPROVED' &&
    milestone.dueDate! < new Date().toISOString().slice(0, 10)

  return (
    <Panel tone="surface" shadow="sm" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display font-bold text-lg uppercase tracking-tight">
              {milestone.title}
            </h3>
            <MilestoneStatusBadge status={milestone.status} />
          </div>
          <div className="flex flex-wrap gap-3 font-mono text-[11px] text-dark/60">
            <span className="font-bold text-dark">
              {formatAmountBaseUnits(milestone.amount)}{' '}
              <span className="font-normal text-dark/50">(÷100 units)</span>
            </span>
            {dueLabel ? (
              <span className={overdue ? 'text-status-danger font-bold' : ''}>
                Due {dueLabel}
                {overdue ? ' · overdue' : ''}
              </span>
            ) : null}
            {milestone.reviewWindowDays != null ? (
              <span>Review window {milestone.reviewWindowDays}d</span>
            ) : null}
            {submissions.length > 0 ? (
              <span>{submissions.length} revision(s)</span>
            ) : null}
          </div>
        </div>

        {canManagePending ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              leftIcon={<Pencil className="w-3.5 h-3.5" />}
              onClick={onEdit}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={onDelete}
            >
              Delete
            </Button>
          </div>
        ) : isClient && milestone.agreementId ? (
          <span className="font-mono text-[11px] text-dark/50 border border-dark/15 px-2 py-1">
            Governed by agreement
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {milestone.description &&
        milestone.description !== milestone.deliverables ? (
          <div className="sm:col-span-2">
            <Field label="Description" value={milestone.description} />
          </div>
        ) : null}
        <Field label="Deliverables" value={milestone.deliverables} />
        <Field
          label="Acceptance criteria"
          value={milestone.acceptanceCriteria}
        />
      </div>

      {(milestone.submittedAt ||
        milestone.reviewStartedAt ||
        milestone.reviewDueAt ||
        milestone.approvedAt ||
        milestone.statusNote) && (
        <div className="border-t-2 border-dark/10 pt-3 space-y-2">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
            Review state
          </p>
          <ul className="space-y-1 font-mono text-[11px] text-dark/70">
            {milestone.submittedAt ? (
              <li>Submitted {formatDateTime(milestone.submittedAt)}</li>
            ) : null}
            {milestone.reviewStartedAt ? (
              <li>Review started {formatDateTime(milestone.reviewStartedAt)}</li>
            ) : null}
            {milestone.reviewDueAt ? (
              <li>Review due {formatDateTime(milestone.reviewDueAt)}</li>
            ) : null}
            {milestone.approvedAt ? (
              <li>Approved {formatDateTime(milestone.approvedAt)}</li>
            ) : null}
          </ul>
          {milestone.statusNote ? (
            <Alert tone="warning">Latest note: {milestone.statusNote}</Alert>
          ) : null}
        </div>
      )}

      <div className="border-t-2 border-dark/10 pt-3 space-y-4">
        <SubmissionHistory
          submissions={submissions}
          busy={busy}
          onDownload={onDownload}
        />
        <AiAssessmentPanel
          token={token}
          submissionId={latest?.id ?? null}
          canRequest={(isClient || isFreelancer) && !projectClosed}
        />
      </div>

      {canSubmit ? (
        <div className="border-t-2 border-dark/10 pt-3 space-y-3">
          {!showSubmitForm ? (
            <Button
              size="sm"
              leftIcon={<Upload className="w-3.5 h-3.5" />}
              disabled={busy}
              onClick={() => setShowSubmitForm(true)}
            >
              Submit deliverable
            </Button>
          ) : (
            <div className="space-y-3">
              <h4 className="font-display font-bold text-sm uppercase tracking-tight">
                New submission
              </h4>
              <SubmissionForm
                disabled={busy}
                onCancel={() => setShowSubmitForm(false)}
                onSubmit={async (input) => {
                  await onSubmitDeliverable(input)
                  setShowSubmitForm(false)
                }}
              />
            </div>
          )}
        </div>
      ) : null}

      {showReview && latest ? (
        <ReviewPanel
          latest={latest}
          milestoneStatus={milestone.status}
          busy={busy}
          onReview={onReview}
        />
      ) : null}

      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1 border-t-2 border-dark/10">
          {actions.map((toStatus) => {
            const needsNote = transitionRequiresNote(toStatus)
            const variant =
              toStatus === 'APPROVED'
                ? 'primary'
                : toStatus === 'DISPUTED'
                  ? 'danger'
                  : 'secondary'
            return (
              <Button
                key={toStatus}
                size="sm"
                variant={variant}
                disabled={busy}
                onClick={() => onTransition(toStatus)}
              >
                {getMilestoneActionLabel(toStatus)}
                {needsNote ? '…' : ''}
              </Button>
            )
          })}
        </div>
      ) : milestone.status === 'APPROVED' ? (
        <p className="font-mono text-[11px] text-dark/50">
          Milestone approved. Payment release connects in a later phase.
        </p>
      ) : null}
    </Panel>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50 mb-1">
        {label}
      </p>
      <p className="font-body text-sm text-dark/80 whitespace-pre-wrap">
        {value}
      </p>
    </div>
  )
}
