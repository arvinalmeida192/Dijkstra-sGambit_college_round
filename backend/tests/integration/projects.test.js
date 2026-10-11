import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'

const app = createApp()

async function resetDb() {
  await pool.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE')
}

async function register(role, overrides = {}) {
  const email =
    overrides.email ??
    `${role.toLowerCase()}-${Math.random().toString(16).slice(2)}@example.com`
  const res = await request(app).post('/api/v1/auth/register').send({
    name: overrides.name ?? `${role} User`,
    email,
    password: 'password123',
    role,
  })
  expect(res.status).toBe(201)
  return { token: res.body.token, user: res.body.user, email }
}

beforeAll(async () => {
  await pool.query('SELECT 1')
})

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await pool.end()
})

describe('Projects API', () => {
  it('lets a client create, list, and fetch a project with optional external URL', async () => {
    const client = await register('CLIENT')

    const created = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        title: 'Landing redesign',
        description: 'Two milestones',
        externalUrl: 'https://jobs.example/abc',
      })

    expect(created.status).toBe(201)
    expect(created.body.project).toMatchObject({
      title: 'Landing redesign',
      description: 'Two milestones',
      externalUrl: 'https://jobs.example/abc',
      status: 'DRAFT',
      clientId: client.user.id,
      freelancerId: null,
    })

    const listed = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${client.token}`)

    expect(listed.status).toBe(200)
    expect(listed.body.projects).toHaveLength(1)
    expect(listed.body.pagination.total).toBe(1)

    const detail = await request(app)
      .get(`/api/v1/projects/${created.body.project.id}`)
      .set('Authorization', `Bearer ${client.token}`)

    expect(detail.status).toBe(200)
    expect(detail.body.project.invitations).toEqual([])
  })

  it('rejects project creation by freelancers', async () => {
    const freelancer = await register('FREELANCER')
    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ title: 'Should fail' })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })

  it('hides projects from non-participants', async () => {
    const client = await register('CLIENT')
    const stranger = await register('CLIENT', { email: 'stranger@example.com' })

    const created = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ title: 'Private project' })

    const res = await request(app)
      .get(`/api/v1/projects/${created.body.project.id}`)
      .set('Authorization', `Bearer ${stranger.token}`)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
  })

  it('supports invitation create, preview, and freelancer accept', async () => {
    const client = await register('CLIENT')
    const freelancer = await register('FREELANCER', {
      email: 'fran@example.com',
    })

    const created = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ title: 'Invite flow' })

    const invite = await request(app)
      .post(`/api/v1/projects/${created.body.project.id}/invitations`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ email: 'fran@example.com' })

    expect(invite.status).toBe(201)
    expect(invite.body.invitation.status).toBe('PENDING')
    expect(invite.body.invitePath).toContain(invite.body.invitation.token)
    expect(invite.body.note).toMatch(/does not control/i)

    const preview = await request(app).get(
      `/api/v1/invitations/${invite.body.invitation.token}`,
    )
    expect(preview.status).toBe(200)
    expect(preview.body.invitation.project.title).toBe('Invite flow')

    const accepted = await request(app)
      .post(`/api/v1/invitations/${invite.body.invitation.token}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)

    expect(accepted.status).toBe(200)
    expect(accepted.body.project).toMatchObject({
      status: 'ACTIVE',
      freelancerId: freelancer.user.id,
    })

    const freelancerList = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${freelancer.token}`)
    expect(freelancerList.body.projects).toHaveLength(1)

    const reuse = await request(app)
      .post(`/api/v1/invitations/${invite.body.invitation.token}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)
    expect(reuse.status).toBe(409)
  })

  it('rejects invite acceptance by clients and wrong emails', async () => {
    const client = await register('CLIENT')
    const otherFreelancer = await register('FREELANCER', {
      email: 'other@example.com',
    })
    const clientAsAcceptor = await register('CLIENT', {
      email: 'client2@example.com',
      name: 'Other Client',
    })

    const created = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ title: 'Email locked invite' })

    const invite = await request(app)
      .post(`/api/v1/projects/${created.body.project.id}/invitations`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ email: 'target@example.com' })

    const asClient = await request(app)
      .post(`/api/v1/invitations/${invite.body.invitation.token}/accept`)
      .set('Authorization', `Bearer ${clientAsAcceptor.token}`)
    expect(asClient.status).toBe(403)

    const wrongEmail = await request(app)
      .post(`/api/v1/invitations/${invite.body.invitation.token}/accept`)
      .set('Authorization', `Bearer ${otherFreelancer.token}`)
    expect(wrongEmail.status).toBe(403)
  })

  it('requires auth for project routes', async () => {
    const res = await request(app).get('/api/v1/projects')
    expect(res.status).toBe(401)
  })

  it('delivers an actionable notification to a registered freelancer and updates status on accept', async () => {
    const client = await register('CLIENT', { name: 'Acme Client' })
    const freelancer = await register('FREELANCER', {
      name: 'Dana Freelancer',
      email: 'dana@example.com',
    })

    const created = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ title: 'E-commerce Website', description: 'Storefront build' })
    const projectId = created.body.project.id

    const invite = await request(app)
      .post(`/api/v1/projects/${projectId}/invitations`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        email: 'dana@example.com',
        message: "We'd like to invite you to work on this project.",
      })

    expect(invite.status).toBe(201)
    expect(invite.body.notifiedFreelancer).toBe(true)
    expect(invite.body.invitation).toMatchObject({
      projectId,
      invitedEmail: 'dana@example.com',
      invitedUserId: freelancer.user.id,
      message: "We'd like to invite you to work on this project.",
      status: 'PENDING',
    })

    // Freelancer checks notifications
    const notificationsRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${freelancer.token}`)

    expect(notificationsRes.status).toBe(200)
    const inviteNotification = notificationsRes.body.notifications.find(
      (n) => n.kind === 'PROJECT_INVITATION',
    )
    expect(inviteNotification).toBeDefined()
    expect(inviteNotification.projectId).toBe(projectId)
    expect(inviteNotification.invitationId).toBe(invite.body.invitation.id)
    expect(inviteNotification.invitation).toMatchObject({
      id: invite.body.invitation.id,
      token: invite.body.invitation.token,
      status: 'PENDING',
      invitedEmail: 'dana@example.com',
      message: "We'd like to invite you to work on this project.",
      projectTitle: 'E-commerce Website',
      sender: {
        id: client.user.id,
        name: 'Acme Client',
        email: client.email,
      },
    })

    // Freelancer accepts directly using the token in the notification
    const acceptRes = await request(app)
      .post(`/api/v1/invitations/${inviteNotification.invitation.token}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)
    expect(acceptRes.status).toBe(200)
    expect(acceptRes.body.project.freelancerId).toBe(freelancer.user.id)

    // Notification now reflects ACCEPTED status
    const afterAcceptNotifications = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${freelancer.token}`)
    const updatedNotification = afterAcceptNotifications.body.notifications.find(
      (n) => n.id === inviteNotification.id,
    )
    expect(updatedNotification.invitation.status).toBe('ACCEPTED')
    expect(updatedNotification.invitation.hasFreelancer).toBe(true)

    // Client also receives an INVITATION_ACCEPTED notification
    const clientNotifications = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${client.token}`)
    expect(
      clientNotifications.body.notifications.some(
        (n) => n.kind === 'INVITATION_ACCEPTED' && n.projectId === projectId,
      ),
    ).toBe(true)

    // Audit history records INVITATION_CREATED and INVITATION_ACCEPTED
    const auditRes = await request(app)
      .get(`/api/v1/projects/${projectId}/audit-logs`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(auditRes.status).toBe(200)
    const actions = auditRes.body.auditLogs.map((a) => a.action)
    expect(actions).toContain('INVITATION_CREATED')
    expect(actions).toContain('INVITATION_ACCEPTED')
  })

  it('supports freelancer rejecting an invitation and prevents subsequent acceptance', async () => {
    const client = await register('CLIENT', { name: 'Client One' })
    const freelancer = await register('FREELANCER', {
      name: 'Rejecting Freelancer',
      email: 'rejecter@example.com',
    })

    const created = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ title: 'Mobile App MVP' })
    const projectId = created.body.project.id

    const invite = await request(app)
      .post(`/api/v1/projects/${projectId}/invitations`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ email: 'rejecter@example.com' })
    expect(invite.status).toBe(201)
    const inviteToken = invite.body.invitation.token

    // Reject invitation
    const rejectRes = await request(app)
      .post(`/api/v1/invitations/${inviteToken}/reject`)
      .set('Authorization', `Bearer ${freelancer.token}`)

    expect(rejectRes.status).toBe(200)
    expect(rejectRes.body.invitation.status).toBe('REJECTED')
    expect(rejectRes.body.invitation.rejectedBy).toBe(freelancer.user.id)

    // Duplicate reject or subsequent accept must fail with 409 CONFLICT
    const repeatReject = await request(app)
      .post(`/api/v1/invitations/${inviteToken}/reject`)
      .set('Authorization', `Bearer ${freelancer.token}`)
    expect(repeatReject.status).toBe(409)

    const acceptAfterReject = await request(app)
      .post(`/api/v1/invitations/${inviteToken}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)
    expect(acceptAfterReject.status).toBe(409)

    // Project remains unassigned
    const detail = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(detail.body.project.freelancerId).toBeNull()
    expect(detail.body.project.invitations[0].status).toBe('REJECTED')

    // Client receives INVITATION_REJECTED notification
    const clientNotifs = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${client.token}`)
    expect(
      clientNotifs.body.notifications.some(
        (n) => n.kind === 'INVITATION_REJECTED' && n.projectId === projectId,
      ),
    ).toBe(true)

    // Audit log records INVITATION_REJECTED
    const auditRes = await request(app)
      .get(`/api/v1/projects/${projectId}/audit-logs`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(
      auditRes.body.auditLogs.some((a) => a.action === 'INVITATION_REJECTED'),
    ).toBe(true)
  })

  it('supports client withdrawing a pending invitation and blocks freelancer response', async () => {
    const client = await register('CLIENT')
    const freelancer = await register('FREELANCER', {
      email: 'invited@example.com',
    })
    const otherClient = await register('CLIENT')

    const created = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ title: 'Withdrawn project' })
    const projectId = created.body.project.id

    const invite = await request(app)
      .post(`/api/v1/projects/${projectId}/invitations`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ email: 'invited@example.com' })
    const invitationId = invite.body.invitation.id
    const inviteToken = invite.body.invitation.token

    // Unauthorized client cannot withdraw
    const unauthWithdraw = await request(app)
      .post(`/api/v1/projects/${projectId}/invitations/${invitationId}/withdraw`)
      .set('Authorization', `Bearer ${otherClient.token}`)
    expect(unauthWithdraw.status).toBe(403)

    // Owner client withdraws
    const withdrawRes = await request(app)
      .post(`/api/v1/projects/${projectId}/invitations/${invitationId}/withdraw`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(withdrawRes.status).toBe(200)
    expect(withdrawRes.body.invitation.status).toBe('REVOKED')

    // Freelancer cannot accept or reject a withdrawn invitation
    const acceptWithdrawn = await request(app)
      .post(`/api/v1/invitations/${inviteToken}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)
    expect(acceptWithdrawn.status).toBe(409)

    const rejectWithdrawn = await request(app)
      .post(`/api/v1/invitations/${inviteToken}/reject`)
      .set('Authorization', `Bearer ${freelancer.token}`)
    expect(rejectWithdrawn.status).toBe(409)
  })

  it('rejects expired invitations and non-freelancer email targets', async () => {
    const client = await register('CLIENT')
    const secondClient = await register('CLIENT', {
      email: 'clienttarget@example.com',
    })
    const freelancer = await register('FREELANCER', {
      email: 'expiring@example.com',
    })

    const created = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ title: 'Expiry & Role check' })
    const projectId = created.body.project.id

    // Cannot invite a registered CLIENT email
    const badRoleInvite = await request(app)
      .post(`/api/v1/projects/${projectId}/invitations`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ email: secondClient.email })
    expect(badRoleInvite.status).toBe(409)

    // Create valid invite and force expiration in DB
    const invite = await request(app)
      .post(`/api/v1/projects/${projectId}/invitations`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ email: freelancer.email })
    expect(invite.status).toBe(201)

    await pool.query(
      `UPDATE project_invitations SET expires_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [invite.body.invitation.id],
    )

    const acceptExpired = await request(app)
      .post(`/api/v1/invitations/${invite.body.invitation.token}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)
    expect(acceptExpired.status).toBe(409)
    expect(acceptExpired.body.message).toMatch(/expired/i)

    const rejectExpired = await request(app)
      .post(`/api/v1/invitations/${invite.body.invitation.token}/reject`)
      .set('Authorization', `Bearer ${freelancer.token}`)
    expect(rejectExpired.status).toBe(409)
    expect(rejectExpired.body.message).toMatch(/expired/i)
  })

  it('handles concurrent accept/reject requests atomically and preserves agreement safeguards', async () => {
    const client = await register('CLIENT')
    const freelancer = await register('FREELANCER', {
      email: 'concurrent@example.com',
    })

    const created = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ title: 'Concurrency & Safeguards' })
    const projectId = created.body.project.id

    // Client proposes an agreement v1 and accepts their side BEFORE freelancer joins
    const agreementRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        terms: {
          title: 'Full Scope Agreement',
          summary: 'Build web platform',
          deliverables: 'Production bundle',
          completionCriteria: 'All tests pass',
          totalPayment: 50000,
          dueDate: '2026-12-31',
          milestones: [
            {
              title: 'Phase 1',
              description: 'Initial setup',
              deliverables: 'Repo setup',
              acceptanceCriteria: 'CI green',
              amount: 50000,
              dueDate: '2026-12-15',
              reviewWindowDays: 5,
            },
          ],
        },
      })
    expect(agreementRes.status).toBe(201)
    const agreementId = agreementRes.body.agreement.id

    await request(app)
      .post(`/api/v1/agreements/${agreementId}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({})

    // Client invites freelancer
    const invite = await request(app)
      .post(`/api/v1/projects/${projectId}/invitations`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ email: freelancer.email })
    const token = invite.body.invitation.token

    // Concurrent accept requests — exactly one succeeds (200) and one fails (409)
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/v1/invitations/${token}/accept`)
        .set('Authorization', `Bearer ${freelancer.token}`),
      request(app)
        .post(`/api/v1/invitations/${token}/accept`)
        .set('Authorization', `Bearer ${freelancer.token}`),
    ])

    const statuses = [res1.status, res2.status].sort()
    expect(statuses).toEqual([200, 409])

    // Safeguard check: accepting the work invitation MUST NOT auto-accept or activate the agreement
    const checkAgreement = await request(app)
      .get(`/api/v1/agreements/${agreementId}`)
      .set('Authorization', `Bearer ${freelancer.token}`)
    expect(checkAgreement.status).toBe(200)
    expect(checkAgreement.body.agreement.status).toBe('PROPOSED')
    expect(checkAgreement.body.agreement.acceptances).toHaveLength(1)
    expect(checkAgreement.body.agreement.acceptances[0].userId).toBe(
      client.user.id,
    )
  })
})
