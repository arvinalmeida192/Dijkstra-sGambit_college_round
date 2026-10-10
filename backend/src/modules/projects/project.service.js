import crypto from 'node:crypto'
import {
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from '../../utils/errors.js'
import {
  acceptInvitationAndAssignFreelancer,
  findInvitationByToken,
  findProjectById,
  insertInvitation,
  insertProject,
  listInvitationsForProject,
  listProjectsForUser,
  revokePendingInvitations,
  toPublicInvitation,
  toPublicProject,
} from './project.repository.js'

const INVITE_TTL_DAYS = 14

function assertParticipant(project, user) {
  if (!project) throw notFound('Project not found.')
  const isClient = project.client_id === user.id
  const isFreelancer = project.freelancer_id === user.id
  const isArbitrator = user.role === 'ARBITRATOR'
  if (!isClient && !isFreelancer && !isArbitrator) {
    throw forbidden('You do not have access to this project.')
  }
  return { isClient, isFreelancer, isArbitrator }
}

function assertClientOwner(project, user) {
  assertParticipant(project, user)
  if (project.client_id !== user.id) {
    throw forbidden('Only the project client can perform this action.')
  }
}

function inviteExpiryDate() {
  const expires = new Date()
  expires.setUTCDate(expires.getUTCDate() + INVITE_TTL_DAYS)
  return expires
}

export async function createProject(user, input) {
  if (user.role !== 'CLIENT') {
    throw forbidden('Only clients can create projects.')
  }

  const row = await insertProject({
    title: input.title,
    description: input.description,
    clientId: user.id,
    externalUrl: input.externalUrl,
  })

  const project = await findProjectById(row.id)
  return toPublicProject(project)
}

export async function listProjects(user, query) {
  const { rows, total } = await listProjectsForUser(user.id, query)
  return {
    projects: rows.map(toPublicProject),
    pagination: {
      limit: query.limit,
      offset: query.offset,
      total,
    },
  }
}

export async function getProject(user, projectId) {
  const project = await findProjectById(projectId)
  assertParticipant(project, user)

  const payload = toPublicProject(project)

  // Clients see invitation tokens so they can share links; freelancers do not.
  if (project.client_id === user.id) {
    const invitations = await listInvitationsForProject(projectId)
    payload.invitations = invitations.map(toPublicInvitation)
  }

  return payload
}

export async function createInvitation(user, projectId, input) {
  const project = await findProjectById(projectId)
  assertClientOwner(project, user)

  if (project.freelancer_id) {
    throw conflict('This project already has a freelancer assigned.')
  }

  if (project.status === 'CANCELLED' || project.status === 'COMPLETED') {
    throw conflict(`Cannot invite to a ${project.status.toLowerCase()} project.`)
  }

  await revokePendingInvitations(projectId)

  const token = crypto.randomBytes(24).toString('base64url')
  const invitation = await insertInvitation({
    projectId,
    token,
    invitedEmail: input.email,
    createdBy: user.id,
    expiresAt: inviteExpiryDate(),
  })

  return {
    invitation: toPublicInvitation(invitation),
    // Frontend builds the absolute URL; this is the shareable path fragment.
    invitePath: `/register?invite=${invitation.token}`,
    note: 'External project URLs are references only — Fairwork does not control external platforms.',
  }
}

export async function previewInvitation(token) {
  const invitation = await findInvitationByToken(token)
  if (!invitation) throw notFound('Invitation not found.')

  const expired =
    invitation.status === 'PENDING' &&
    new Date(invitation.expires_at).getTime() < Date.now()

  return {
    token: invitation.token,
    status: expired ? 'EXPIRED' : invitation.status,
    invitedEmail: invitation.invited_email ?? null,
    invitedRole: invitation.invited_role,
    expiresAt: invitation.expires_at,
    project: {
      id: invitation.project_id,
      title: invitation.project_title,
      status: invitation.project_status,
      hasFreelancer: Boolean(invitation.freelancer_id),
    },
    note: 'Accepting joins this Fairwork project. Linked external URLs remain references only.',
  }
}

export async function acceptInvitation(user, token) {
  if (!user) throw unauthorized()
  if (user.role !== 'FREELANCER') {
    throw forbidden('Only freelancer accounts can accept project invitations.')
  }

  const invitation = await findInvitationByToken(token)
  if (!invitation) throw notFound('Invitation not found.')

  if (invitation.status !== 'PENDING') {
    throw conflict(`Invitation is ${invitation.status.toLowerCase()}.`)
  }

  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    throw conflict('Invitation has expired.')
  }

  if (invitation.freelancer_id) {
    throw conflict('This project already has a freelancer assigned.')
  }

  if (
    invitation.invited_email &&
    invitation.invited_email.toLowerCase() !== user.email.toLowerCase()
  ) {
    throw forbidden('This invitation was issued for a different email address.')
  }

  try {
    const result = await acceptInvitationAndAssignFreelancer({
      invitationId: invitation.id,
      projectId: invitation.project_id,
      freelancerId: user.id,
    })
    if (!result) {
      throw conflict('Invitation is no longer pending.')
    }
  } catch (err) {
    if (err?.code === 'PROJECT_SEAT_TAKEN') {
      throw conflict('This project already has a freelancer assigned.')
    }
    throw err
  }

  const project = await findProjectById(invitation.project_id)
  return toPublicProject(project)
}

// Re-export guard helper for middleware reuse if needed later.
export { assertParticipant }
