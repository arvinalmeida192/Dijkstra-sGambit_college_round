import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'
import { env } from '../../src/config/env.js'
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
  return { token: res.body.token, user: res.body.user }
}

async function createArbitrator() {
  const email = `arb-${Math.random().toString(16).slice(2)}@example.com`
  const passwordHash = await bcrypt.hash('password123', 4)
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'ARBITRATOR')
     RETURNING id, name, email, role`,
    ['Arbiter', email, passwordHash],
  )
  const user = rows[0]
  const token = jwt.sign({ role: user.role }, env.jwtSecret, {
    subject: user.id,
    expiresIn: '1h',
  })
  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  }
}

async function setupProject(milestoneOverrides = {}) {
  const client = await register('CLIENT')
  const freelancer = await register('FREELANCER')
  const outsider = await register('CLIENT')
  const arbitrator = await createArbitrator()

  const projectRes = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${client.token}`)
    .send({ title: 'Protection project', description: 'Safeguards' })
  expect(projectRes.status).toBe(201)
  const projectId = projectRes.body.project.id

  const inviteRes = await request(app)
    .post(`/api/v1/projects/${projectId}/invitations`)
    .set('Authorization', `Bearer ${client.token}`)
    .send({})
  await request(app)
    .post(`/api/v1/invitations/${inviteRes.body.invitation.token}/accept`)
    .set('Authorization', `Bearer ${freelancer.token}`)

  const mRes = await request(app)
    .post(`/api/v1/projects/${projectId}/milestones`)
    .set('Authorization', `Bearer ${client.token}`)
    .send({
      title: 'Build',
      deliverables: 'Feature',
      acceptanceCriteria: 'Criterion A\nCriterion B',
      amount: 10000,
      dueDate: '2020-01-01',
      reviewWindowDays: 3,
      gracePeriodDays: 2,
      maxRevisions: 2,
      ...milestoneOverrides,
    })
  expect(mRes.status).toBe(201)
  const milestone = mRes.body.milestone

  const start = await request(app)
    .patch(`/api/v1/milestones/${milestone.id}/status`)
    .set('Authorization', `Bearer ${client.token}`)
    .send({ status: 'IN_PROGRESS' })
  expect(start.status).toBe(200)

  await pool.query(`UPDATE projects SET status = 'ACTIVE' WHERE id = $1`, [
    projectId,
  ])

  return {
    client,
    freelancer,
    outsider,
    arbitrator,
    projectId,
    milestone: start.body.milestone,
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

describe('Participant protection', () => {
  it('marks OVERDUE after grace and allows client cancel/reclaim; blocks with dispute', async () => {
    const { client, freelancer, projectId, milestone } = await setupProject()

    const first = await runNotificationJobs({
      now: new Date('2026-10-10T12:00:00.000Z'),
      deadlineWarnDays: 3,
      inactivityDays: 7,
    })
    expect(first.created).toBeGreaterThanOrEqual(1)

    const get = await request(app)
      .get(`/api/v1/milestones/${milestone.id}`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(get.status).toBe(200)
    expect(get.body.milestone.status).toBe('OVERDUE')
    expect(get.body.milestone.nextAction).toMatch(/cancel and reclaim/i)

    const cancel = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/cancel-and-reclaim`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ reason: 'No delivery after grace' })
    expect(cancel.status).toBe(200)
    expect(cancel.body.milestone.status).toBe('CANCELLED')
    expect(cancel.body.milestone.escalationStatus).toBe('CANCELLED_RECLAIMED')

    // Fresh overdue + open dispute blocks reclaim
    const again = await setupProject()
    await runNotificationJobs({
      now: new Date('2026-10-10T12:00:00.000Z'),
      deadlineWarnDays: 3,
      inactivityDays: 7,
    })
    const dispute = await request(app)
      .post(`/api/v1/milestones/${again.milestone.id}/disputes`)
      .set('Authorization', `Bearer ${again.freelancer.token}`)
      .send({ reason: 'Contesting overdue cancel' })
    expect(dispute.status).toBe(201)

    const blocked = await request(app)
      .post(`/api/v1/milestones/${again.milestone.id}/cancel-and-reclaim`)
      .set('Authorization', `Bearer ${again.client.token}`)
      .send({})
    expect(blocked.status).toBe(409)
    expect(blocked.body.message).toMatch(/dispute/i)

    // Unauthorized role refused
    const outsiderCancel = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/cancel-and-reclaim`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({})
    expect(outsiderCancel.status).toBe(403)

    const audit = await request(app)
      .get(`/api/v1/projects/${projectId}/audit-logs`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(audit.status).toBe(200)
    const actions = audit.body.auditLogs.map((a) => a.action)
    expect(actions).toEqual(
      expect.arrayContaining([
        'OVERDUE_DECLARED',
        'MILESTONE_CANCELLED_RECLAIMED',
      ]),
    )
  })

  it('auto-approves after review window and is idempotent; dispute blocks auto-approve', async () => {
    const { client, freelancer, milestone } = await setupProject({
      dueDate: '2026-12-01',
    })

    const submit = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ notes: 'Deliverable ready' })
    expect(submit.status).toBe(201)
    expect(submit.body.milestone.status).toBe('SUBMITTED')
    expect(submit.body.milestone.reviewDueAt).toBeTruthy()

    // Force review window expired
    await pool.query(
      `UPDATE milestones SET review_due_at = $2 WHERE id = $1`,
      [milestone.id, new Date('2020-01-01T00:00:00.000Z')],
    )

    const first = await runNotificationJobs({
      now: new Date('2026-10-10T12:00:00.000Z'),
      deadlineWarnDays: 3,
      inactivityDays: 7,
    })
    expect(first.created).toBeGreaterThanOrEqual(1)

    const approved = await request(app)
      .get(`/api/v1/milestones/${milestone.id}`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(approved.body.milestone.status).toBe('APPROVED')
    expect(approved.body.milestone.escalationStatus).toBe('AUTO_APPROVED')

    await runNotificationJobs({
      now: new Date('2026-10-10T12:00:00.000Z'),
      deadlineWarnDays: 3,
      inactivityDays: 7,
    })
    // Idempotent: still APPROVED / AUTO_APPROVED after a second job run
    const stillApproved = await request(app)
      .get(`/api/v1/milestones/${milestone.id}`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(stillApproved.body.milestone.status).toBe('APPROVED')
    expect(stillApproved.body.milestone.escalationStatus).toBe('AUTO_APPROVED')

    // Dispute freeze: submitted + open dispute must not auto-approve
    const frozen = await setupProject({ dueDate: '2026-12-01' })
    const sub = await request(app)
      .post(`/api/v1/milestones/${frozen.milestone.id}/submissions`)
      .set('Authorization', `Bearer ${frozen.freelancer.token}`)
      .send({ notes: 'Work' })
    expect(sub.status).toBe(201)
    await pool.query(
      `UPDATE milestones SET review_due_at = $2 WHERE id = $1`,
      [frozen.milestone.id, new Date('2020-01-01T00:00:00.000Z')],
    )
    const dispute = await request(app)
      .post(`/api/v1/milestones/${frozen.milestone.id}/disputes`)
      .set('Authorization', `Bearer ${frozen.client.token}`)
      .send({ reason: 'Quality concern before auto-approve' })
    expect(dispute.status).toBe(201)

    await runNotificationJobs({
      now: new Date('2026-10-10T12:00:00.000Z'),
      deadlineWarnDays: 3,
      inactivityDays: 7,
    })
    const still = await request(app)
      .get(`/api/v1/milestones/${frozen.milestone.id}`)
      .set('Authorization', `Bearer ${frozen.client.token}`)
    expect(still.body.milestone.status).toBe('DISPUTED')
  })

  it('supports extension propose / accept / reject', async () => {
    const { client, freelancer, outsider, milestone } = await setupProject()

    const propose = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/extensions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ newDueDate: '2026-12-15', reason: 'Blocked on asset delivery' })
    expect(propose.status).toBe(201)
    expect(propose.body.extension.status).toBe('PROPOSED')

    const unauthorized = await request(app)
      .post(
        `/api/v1/milestones/${milestone.id}/extensions/${propose.body.extension.id}/respond`,
      )
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ decision: 'ACCEPT' })
    expect([403, 404]).toContain(unauthorized.status)

    const reject = await request(app)
      .post(
        `/api/v1/milestones/${milestone.id}/extensions/${propose.body.extension.id}/respond`,
      )
      .set('Authorization', `Bearer ${client.token}`)
      .send({ decision: 'REJECT', responseNote: 'Not enough justification' })
    expect(reject.status).toBe(200)
    expect(reject.body.extension.status).toBe('REJECTED')

    const propose2 = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/extensions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ newDueDate: '2026-12-20', reason: 'Revised plan attached' })
    expect(propose2.status).toBe(201)

    // Mark overdue first so accept can clear it
    await pool.query(`UPDATE milestones SET status = 'OVERDUE' WHERE id = $1`, [
      milestone.id,
    ])

    const accept = await request(app)
      .post(
        `/api/v1/milestones/${milestone.id}/extensions/${propose2.body.extension.id}/respond`,
      )
      .set('Authorization', `Bearer ${client.token}`)
      .send({ decision: 'ACCEPT' })
    expect(accept.status).toBe(200)
    expect(accept.body.extension.status).toBe('ACCEPTED')
    expect(accept.body.milestone.dueDate).toBe('2026-12-20')
    expect(accept.body.milestone.status).toBe('IN_PROGRESS')
  })

  it('requires unmet criteria on revision and blocks past max revisions', async () => {
    const { client, freelancer, milestone } = await setupProject({
      dueDate: '2026-12-01',
      maxRevisions: 1,
    })

    const v1 = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ notes: 'v1' })
    expect(v1.status).toBe(201)

    const noCriteria = await request(app)
      .post(`/api/v1/submissions/${v1.body.submission.id}/review`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ decision: 'REVISION_REQUESTED', feedback: 'Fix it' })
    expect(noCriteria.status).toBe(400)

    const badCriterion = await request(app)
      .post(`/api/v1/submissions/${v1.body.submission.id}/review`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        decision: 'REVISION_REQUESTED',
        feedback: 'Fix it',
        unmetCriteria: ['Not a real criterion'],
      })
    expect(badCriterion.status).toBe(409)

    const revise = await request(app)
      .post(`/api/v1/submissions/${v1.body.submission.id}/review`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        decision: 'REVISION_REQUESTED',
        feedback: 'Criterion A missing',
        unmetCriteria: ['Criterion A'],
      })
    expect(revise.status).toBe(200)

    const v2 = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ notes: 'v2' })
    expect(v2.status).toBe(201)

    const atLimit = await request(app)
      .post(`/api/v1/submissions/${v2.body.submission.id}/review`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        decision: 'REVISION_REQUESTED',
        feedback: 'Still incomplete',
        unmetCriteria: ['Criterion B'],
      })
    expect(atLimit.status).toBe(409)
    expect(atLimit.body.message).toMatch(/revision/i)

    // Freelancer still cannot approve
    const selfApprove = await request(app)
      .patch(`/api/v1/milestones/${milestone.id}/status`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ status: 'APPROVED' })
    expect(selfApprove.status).toBe(403)
  })

  it('returns operator_not_configured for execute endpoints without chain key', async () => {
    const { client, freelancer, outsider, milestone } = await setupProject({
      dueDate: '2026-12-01',
    })

    await pool.query(
      `UPDATE milestones SET status = 'APPROVED', escalation_status = 'AUTO_APPROVED' WHERE id = $1`,
      [milestone.id],
    )

    const auto = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/execute-auto-release`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({})
    expect(auto.status).toBe(200)
    expect(auto.body.submitted).toBe(false)
    expect(auto.body.reason).toBe('operator_not_configured')

    await pool.query(
      `UPDATE milestones SET status = 'CANCELLED', escalation_status = 'CANCELLED_RECLAIMED' WHERE id = $1`,
      [milestone.id],
    )
    const reclaim = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/execute-reclaim`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({})
    expect(reclaim.status).toBe(200)
    expect(reclaim.body.submitted).toBe(false)

    const forbiddenReclaim = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/execute-reclaim`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({})
    expect(forbiddenReclaim.status).toBe(403)

    const outsiderAuto = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/execute-auto-release`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({})
    expect([403, 404]).toContain(outsiderAuto.status)
  })
})
