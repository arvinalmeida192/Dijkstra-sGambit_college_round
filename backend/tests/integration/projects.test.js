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
})
