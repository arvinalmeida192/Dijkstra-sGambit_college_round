import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'

const app = createApp()

async function resetDb() {
  await pool.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE')
}

async function register(role) {
  const email = `${role.toLowerCase()}-${Math.random().toString(16).slice(2)}@example.com`
  const res = await request(app).post('/api/v1/auth/register').send({
    name: `${role} User`,
    email,
    password: 'password123',
    role,
  })
  expect(res.status).toBe(201)
  return { token: res.body.token, user: res.body.user }
}

async function createProjectWithFreelancer() {
  const client = await register('CLIENT')
  const freelancer = await register('FREELANCER')
  const outsider = await register('CLIENT')

  const projectRes = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${client.token}`)
    .send({ title: 'Activity project', description: 'Timeline' })
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

  const milestoneRes = await request(app)
    .post(`/api/v1/projects/${projectId}/milestones`)
    .set('Authorization', `Bearer ${client.token}`)
    .send({
      title: 'Milestone 2',
      deliverables: 'Deliverable',
      acceptanceCriteria: 'Criteria',
      amount: 10000,
      dueDate: '2026-12-01',
    })
  expect(milestoneRes.status).toBe(201)

  return {
    client,
    freelancer,
    outsider,
    projectId,
    milestone: milestoneRes.body.milestone,
  }
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

describe('Project activity timeline API', () => {
  it('returns summarized audit activity newest-first with pagination', async () => {
    const { client, freelancer, projectId, milestone } =
      await createProjectWithFreelancer()

    const start = await request(app)
      .patch(`/api/v1/milestones/${milestone.id}/status`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ status: 'IN_PROGRESS' })
    expect(start.status).toBe(200)

    const submit = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ notes: 'Ready for review' })
    expect(submit.status).toBe(201)

    const review = await request(app)
      .post(`/api/v1/submissions/${submit.body.submission.id}/review`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        decision: 'REVISION_REQUESTED',
        feedback: 'Please revise',
        unmetCriteria: ['Criteria'],
      })
    expect(review.status).toBe(200)

    const page = await request(app)
      .get(`/api/v1/projects/${projectId}/audit-logs?limit=1&offset=0`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(page.status).toBe(200)
    expect(page.body.pagination).toMatchObject({
      limit: 1,
      offset: 0,
    })
    expect(page.body.pagination.total).toBeGreaterThanOrEqual(2)
    expect(page.body.auditLogs).toHaveLength(1)

    const first = page.body.auditLogs[0]
    expect(first).toMatchObject({
      id: expect.any(String),
      action: 'SUBMISSION_REVIEWED',
      eventType: 'SUBMISSION_REVIEWED',
      summary: 'Revision requested for Milestone 2',
      actorName: 'CLIENT User',
      actorRole: 'CLIENT',
      category: 'review',
      createdAt: expect.any(String),
    })
    expect(first.metadata).not.toHaveProperty('password')
    expect(first.details).toMatchObject({ decision: 'REVISION_REQUESTED' })

    // Collapsed payload should not dump raw stack/secret fields; summary only.
    expect(first.summary).not.toMatch(/stack|password|secret/i)

    const page2 = await request(app)
      .get(`/api/v1/projects/${projectId}/audit-logs?limit=1&offset=1`)
      .set('Authorization', `Bearer ${freelancer.token}`)
    expect(page2.status).toBe(200)
    expect(page2.body.auditLogs).toHaveLength(1)
    expect(page2.body.auditLogs[0].action).toBe('SUBMISSION_CREATED')
    expect(page2.body.auditLogs[0].summary).toMatch(/submitted for review/i)
    expect(page2.body.auditLogs[0].actorRole).toBe('FREELANCER')

    const createdTimes = [
      new Date(first.createdAt).getTime(),
      new Date(page2.body.auditLogs[0].createdAt).getTime(),
    ]
    expect(createdTimes[0]).toBeGreaterThanOrEqual(createdTimes[1])
  })

  it('refuses outsiders and allows empty histories', async () => {
    const { client, outsider, projectId } = await createProjectWithFreelancer()

    const denied = await request(app)
      .get(`/api/v1/projects/${projectId}/audit-logs`)
      .set('Authorization', `Bearer ${outsider.token}`)
    expect(denied.status).toBe(403)

    // Fresh project with no submission events still returns an authorized empty page
    // after milestone create (may have zero audit rows depending on milestone create).
    const emptyish = await request(app)
      .get(`/api/v1/projects/${projectId}/audit-logs?limit=20&offset=0`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(emptyish.status).toBe(200)
    expect(Array.isArray(emptyish.body.auditLogs)).toBe(true)
    expect(emptyish.body.pagination).toMatchObject({
      limit: 20,
      offset: 0,
      total: expect.any(Number),
    })
  })
})
