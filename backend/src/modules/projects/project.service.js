import crypto from 'node:crypto'
import {
  conflict,
  forbidden,
  notFound,
  unauthorized,
} from '../../utils/errors.js'
import { findUserByEmail } from '../auth/auth.repository.js'
import { insertNotificationIgnoreConflict } from '../notifications/notification.repository.js'
import { insertAuditLog } from '../submissions/submission.repository.js'
import {
  acceptInvitationAndAssignFreelancer,
  findInvitationById,
  findInvitationByToken,
  findProjectById,
  insertInvitation,
  insertProject,
  listInvitationsForProject,
  listProjectsForUser,
  rejectInvitationById,
  revokeInvitationById,
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

  let invitedUser = null
  if (input.email) {
    if (user.email && input.email.toLowerCase() === user.email.toLowerCase()) {
      throw conflict('You cannot invite yourself to your own project.')
    }
    const existingUser = await findUserByEmail(input.email)
    if (existingUser) {
      if (existingUser.id === project.client_id) {
        throw conflict('You cannot invite yourself to your own project.')
      }
      if (existingUser.role !== 'FREELANCER') {
        throw conflict(
          'The invited email belongs to a non-freelancer account. Only freelancer accounts can be invited.',
        )
      }
      invitedUser = existingUser
    }
  }

  const revokedRows = await revokePendingInvitations(projectId)
  for (const rev of revokedRows) {
    await insertAuditLog({
      actorId: user.id,
      projectId,
      action: 'INVITATION_REVOKED',
      metadata: {
        invitationId: rev.id,
        invitedEmail: rev.invited_email ?? null,
        reason: 'Superseded by new invitation',
      },
    })
  }

  const token = crypto.randomBytes(24).toString('base64url')
  const message = input.message || null
  const invitation = await insertInvitation({
    projectId,
    token,
    invitedEmail: input.email,
    invitedUserId: invitedUser?.id ?? null,
    message,
    createdBy: user.id,
    expiresAt: inviteExpiryDate(),
  })

  await insertAuditLog({
    actorId: user.id,
    projectId,
    action: 'INVITATION_CREATED',
    metadata: {
      invitationId: invitation.id,
      invitedEmail: invitation.invited_email ?? null,
      invitedUserId: invitation.invited_user_id ?? null,
    },
  })

  if (invitedUser) {
    const clientName = project.client?.name || user.name || 'A client'
    const bodyText = message
      ? `${clientName} invited you to join "${project.title}": "${message}"`
      : `${clientName} invited you to work on "${project.title}".`

    await insertNotificationIgnoreConflict({
      userId: invitedUser.id,
      projectId,
      invitationId: invitation.id,
      kind: 'PROJECT_INVITATION',
      subjectKey: `invitation:received:${invitation.id}`,
      title: `Work invitation — ${project.title}`,
      body: bodyText,
    })
  }

  return {
    invitation: toPublicInvitation(invitation),
    // Frontend builds the absolute URL; this is the shareable path fragment.
    invitePath: `/invite/${invitation.token}`,
    notifiedFreelancer: Boolean(invitedUser),
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
    id: invitation.id,
    token: invitation.token,
    status: expired ? 'EXPIRED' : invitation.status,
    invitedEmail: invitation.invited_email ?? null,
    invitedRole: invitation.invited_role,
    message: invitation.message ?? null,
    createdAt: invitation.created_at,
    expiresAt: invitation.expires_at,
    sender: {
      id: invitation.client_id,
      name: invitation.sender_name,
      email: invitation.sender_email,
    },
    project: {
      id: invitation.project_id,
      title: invitation.project_title,
      status: invitation.project_status,
      hasFreelancer: Boolean(invitation.freelancer_id),
    },
    note: 'Accepting joins this Fairwork project. Agreement terms must still be reviewed and accepted separately.',
  }
}

function assertFreelancerCanRespond(user, invitation) {
  if (!user) throw unauthorized()
  if (user.role !== 'FREELANCER') {
    throw forbidden('Only freelancer accounts can respond to project invitations.')
  }

  if (!invitation) throw notFound('Invitation not found.')

  if (
    invitation.invited_user_id &&
    invitation.invited_user_id !== user.id
  ) {
    throw forbidden('This invitation was issued for a different freelancer account.')
  }

  if (
    invitation.invited_email &&
    invitation.invited_email.toLowerCase() !== user.email.toLowerCase()
  ) {
    throw forbidden('This invitation was issued for a different email address.')
  }

  if (invitation.client_id === user.id) {
    throw forbidden('Project clients cannot respond to their own project invitations.')
  }

  if (invitation.status !== 'PENDING') {
    throw conflict(`Invitation has already been ${invitation.status.toLowerCase()}.`)
  }

  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    throw conflict('Invitation has expired.')
  }

  if (
    invitation.project_status === 'CANCELLED' ||
    invitation.project_status === 'COMPLETED'
  ) {
    throw conflict(`Cannot respond to an invitation for a ${invitation.project_status.toLowerCase()} project.`)
  }
}

export async function acceptInvitation(user, token) {
  const invitation = await findInvitationByToken(token)
  assertFreelancerCanRespond(user, invitation)

  if (invitation.freelancer_id) {
    throw conflict('This project already has a freelancer assigned.')
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

  await insertAuditLog({
    actorId: user.id,
    projectId: invitation.project_id,
    action: 'INVITATION_ACCEPTED',
    metadata: {
      invitationId: invitation.id,
      freelancerId: user.id,
    },
  })

  if (invitation.client_id) {
    const freelancerName = user.name || user.email || 'The freelancer'
    await insertNotificationIgnoreConflict({
      userId: invitation.client_id,
      projectId: invitation.project_id,
      invitationId: invitation.id,
      kind: 'INVITATION_ACCEPTED',
      subjectKey: `invitation:accepted:${invitation.id}`,
      title: `Invitation accepted — ${invitation.project_title}`,
      body: `${freelancerName} accepted your invitation to join "${invitation.project_title}".`,
    })
  }

  const project = await findProjectById(invitation.project_id)
  return toPublicProject(project)
}

export async function rejectInvitation(user, token) {
  const invitation = await findInvitationByToken(token)
  assertFreelancerCanRespond(user, invitation)

  // Rejecting an open link requires either an email/user match OR being an authenticated freelancer
  const updated = await rejectInvitationById({
    invitationId: invitation.id,
    freelancerId: user.id,
  })
  if (!updated) {
    throw conflict('Invitation is no longer pending.')
  }

  await insertAuditLog({
    actorId: user.id,
    projectId: invitation.project_id,
    action: 'INVITATION_REJECTED',
    metadata: {
      invitationId: invitation.id,
      freelancerId: user.id,
    },
  })

  if (invitation.client_id) {
    const freelancerName = user.name || user.email || 'The invited freelancer'
    await insertNotificationIgnoreConflict({
      userId: invitation.client_id,
      projectId: invitation.project_id,
      invitationId: invitation.id,
      kind: 'INVITATION_REJECTED',
      subjectKey: `invitation:rejected:${invitation.id}`,
      title: `Invitation declined — ${invitation.project_title}`,
      body: `${freelancerName} declined the invitation to join "${invitation.project_title}".`,
    })
  }

  return {
    invitation: toPublicInvitation(updated),
  }
}

export async function withdrawInvitation(user, projectId, invitationId) {
  const project = await findProjectById(projectId)
  assertClientOwner(project, user)

  const invitation = await findInvitationById(invitationId)
  if (!invitation || invitation.project_id !== projectId) {
    throw notFound('Invitation not found.')
  }

  if (invitation.status !== 'PENDING') {
    throw conflict(`Cannot withdraw an invitation that is ${invitation.status.toLowerCase()}.`)
  }

  const updated = await revokeInvitationById(invitationId, projectId)
  if (!updated) {
    throw conflict('Invitation is no longer pending.')
  }

  await insertAuditLog({
    actorId: user.id,
    projectId,
    action: 'INVITATION_REVOKED',
    metadata: {
      invitationId: updated.id,
      invitedEmail: updated.invited_email ?? null,
    },
  })

  return {
    invitation: toPublicInvitation(updated),
  }
}

// Re-export guard helper for middleware reuse if needed later.
export { assertParticipant }
