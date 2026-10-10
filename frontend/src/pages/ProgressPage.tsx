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
  createMilestone,
  deleteMilestone,
  listMilestones,
  updateMilestone,
  updateMilestoneStatus,
  type Milestone,
  type MilestoneInput,
} from '../lib/api/milestones'
import { getProject, type Project } from '../lib/api/projects'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const load = useCallback(async () => {
    if (!token || !projectId || !isApiConfigured()) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [projectResult, milestonesResult] = await Promise.all([
        getProject(token, projectId),
        listMilestones(token, projectId),
      ])
      setProject(projectResult.project)
      setMilestones(milestonesResult.milestones)
    } catch (err) {
      setProject(null)
      setMilestones([])
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

  const actorRole = resolveActorRole(user?.id, user?.role, project)
  const isClient = actorRole === 'CLIENT'
  const projectClosed =
    project?.status === 'CANCELLED' || project?.status === 'COMPLETED'
  const canCreate = isClient && !projectClosed

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
      await updateMilestoneStatus(token, milestone.id, {
        status: toStatus,
        ...(statusNote ? { note: statusNote } : {}),
      })
      setPendingTransition(null)
      setNote('')
      setActionSuccess(
        `${milestone.title}: ${getMilestoneActionLabel(toStatus)}.`,
      )
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
        Status actions update the shared milestone workflow. File submissions and
        evidence land in a later phase — “Mark submitted” records status only for
        now. The server rejects unauthorized transitions even if a button is shown.
      </Alert>

      {!isApiConfigured() ? (
        <Alert tone="warning">
          Set <code className="font-bold">VITE_API_BASE_URL</code> to load
          milestones.
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
                  ? 'Create the first milestone to track deliverables, review windows, and status.'
                  : 'The client adds milestones for this project.'
              }
            />
          ) : (
            <div className="space-y-4">
              {milestones.map((milestone) => (
                <MilestoneCard
                  key={milestone.id}
                  milestone={milestone}
                  actorRole={actorRole}
                  isClient={isClient}
                  busy={busyId === milestone.id}
                  onTransition={(toStatus) =>
                    requestTransition(milestone, toStatus)
                  }
                  onEdit={() => {
                    setEditing(milestone)
                    setShowCreate(false)
                  }}
                  onDelete={() => void onDelete(milestone)}
                />
              ))}
            </div>
          )}
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
