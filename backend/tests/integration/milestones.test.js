import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'

const app = createApp()

const sampleMilestone = {
  title: 'Design',
  deliverables: 'Figma file',
  acceptanceCriteria: 'Approved mockups',
  amount: 25000,
  dueDate: '2026-11-15',
  reviewWindowDays: 5,
}

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

async function createProjectWithFreelancer() {
  const client = await register('CLIENT')
  const freelancer = await register('FREELANCER')

  const projectRes = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${client.token}`)
    .send({ title: 'Milestone project', description: 'Work items' })
  expect(projectRes.status).toBe(201)
  const projectId = projectRes.body.project.id

  const inviteRes = await request(app)
    .post(`/api/v1/projects/${projectId}/invitations`)
    .set('Authorization', `Bearer ${client.token}`)
    .send({})
  expect(inviteRes.status).toBe(201)

  const acceptRes = await request(app)
    .post(`/api/v1/invitations/${inviteRes.body.invitation.token}/accept`)
    .set('Authorization', `Bearer ${freelancer.token}`)
  expect(acceptRes.status).toBe(200)

  return { client, freelancer, projectId }
}

async function createMilestone(token, projectId, body = sampleMilestone) {
  const res = await request(app)
    .post(`/api/v1/projects/${projectId}/milestones`)
    .set('Authorization', `Bearer ${token}`)
    .send(body)
  expect(res.status).toBe(201)
  return res.body.milestone
}

async function setStatus(token, milestoneId, status, note) {
  return request(app)
    .patch(`/api/v1/milestones/${milestoneId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send(note ? { status, note } : { status })
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

describe('Milestones API', () => {
  it('creates, lists, gets, edits, and deletes PENDING milestones', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()

    const created = await createMilestone(client.token, projectId)
    expect(created).toMatchObject({
      projectId,
      title: 'Design',
      amount: 25000,
      status: 'PENDING',
      dueDate: '2026-11-15',
      reviewWindowDays: 5,
    })
    expect(created.allowedTransitions).toContain('IN_PROGRESS')

    const listed = await request(app)
      .get(`/api/v1/projects/${projectId}/milestones`)
      .set('Authorization', `Bearer ${freelancer.token}`)
    expect(listed.status).toBe(200)
    expect(listed.body.milestones).toHaveLength(1)

    const got = await request(app)
      .get(`/api/v1/milestones/${created.id}`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(got.status).toBe(200)
    expect(got.body.milestone.id).toBe(created.id)

    const updated = await request(app)
      .patch(`/api/v1/milestones/${created.id}`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ title: 'Design v2', amount: 30000 })
    expect(updated.status).toBe(200)
    expect(updated.body.milestone.title).toBe('Design v2')
    expect(updated.body.milestone.amount).toBe(30000)

    const freelEdit = await request(app)
      .patch(`/api/v1/milestones/${created.id}`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ title: 'Nope' })
    expect(freelEdit.status).toBe(403)

    const deleted = await request(app)
      .delete(`/api/v1/milestones/${created.id}`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(deleted.status).toBe(200)
    expect(deleted.body.deleted).toBe(true)
  })

  it('runs the happy-path status machine through APPROVED', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()
    const m = await createMilestone(client.token, projectId)

    let res = await setStatus(freelancer.token, m.id, 'IN_PROGRESS')
    expect(res.status).toBe(200)
    expect(res.body.milestone.status).toBe('IN_PROGRESS')

    res = await setStatus(freelancer.token, m.id, 'SUBMITTED')
    expect(res.status).toBe(200)
    expect(res.body.milestone.status).toBe('SUBMITTED')
    expect(res.body.milestone.submittedAt).toBeTruthy()

    res = await setStatus(client.token, m.id, 'IN_REVIEW')
    expect(res.status).toBe(200)
    expect(res.body.milestone.status).toBe('IN_REVIEW')
    expect(res.body.milestone.reviewStartedAt).toBeTruthy()
    expect(res.body.milestone.reviewDueAt).toBeTruthy()

    const started = new Date(res.body.milestone.reviewStartedAt)
    const due = new Date(res.body.milestone.reviewDueAt)
    const diffDays = Math.round((due - started) / (24 * 60 * 60 * 1000))
    expect(diffDays).toBe(5)

    res = await setStatus(client.token, m.id, 'APPROVED')
    expect(res.status).toBe(200)
    expect(res.body.milestone.status).toBe('APPROVED')
    expect(res.body.milestone.approvedAt).toBeTruthy()
    expect(res.body.milestone.allowedTransitions).toEqual([])
  })

  it('prevents freelancer from approving their own submission', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()
    const m = await createMilestone(client.token, projectId)

    await setStatus(freelancer.token, m.id, 'IN_PROGRESS')
    await setStatus(freelancer.token, m.id, 'SUBMITTED')
    await setStatus(client.token, m.id, 'IN_REVIEW')

    const blocked = await setStatus(freelancer.token, m.id, 'APPROVED')
    expect(blocked.status).toBe(403)
    expect(blocked.body.message).toMatch(/cannot approve/i)
  })

  it('supports revision request loop and requires a note', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()
    const m = await createMilestone(client.token, projectId)

    await setStatus(freelancer.token, m.id, 'IN_PROGRESS')
    await setStatus(freelancer.token, m.id, 'SUBMITTED')
    await setStatus(client.token, m.id, 'IN_REVIEW')

    const missingNote = await setStatus(
      client.token,
      m.id,
      'REVISION_REQUESTED',
    )
    expect(missingNote.status).toBe(409)

    const revised = await setStatus(
      client.token,
      m.id,
      'REVISION_REQUESTED',
      'Tighten spacing on mobile',
    )
    expect(revised.status).toBe(200)
    expect(revised.body.milestone.status).toBe('REVISION_REQUESTED')
    expect(revised.body.milestone.statusNote).toMatch(/Tighten/)

    const back = await setStatus(freelancer.token, m.id, 'IN_PROGRESS')
    expect(back.status).toBe(200)
    expect(back.body.milestone.status).toBe('IN_PROGRESS')
  })

  it('rejects invalid transitions and outsider access', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()
    const outsider = await register('CLIENT')
    const m = await createMilestone(client.token, projectId)

    const jump = await setStatus(client.token, m.id, 'APPROVED')
    expect(jump.status).toBe(409)

    const outsiderGet = await request(app)
      .get(`/api/v1/milestones/${m.id}`)
      .set('Authorization', `Bearer ${outsider.token}`)
    expect(outsiderGet.status).toBe(403)

    // Freelancer cannot submit from PENDING
    const earlySubmit = await setStatus(freelancer.token, m.id, 'SUBMITTED')
    expect(earlySubmit.status).toBe(409)
  })

  it('allows past due dates without blocking transitions', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()
    const m = await createMilestone(client.token, projectId, {
      ...sampleMilestone,
      dueDate: '2020-01-01',
    })
    expect(m.dueDate).toBe('2020-01-01')

    const started = await setStatus(freelancer.token, m.id, 'IN_PROGRESS')
    expect(started.status).toBe(200)
    expect(started.body.milestone.status).toBe('IN_PROGRESS')
  })

  it('blocks start without an assigned freelancer', async () => {
    const client = await register('CLIENT')
    const projectRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ title: 'Solo project' })
    expect(projectRes.status).toBe(201)
    const projectId = projectRes.body.project.id

    const m = await createMilestone(client.token, projectId)
    const start = await setStatus(client.token, m.id, 'IN_PROGRESS')
    expect(start.status).toBe(409)
    expect(start.body.message).toMatch(/freelancer/i)
  })

  it('blocks edits after work has started', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()
    const m = await createMilestone(client.token, projectId)
    await setStatus(freelancer.token, m.id, 'IN_PROGRESS')

    const edit = await request(app)
      .patch(`/api/v1/milestones/${m.id}`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ title: 'Too late' })
    expect(edit.status).toBe(409)

    const del = await request(app)
      .delete(`/api/v1/milestones/${m.id}`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(del.status).toBe(409)
  })
})
