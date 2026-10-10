import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, Upload } from 'lucide-react'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { MilestoneStatusBadge } from '../../components/ui/MilestoneStatusBadge'
import { Modal } from '../../components/ui/Modal'
import { Panel } from '../../components/ui/Panel'
import { Textarea } from '../../components/ui/Textarea'
import { formatAmountBaseUnits } from '../../lib/agreementStatus'
import type { Milestone, MilestoneExtension } from '../../lib/api/milestones'
import { routes } from '../../lib/routes'
import type {
  ReviewDecision,
  Submission,
  SubmissionInput,
} from '../../lib/api/submissions'
import {
  filterActionsForActor,
  getEscalationLabel,
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
  extensions: MilestoneExtension[]
  actorRole: MilestoneActorRole | null
  isClient: boolean
  isFreelancer: boolean
  currentUserId: string | undefined
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
    unmetCriteria?: string[],
  ) => Promise<void>
  onDownload: (submission: Submission) => void
  onProposeExtension: (input: {
    newDueDate: string
    reason: string
  }) => Promise<void>
  onRespondExtension: (
    extensionId: string,
    decision: 'ACCEPT' | 'REJECT',
  ) => Promise<void>
  onCancelAndReclaim: (reason?: string) => Promise<void>
  onExecuteAutoRelease: () => Promise<void>
  onExecuteReclaim: () => Promise<void>
}

function formatDateTime(iso: string | null | undefined) {
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

function countdownLabel(iso: string | null | undefined) {
  if (!iso) return null
  const due = new Date(iso).getTime()
  if (Number.isNaN(due)) return null
  const ms = due - Date.now()
  if (ms <= 0) return 'Expired — auto-approval eligible'
  const hours = Math.ceil(ms / (1000 * 60 * 60))
  if (hours < 48) return `${hours}h remaining`
  const days = Math.ceil(hours / 24)
  return `${days}d remaining`
}

export function MilestoneCard({
  milestone,
  submissions,
  extensions,
  actorRole,
  isClient,
  isFreelancer,
  currentUserId,
  projectClosed,
  busy,
  token,
  onTransition,
  onEdit,
  onDelete,
  onSubmitDeliverable,
  onReview,
  onDownload,
  onProposeExtension,
  onRespondExtension,
  onCancelAndReclaim,
  onExecuteAutoRelease,
  onExecuteReclaim,
}: MilestoneCardProps) {
  const [showSubmitForm, setShowSubmitForm] = useState(false)
  const [showExtension, setShowExtension] = useState(false)
  const [extDate, setExtDate] = useState('')
  const [extReason, setExtReason] = useState('')
  const [extError, setExtError] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const latest =
    submissions.length > 0
      ? [...submissions].sort((a, b) => b.revision - a.revision)[0]
      : null

  const revisionRoundsUsed = submissions.reduce((count, sub) => {
    const reviews = sub.reviews ?? []
    return (
      count + reviews.filter((r) => r.decision === 'REVISION_REQUESTED').length
    )
  }, 0)

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
  const pendingExtension = extensions.find((e) => e.status === 'PROPOSED')
  const canProposeExtension =
    (isClient || isFreelancer) &&
    !projectClosed &&
    !['APPROVED', 'CANCELLED'].includes(milestone.status) &&
    !pendingExtension

  const canCancelReclaim =
    isClient &&
    !projectClosed &&
    (milestone.status === 'OVERDUE' ||
      milestone.escalationStatus === 'ACTION_ELIGIBLE') &&
    milestone.status !== 'DISPUTED' &&
    submissions.length === 0

  const reviewCountdown = countdownLabel(milestone.reviewDueAt)
  const protectionNotice =
    milestone.status === 'OVERDUE'
      ? 'Deadline and grace period expired with no submission. Client may cancel and reclaim unreleased funds unless a dispute is open.'
      : milestone.escalationStatus === 'AUTO_APPROVED'
        ? 'Review window expired without client action. Milestone was auto-approved; funds may be released on-chain.'
        : milestone.status === 'DISPUTED'
          ? 'An open dispute freezes release, auto-release, and cancellation until resolved.'
          : null

  return (
    <Panel tone="surface" shadow="sm" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display font-bold text-lg uppercase tracking-tight">
              {milestone.title}
            </h3>
            <MilestoneStatusBadge status={milestone.status} />
            {milestone.escalationStatus &&
            milestone.escalationStatus !== 'NONE' ? (
              <Badge tone="warning" dot>
                {getEscalationLabel(milestone.escalationStatus)}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3 font-mono text-[11px] text-dark/60">
            <span className="font-bold text-dark">
              {formatAmountBaseUnits(milestone.amount)}{' '}
              <span className="font-normal text-dark/50">(÷100 units)</span>
            </span>
            {dueLabel ? (
              <span
                className={
                  milestone.status === 'OVERDUE'
                    ? 'text-status-danger font-bold'
                    : ''
                }
              >
                Due {dueLabel}
                {milestone.status === 'OVERDUE' ? ' · overdue' : ''}
              </span>
            ) : null}
            <span>Review {milestone.reviewWindowDays ?? 7}d</span>
            <span>Grace {milestone.gracePeriodDays ?? 3}d</span>
            <span>Max revisions {milestone.maxRevisions ?? 3}</span>
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

      <div className="border-2 border-dark/10 bg-white/60 px-3 py-2 space-y-1">
        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
          Next action / Owner / Due
        </p>
        <p className="font-body text-sm text-dark">
          {milestone.nextAction ?? '—'} ·{' '}
          <span className="font-mono text-xs">
            {milestone.actionOwner ?? '—'}
          </span>
          {milestone.actionDueAt
            ? ` · ${formatDateTime(milestone.actionDueAt)}`
            : ''}
        </p>
        {reviewCountdown &&
        (milestone.status === 'SUBMITTED' ||
          milestone.status === 'IN_REVIEW') ? (
          <p className="font-mono text-[11px] text-dark/70">
            Review countdown: {reviewCountdown}
          </p>
        ) : null}
      </div>

      {protectionNotice ? <Alert tone="warning">{protectionNotice}</Alert> : null}

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

      {milestone.status === 'DISPUTED' ? (
        <Alert tone="danger">
          This milestone is currently disputed. Work and submissions are paused until the dispute is resolved.{' '}
          <Link
            to={routes.disputes(milestone.projectId)}
            className="font-bold underline text-dark hover:text-accent ml-1"
          >
            View Dispute &amp; Resolution →
          </Link>
        </Alert>
      ) : null}

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
          acceptanceCriteria={milestone.acceptanceCriteria}
          maxRevisions={milestone.maxRevisions ?? 3}
          revisionRoundsUsed={revisionRoundsUsed}
          busy={busy}
          onReview={onReview}
        />
      ) : null}

      {pendingExtension ? (
        <div className="border-t-2 border-dark/10 pt-3 space-y-2">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-dark/50">
            Pending extension
          </p>
          <p className="font-body text-sm">
            Propose new due date {formatDateOnly(pendingExtension.newDueDate)}:{' '}
            {pendingExtension.reason}
          </p>
          {currentUserId &&
          pendingExtension.proposedBy !== currentUserId &&
          (isClient || isFreelancer) ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void onRespondExtension(pendingExtension.id, 'ACCEPT')
                }
              >
                Accept extension
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void onRespondExtension(pendingExtension.id, 'REJECT')
                }
              >
                Reject
              </Button>
            </div>
          ) : (
            <p className="font-mono text-[11px] text-dark/50">
              Waiting for the other party to accept or reject.
            </p>
          )}
        </div>
      ) : milestone.status === 'APPROVED' ? (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t-2 border-dark/10">
          <p className="font-mono text-[11px] text-dark/70">
            Milestone approved. Funds can be released to the freelancer.
          </p>
          <Link to={routes.fund(milestone.projectId)}>
            <Button size="sm" variant="primary">
              View Escrow / Release Funds →
            </Button>
          </Link>
        </div>
      ) : null}

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
        {canProposeExtension ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => setShowExtension(true)}
          >
            Propose extension…
          </Button>
        ) : null}
        {canCancelReclaim ? (
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            onClick={() => setShowCancelConfirm(true)}
          >
            Cancel & reclaim…
          </Button>
        ) : null}
        {milestone.escalationStatus === 'AUTO_APPROVED' &&
        milestone.status === 'APPROVED' ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void onExecuteAutoRelease()}
          >
            Execute auto-release (local)
          </Button>
        ) : null}
        {isClient && milestone.status === 'CANCELLED' ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void onExecuteReclaim()}
          >
            Execute reclaim (local)
          </Button>
        ) : null}
      </div>

      {milestone.status === 'APPROVED' &&
      milestone.escalationStatus !== 'AUTO_APPROVED' ? (
        <p className="font-mono text-[11px] text-dark/50">
          Milestone approved. Release payment via the payments / escrow flow
          (local/test chain only).
        </p>
      ) : milestone.status === 'CANCELLED' ? (
        <p className="font-mono text-[11px] text-dark/50">
          Milestone cancelled. Work ended via dispute resolution.
        </p>
      ) : null}

      <Modal
        open={showExtension}
        onClose={() => setShowExtension(false)}
        title="Propose deadline extension"
      >
        <div className="space-y-3">
          <Input
            label="New due date"
            type="date"
            value={extDate}
            onChange={(e) => setExtDate(e.target.value)}
          />
          <Textarea
            label="Reason"
            value={extReason}
            onChange={(e) => setExtReason(e.target.value)}
            rows={3}
          />
          {extError ? <Alert tone="danger">{extError}</Alert> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(extDate)) {
                  setExtError('Use YYYY-MM-DD.')
                  return
                }
                if (!extReason.trim()) {
                  setExtError('Reason is required.')
                  return
                }
                setExtError(null)
                await onProposeExtension({
                  newDueDate: extDate,
                  reason: extReason.trim(),
                })
                setShowExtension(false)
                setExtDate('')
                setExtReason('')
              }}
            >
              Submit proposal
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowExtension(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        title="Cancel milestone and reclaim funds?"
      >
        <div className="space-y-3">
          <Alert tone="warning">
            This cancels only this undelivered milestone after deadline + grace.
            Blocked if a dispute is open. On-chain reclaim still requires a local
            chain transaction.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={async () => {
                await onCancelAndReclaim()
                setShowCancelConfirm(false)
              }}
            >
              Confirm cancel & reclaim
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowCancelConfirm(false)}
            >
              Keep milestone
            </Button>
          </div>
        </div>
      </Modal>
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
