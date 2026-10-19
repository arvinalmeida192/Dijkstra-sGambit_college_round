import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { LoadingBlock } from '../components/ui/Spinner'
import { Modal } from '../components/ui/Modal'
import { PageContainer } from '../components/ui/PageContainer'
import { Panel } from '../components/ui/Panel'
import { SectionHeader } from '../components/ui/SectionHeader'
import { Textarea } from '../components/ui/Textarea'
import { ApiError, isApiConfigured } from '../lib/api/client'
import {
  cancelAndReclaimMilestone,
  createMilestone,
  deleteMilestone,
  executeAutoRelease,
  executeReclaim,
  listExtensions,
  listMilestones,
  listProjectAuditLogs,
  proposeExtension,
  respondExtension,
  updateMilestone,
  updateMilestoneStatus,
  type AuditLog,
  type Milestone,
  type MilestoneExtension,
  type MilestoneInput,
} from '../lib/api/milestones'
import {
  ACTIVITY_PAGE_SIZE,
  ActivityTimeline,
} from '../components/activity/ActivityTimeline'
import { listAgreements } from '../lib/api/agreements'
import { getProject, type Project } from '../lib/api/projects'
import {
  createSubmission,
  downloadSubmissionFile,
  listSubmissions,
  reviewSubmission,
  type ReviewDecision,
  type Submission,
  type SubmissionInput,
} from '../lib/api/submissions'
import { openDispute } from '../lib/api/disputes'
import { executeVerifiedRelease } from '../lib/api/verification'
import {
  getMilestoneActionLabel,
  transitionRequiresNote,
  type MilestoneActorRole,
  type MilestoneStatus,
} from '../lib/milestoneStatus'
import { routes } from '../lib/routes'
import { MilestoneCard } from './progress/MilestoneCard'
import { MilestoneForm } from './progress/MilestoneForm'

function resolveActorRole(
  userId: string | undefined,
  userRole: string | undefined,
  project: Project | null,
): MilestoneActorRole | null {
  if (!userId || !project) return null
  if (userId === project.clientId) return 'CLIENT'
  if (project.freelancerId && userId === project.freelancerId) {
    return 'FREELANCER'
  }
  if (userRole === 'ARBITRATOR') return 'ARBITRATOR'
  return null
}

export function ProgressPage() {
  const { projectId = '' } = useParams()
  const { token, user } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [submissionsByMilestone, setSubmissionsByMilestone] = useState<
    Record<string, Submission[]>
  >({})
  const [extensionsByMilestone, setExtensionsByMilestone] = useState<
    Record<string, MilestoneExtension[]>
  >({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activity, setActivity] = useState<AuditLog[]>([])
  const [activityTotal, setActivityTotal] = useState(0)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityLoadingMore, setActivityLoadingMore] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Milestone | null>(null)

  const [pendingTransition, setPendingTransition] = useState<{
    milestone: Milestone
    toStatus: MilestoneStatus
  } | null>(null)
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [transitionLoading, setTransitionLoading] = useState(false)
  const [hasAgreement, setHasAgreement] = useState(false)

  const load = useCallback(async () => {
    if (!token || !projectId || !isApiConfigured()) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [projectResult, milestonesResult, agreementsResult] =
        await Promise.all([
          getProject(token, projectId),
          listMilestones(token, projectId),
          listAgreements(token, projectId).catch(() => null),
        ])
      const list = milestonesResult.milestones
      setProject(projectResult.project)
      setMilestones(list)
      setHasAgreement(
        Boolean(
          agreementsResult?.activeAgreementId ||
            agreementsResult?.proposedAgreementId ||
            (agreementsResult?.agreements &&
              agreementsResult.agreements.length > 0),
        ),
      )

      const submissionResults = await Promise.all(
        list.map(async (milestone) => {
          try {
            const result = await listSubmissions(token, milestone.id)
            return [milestone.id, result.submissions] as const
          } catch {
            return [milestone.id, [] as Submission[]] as const
          }
        }),
      )
      setSubmissionsByMilestone(Object.fromEntries(submissionResults))

      const extensionResults = await Promise.all(
        list.map(async (milestone) => {
          try {
            const result = await listExtensions(token, milestone.id)
            return [milestone.id, result.extensions] as const
          } catch {
            return [milestone.id, [] as MilestoneExtension[]] as const
          }
        }),
      )
      setExtensionsByMilestone(Object.fromEntries(extensionResults))

      setActivityLoading(true)
      setActivityError(null)
      try {
        const activityResult = await listProjectAuditLogs(token, projectId, {
          limit: ACTIVITY_PAGE_SIZE,
          offset: 0,
        })
        setActivity(activityResult.auditLogs)
        setActivityTotal(activityResult.pagination?.total ?? activityResult.auditLogs.length)
      } catch (activityErr) {
        setActivity([])
        setActivityTotal(0)
        setActivityError(
          activityErr instanceof ApiError
            ? activityErr.message
            : 'Could not load project activity.',
        )
      } finally {
        setActivityLoading(false)
      }
    } catch (err) {
      setProject(null)
      setMilestones([])
      setSubmissionsByMilestone({})
      setActivity([])
      setActivityTotal(0)
      setExtensionsByMilestone({})
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not load milestone progress.',
      )
    } finally {
      setLoading(false)
    }
  }, [token, projectId])

  useEffect(() => {
    void load()
  }, [load])

  const loadMoreActivity = useCallback(async () => {
    if (!token || !projectId || activityLoadingMore) return
    if (activity.length >= activityTotal) return
    setActivityLoadingMore(true)
    setActivityError(null)
    try {
      const result = await listProjectAuditLogs(token, projectId, {
        limit: ACTIVITY_PAGE_SIZE,
        offset: activity.length,
      })
      setActivity((prev) => {
        const seen = new Set(prev.map((item) => item.id))
        const next = result.auditLogs.filter((item) => !seen.has(item.id))
        return [...prev, ...next]
      })
      setActivityTotal(result.pagination?.total ?? activityTotal)
    } catch (err) {
      setActivityError(
        err instanceof ApiError
          ? err.message
          : 'Could not load more activity.',
      )
    } finally {
      setActivityLoadingMore(false)
    }
  }, [
    token,
    projectId,
    activity.length,
    activityTotal,
    activityLoadingMore,
  ])

  const actorRole = resolveActorRole(user?.id, user?.role, project)
  const isClient = actorRole === 'CLIENT'
  const isFreelancer = actorRole === 'FREELANCER'
  const projectClosed =
    project?.status === 'CANCELLED' || project?.status === 'COMPLETED'
  const canCreate = isClient && !projectClosed && !hasAgreement

  async function onCreate(input: MilestoneInput) {
    if (!token || !projectId) return
    setActionError(null)
    setActionSuccess(null)
    await createMilestone(token, projectId, input)
    setShowCreate(false)
    setActionSuccess('Milestone created.')
    await load()
  }

  async function onUpdate(input: MilestoneInput) {
    if (!token || !editing) return
    setActionError(null)
    setActionSuccess(null)
    await updateMilestone(token, editing.id, input)
    setEditing(null)
    setActionSuccess('Milestone updated.')
    await load()
  }

  async function onDelete(milestone: Milestone) {
    if (!token) return
    const ok = window.confirm(
      `Delete milestone “${milestone.title}”? Only PENDING milestones can be deleted.`,
    )
    if (!ok) return

    setActionError(null)
    setActionSuccess(null)
    setBusyId(milestone.id)
    try {
      await deleteMilestone(token, milestone.id)
      setActionSuccess('Milestone deleted.')
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not delete milestone.',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function onSubmitDeliverable(
    milestone: Milestone,
    input: SubmissionInput,
  ) {
    if (!token) return
    setActionError(null)
    setActionSuccess(null)
    setBusyId(milestone.id)
    try {
      const result = await createSubmission(token, milestone.id, input)
      setActionSuccess(
        `Revision ${result.submission.revision} submitted` +
          (result.submission.sha256Hash
            ? ` · SHA-256 ${result.submission.sha256Hash.slice(0, 12)}…`
            : ''),
      )
      await load()
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not submit deliverable.'
      setActionError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setBusyId(null)
    }
  }

  async function onReview(
    milestone: Milestone,
    submissionId: string,
    decision: ReviewDecision,
    feedback?: string,
    unmetCriteria?: string[],
  ) {
    if (!token) return
    setActionError(null)
    setActionSuccess(null)
    setBusyId(milestone.id)
    try {
      const result = await reviewSubmission(token, submissionId, {
        decision,
        feedback,
        unmetCriteria,
      })
      setActionSuccess(
        `${milestone.title}: ${decision.replace(/_/g, ' ').toLowerCase()} · now ${result.milestone.status}.`,
      )
      await load()
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not record review.'
      setActionError(message)
      throw err instanceof Error ? err : new Error(message)
    } finally {
      setBusyId(null)
    }
  }

  async function onProposeExtension(
    milestone: Milestone,
    input: { newDueDate: string; reason: string },
  ) {
    if (!token) return
    setBusyId(milestone.id)
    setActionError(null)
    try {
      await proposeExtension(token, milestone.id, input)
      setActionSuccess('Extension proposal submitted. Takes effect only when accepted.')
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not propose extension.',
      )
      throw err
    } finally {
      setBusyId(null)
    }
  }

  async function onRespondExtension(
    milestone: Milestone,
    extensionId: string,
    decision: 'ACCEPT' | 'REJECT',
  ) {
    if (!token) return
    setBusyId(milestone.id)
    setActionError(null)
    try {
      await respondExtension(token, milestone.id, extensionId, { decision })
      setActionSuccess(
        decision === 'ACCEPT'
          ? 'Extension accepted. Due date updated.'
          : 'Extension rejected.',
      )
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not respond to extension.',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function onCancelAndReclaim(milestone: Milestone) {
    if (!token) return
    setBusyId(milestone.id)
    setActionError(null)
    try {
      const result = await cancelAndReclaimMilestone(token, milestone.id, {})
      setActionSuccess(result.notice)
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not cancel milestone.',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function onExecuteAutoRelease(milestone: Milestone) {
    if (!token) return
    setBusyId(milestone.id)
    setActionError(null)
    try {
      const result = await executeAutoRelease(token, milestone.id)
      setActionSuccess(
        result.submitted
          ? `Auto-release submitted: ${result.txHash}`
          : result.notice || result.reason || 'Auto-release not submitted.',
      )
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not execute auto-release.',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function onExecuteVerifiedRelease(milestone: Milestone) {
    if (!token) return
    setBusyId(milestone.id)
    setActionError(null)
    setActionSuccess(null)
    try {
      const result = await executeVerifiedRelease(token, milestone.id)
      setActionSuccess(
        result.txHash
          ? `Verified smart-contract release confirmed: ${result.txHash}`
          : result.notice || 'Verified release processed.',
      )
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'Could not execute verified release.',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function onExecuteReclaim(milestone: Milestone) {
    if (!token) return
    setBusyId(milestone.id)
    setActionError(null)
    try {
      const result = await executeReclaim(token, milestone.id)
      setActionSuccess(
        result.submitted
          ? `Reclaim submitted: ${result.txHash}`
          : result.notice || result.reason || 'Reclaim not submitted.',
      )
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not execute reclaim.',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function onDownload(milestoneId: string, submission: Submission) {
    if (!token) return
    setActionError(null)
    setBusyId(milestoneId)
    try {
      await downloadSubmissionFile(token, submission)
      setActionSuccess(
        `Downloaded ${submission.originalFilename ?? 'deliverable'}.`,
      )
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'Could not download private file.',
      )
    } finally {
      setBusyId(null)
    }
  }

  function requestTransition(milestone: Milestone, toStatus: MilestoneStatus) {
    setActionError(null)
    setActionSuccess(null)
    setNote('')
    setNoteError(null)
    if (transitionRequiresNote(toStatus)) {
      setPendingTransition({ milestone, toStatus })
      return
    }
    void runTransition(milestone, toStatus)
  }

  async function runTransition(
    milestone: Milestone,
    toStatus: MilestoneStatus,
    statusNote?: string,
  ) {
    if (!token) return
    setBusyId(milestone.id)
    setTransitionLoading(true)
    setActionError(null)
    try {
      if (toStatus === 'DISPUTED') {
        const result = await openDispute(token, milestone.id, {
          reason: statusNote?.trim() || 'Dispute opened from progress',
        })
        setPendingTransition(null)
        setNote('')
        setActionSuccess(
          `${milestone.title}: dispute opened. ${result.notice}`,
        )
      } else {
        await updateMilestoneStatus(token, milestone.id, {
          status: toStatus,
          ...(statusNote ? { note: statusNote } : {}),
        })
        setPendingTransition(null)
        setNote('')
        setActionSuccess(
          `${milestone.title}: ${getMilestoneActionLabel(toStatus)}.`,
        )
      }
      await load()
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'Could not update milestone status.',
      )
    } finally {
      setBusyId(null)
      setTransitionLoading(false)
    }
  }

  function confirmNoteTransition() {
    if (!pendingTransition) return
    const trimmed = note.trim()
    if (!trimmed) {
      setNoteError('A note is required for this action.')
      return
    }
    setNoteError(null)
    void runTransition(
      pendingTransition.milestone,
      pendingTransition.toStatus,
      trimmed,
    )
  }

  return (
    <PageContainer variant="app" className="space-y-6">
      <SectionHeader
        eyebrow="// Progress"
        title={project ? `Progress — ${project.title}` : 'Progress'}
        meta={
          <Link
            to={projectId ? routes.project(projectId) : routes.projects}
            className="font-mono text-xs font-bold uppercase tracking-wider text-accent hover:underline"
          >
            ← Project
          </Link>
        }
      />

      <Alert tone="info">
        Freelancers submit files, links, and notes; the server stores private
        files and hashes uploads. Clients review the latest revision (approve /
        request revision). A SHA-256 hash checks integrity only — not quality or
        authorship. The server rejects unauthorized actions even if a control is
        shown.
      </Alert>

      {!isApiConfigured() ? (
        <Alert tone="warning">
          Set <code className="font-bold">VITE_API_BASE_URL</code> to load
          milestones and submissions.
        </Alert>
      ) : null}

      {loading ? <LoadingBlock label="Loading milestones" /> : null}

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {actionError ? (
        <Alert tone="danger" role="alert">
          {actionError}
        </Alert>
      ) : null}

      {actionSuccess ? (
        <Alert tone="success" role="status">
          {actionSuccess}
        </Alert>
      ) : null}

      {!loading && project && !error ? (
        <>
          {projectClosed ? (
            <Alert tone="warning">
              This project is {project.status.toLowerCase()}. Milestone creation
              and most workflow actions are blocked.
            </Alert>
          ) : null}

          {hasAgreement && projectId ? (
            <Alert tone="info">
              Milestones for this project are governed by the project agreement.
              To add or adjust milestone schedules, visit the{' '}
              <Link
                to={routes.agreement(projectId)}
                className="font-bold underline text-dark hover:text-accent"
              >
                Agreements page
              </Link>
              .
            </Alert>
          ) : null}

          {canCreate ? (
            <div className="flex flex-wrap gap-3">
              <Button
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => {
                  setShowCreate((v) => !v)
                  setEditing(null)
                }}
              >
                {showCreate ? 'Hide create form' : 'Add milestone'}
              </Button>
            </div>
          ) : null}

          {showCreate && canCreate ? (
            <Panel tone="surface" shadow="sm" className="space-y-4">
              <h2 className="font-display font-bold text-lg uppercase tracking-tight">
                New milestone
              </h2>
              <MilestoneForm
                submitLabel="Create milestone"
                onSubmit={onCreate}
                onCancel={() => setShowCreate(false)}
              />
            </Panel>
          ) : null}

          {editing ? (
            <Panel tone="surface" shadow="sm" className="space-y-4">
              <h2 className="font-display font-bold text-lg uppercase tracking-tight">
                Edit milestone
              </h2>
              <MilestoneForm
                key={editing.id}
                initial={editing}
                submitLabel="Save changes"
                onSubmit={onUpdate}
                onCancel={() => setEditing(null)}
              />
            </Panel>
          ) : null}

          {milestones.length === 0 ? (
            <EmptyState
              title="No milestones yet"
              description={
                canCreate
                  ? 'Create the first milestone to track deliverables, submissions, and reviews.'
                  : 'The client adds milestones for this project.'
              }
            />
          ) : (
            <div className="space-y-4">
              {milestones.map((milestone) => (
                <MilestoneCard
                  key={milestone.id}
                  milestone={milestone}
                  submissions={submissionsByMilestone[milestone.id] ?? []}
                  extensions={extensionsByMilestone[milestone.id] ?? []}
                  actorRole={actorRole}
                  isClient={isClient}
                  isFreelancer={isFreelancer}
                  currentUserId={user?.id}
                  projectClosed={projectClosed}
                  busy={busyId === milestone.id}
                  onTransition={(toStatus) =>
                    requestTransition(milestone, toStatus)
                  }
                  onEdit={() => {
                    setEditing(milestone)
                    setShowCreate(false)
                  }}
                  onDelete={() => void onDelete(milestone)}
                  onSubmitDeliverable={(input) =>
                    onSubmitDeliverable(milestone, input)
                  }
                  onReview={(submissionId, decision, feedback, unmetCriteria) =>
                    onReview(
                      milestone,
                      submissionId,
                      decision,
                      feedback,
                      unmetCriteria,
                    )
                  }
                  onDownload={(submission) =>
                    void onDownload(milestone.id, submission)
                  }
                  onProposeExtension={(input) =>
                    onProposeExtension(milestone, input)
                  }
                  onRespondExtension={(extensionId, decision) =>
                    onRespondExtension(milestone, extensionId, decision)
                  }
                  onCancelAndReclaim={() => onCancelAndReclaim(milestone)}
                  onExecuteAutoRelease={() => onExecuteAutoRelease(milestone)}
                  onExecuteVerifiedRelease={() =>
                    onExecuteVerifiedRelease(milestone)
                  }
                  onExecuteReclaim={() => onExecuteReclaim(milestone)}
                />
              ))}
            </div>
          )}

          <Panel className="space-y-4">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-bold uppercase tracking-tight text-dark">
                Activity timeline
              </h2>
              <p className="font-body text-sm text-dark/70">
                Newest events first. Open an entry for details; collapsed rows
                show only the summary, time, and actor.
              </p>
            </div>
            <ActivityTimeline
              items={activity}
              loading={activityLoading}
              loadingMore={activityLoadingMore}
              error={activityError}
              total={activityTotal}
              onLoadMore={() => void loadMoreActivity()}
            />
          </Panel>
        </>
      ) : null}

      <Modal
        open={Boolean(pendingTransition)}
        onClose={() => {
          if (transitionLoading) return
          setPendingTransition(null)
          setNote('')
          setNoteError(null)
        }}
        title={
          pendingTransition
            ? getMilestoneActionLabel(pendingTransition.toStatus)
            : 'Confirm'
        }
      >
        {pendingTransition ? (
          <div className="space-y-4">
            <p className="font-body text-sm text-dark/80">
              A note is required to move “{pendingTransition.milestone.title}”
              to{' '}
              <span className="font-mono font-bold">
                {pendingTransition.toStatus}
              </span>
              .
            </p>
            <Textarea
              label="Note"
              name="statusNote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              error={noteError ?? undefined}
              disabled={transitionLoading}
              rows={3}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                loading={transitionLoading}
                variant={
                  pendingTransition.toStatus === 'DISPUTED'
                    ? 'danger'
                    : 'primary'
                }
                onClick={confirmNoteTransition}
              >
                Confirm
              </Button>
              <Button
                variant="secondary"
                disabled={transitionLoading}
                onClick={() => {
                  setPendingTransition(null)
                  setNote('')
                  setNoteError(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </PageContainer>
  )
}
