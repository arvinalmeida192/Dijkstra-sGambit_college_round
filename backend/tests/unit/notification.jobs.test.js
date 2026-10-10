import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'
import { runNotificationJobs } from '../../src/modules/notifications/notification.jobs.js'

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
  return res.body
}

async function setupActiveMilestone({ dueDate, status = 'IN_PROGRESS' }) {
  const client = await register('CLIENT')
  const freelancer = await register('FREELANCER')
  const projectRes = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${client.token}`)
    .send({ title: 'Notify project', description: 'Jobs' })
  const projectId = projectRes.body.project.id
  const invite = await request(app)
    .post(`/api/v1/projects/${projectId}/invitations`)
    .set('Authorization', `Bearer ${client.token}`)
    .send({})
  await request(app)
    .post(`/api/v1/invitations/${invite.body.invitation.token}/accept`)
    .set('Authorization', `Bearer ${freelancer.token}`)

  const mRes = await request(app)
    .post(`/api/v1/projects/${projectId}/milestones`)
    .set('Authorization', `Bearer ${client.token}`)
    .send({
      title: 'Due soon',
      deliverables: 'Work',
      acceptanceCriteria: 'Done',
      amount: 1000,
      dueDate,
    })
  expect(mRes.status).toBe(201)
  const milestoneId = mRes.body.milestone.id

  if (status !== 'PENDING') {
    const start = await request(app)
      .patch(`/api/v1/milestones/${milestoneId}/status`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ status: 'IN_PROGRESS' })
    expect(start.status).toBe(200)
  }

  // Ensure project is ACTIVE (accept invite should have done this)
  await pool.query(`UPDATE projects SET status = 'ACTIVE' WHERE id = $1`, [
    projectId,
  ])

  return { client, freelancer, projectId, milestoneId }
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

describe('notification jobs', () => {
  it('creates deadline notifications and is idempotent on repeat', async () => {
    const past = '2020-01-01'
    const { client } = await setupActiveMilestone({ dueDate: past })

    const first = await runNotificationJobs({
      now: new Date('2026-10-10T12:00:00.000Z'),
      deadlineWarnDays: 3,
      inactivityDays: 7,
    })
    expect(first.created).toBeGreaterThanOrEqual(1)

    const second = await runNotificationJobs({
      now: new Date('2026-10-10T12:00:00.000Z'),
      deadlineWarnDays: 3,
      inactivityDays: 7,
    })
    expect(second.created).toBe(0)
    expect(second.skipped).toBeGreaterThanOrEqual(first.created)

    const list = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${client.token}`)
    expect(list.status).toBe(200)
    expect(
      list.body.notifications.some((n) => n.kind === 'DEADLINE_PASSED'),
    ).toBe(true)
    expect(list.body.notice).toMatch(/deterministic/i)
  })
})
