import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'
import { env } from '../../src/config/env.js'
import jwt from 'jsonwebtoken'

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
  const token = jwt.sign(
    { role: user.role },
    env.jwtSecret,
    { subject: user.id, expiresIn: '1h' },
  )
  return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } }
}

async function setupProject() {
  const client = await register('CLIENT')
  const freelancer = await register('FREELANCER')
  const outsider = await register('CLIENT')
  const arbitrator = await createArbitrator()

  const projectRes = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${client.token}`)
    .send({ title: 'Dispute project', description: 'Case study' })
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

  const mRes = await request(app)
    .post(`/api/v1/projects/${projectId}/milestones`)
    .set('Authorization', `Bearer ${client.token}`)
    .send({
      title: 'Build',
      deliverables: 'Feature',
      acceptanceCriteria: 'Works',
      amount: 10000,
    })
  expect(mRes.status).toBe(201)
  const milestone = mRes.body.milestone

  const startRes = await request(app)
    .patch(`/api/v1/milestones/${milestone.id}/status`)
    .set('Authorization', `Bearer ${client.token}`)
    .send({ status: 'IN_PROGRESS' })
  expect(startRes.status).toBe(200)

  return {
    client,
    freelancer,
    outsider,
    arbitrator,
    projectId,
    milestone: startRes.body.milestone ?? { ...milestone, status: 'IN_PROGRESS' },
  }
}

beforeAll(async () => {
  await pool.query('SELECT 1')
})

beforeEach(async () => {
  await resetDb()
})

describe('disputes API', () => {
  it('opens a dispute, stores private evidence, and blocks outsiders', async () => {
    const ctx = await setupProject()

    const openRes = await request(app)
      .post(`/api/v1/milestones/${ctx.milestone.id}/disputes`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({
        reason: 'Deliverable incomplete',
        claimSummary: 'Missing acceptance criteria items',
      })
    expect(openRes.status).toBe(201)
    expect(openRes.body.dispute.status).toBe('OPEN')
    expect(openRes.body.dispute.fundsMovedByDecision).toBe(false)
    expect(openRes.body.milestone.status).toBe('DISPUTED')
    expect(openRes.body.notice).toMatch(/do not move escrow/i)

    const disputeId = openRes.body.dispute.id

    const dup = await request(app)
      .post(`/api/v1/milestones/${ctx.milestone.id}/disputes`)
      .set('Authorization', `Bearer ${ctx.freelancer.token}`)
      .send({ reason: 'Second attempt' })
    expect(dup.status).toBe(409)

    const evidenceRes = await request(app)
      .post(`/api/v1/disputes/${disputeId}/evidence`)
      .set('Authorization', `Bearer ${ctx.freelancer.token}`)
      .field('notes', 'Screenshot of chat')
      .attach('file', Buffer.from('evidence-bytes'), {
        filename: 'chat.txt',
        contentType: 'text/plain',
      })
    expect(evidenceRes.status).toBe(201)
    expect(evidenceRes.body.evidence.hasFile).toBe(true)
    expect(evidenceRes.body.evidence.sha256Hash).toMatch(/^[a-f0-9]{64}$/)
    expect(evidenceRes.body.evidence).not.toHaveProperty('fileRef')

    const evidenceId = evidenceRes.body.evidence.id

    const dlOk = await request(app)
      .get(`/api/v1/disputes/evidence/${evidenceId}/file`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
    expect(dlOk.status).toBe(200)
    expect(dlOk.headers['cache-control']).toMatch(/private/)
    expect(dlOk.text).toBe('evidence-bytes')

    const dlOut = await request(app)
      .get(`/api/v1/disputes/evidence/${evidenceId}/file`)
      .set('Authorization', `Bearer ${ctx.outsider.token}`)
    expect(dlOut.status).toBe(403)

    const listOut = await request(app)
      .get(`/api/v1/projects/${ctx.projectId}/disputes`)
      .set('Authorization', `Bearer ${ctx.outsider.token}`)
    expect(listOut.status).toBe(403)
  })

  it('allows arbitrator claim + decision without moving funds', async () => {
    const ctx = await setupProject()

    const openRes = await request(app)
      .post(`/api/v1/milestones/${ctx.milestone.id}/disputes`)
      .set('Authorization', `Bearer ${ctx.freelancer.token}`)
      .send({ reason: 'Unfair rejection of work' })
    expect(openRes.status).toBe(201)
    const disputeId = openRes.body.dispute.id

    const clientClaim = await request(app)
      .post(`/api/v1/disputes/${disputeId}/claim`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
    expect(clientClaim.status).toBe(403)

    const claimRes = await request(app)
      .post(`/api/v1/disputes/${disputeId}/claim`)
      .set('Authorization', `Bearer ${ctx.arbitrator.token}`)
    expect(claimRes.status).toBe(200)
    expect(claimRes.body.dispute.status).toBe('UNDER_REVIEW')
    expect(claimRes.body.dispute.arbitratorId).toBe(ctx.arbitrator.user.id)

    const decideRes = await request(app)
      .post(`/api/v1/disputes/${disputeId}/decide`)
      .set('Authorization', `Bearer ${ctx.arbitrator.token}`)
      .send({
        decision: 'RELEASE_TO_FREELANCER',
        rationale: 'Deliverable meets acceptance criteria.',
      })
    expect(decideRes.status).toBe(200)
    expect(decideRes.body.dispute.status).toBe('RESOLVED')
    expect(decideRes.body.dispute.decision).toBe('RELEASE_TO_FREELANCER')
    expect(decideRes.body.dispute.fundsMovedByDecision).toBe(false)
    expect(decideRes.body.milestone.status).toBe('APPROVED')
    expect(decideRes.body.notice).toMatch(/does not move escrow/i)

    const afterEvidence = await request(app)
      .post(`/api/v1/disputes/${disputeId}/evidence`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({ notes: 'Too late' })
    expect(afterEvidence.status).toBe(409)
  })

  it('requires split amount and rejects invalid transitions', async () => {
    const ctx = await setupProject()

    const openRes = await request(app)
      .post(`/api/v1/milestones/${ctx.milestone.id}/disputes`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({ reason: 'Partial delivery' })
    expect(openRes.status).toBe(201)
    const disputeId = openRes.body.dispute.id

    await request(app)
      .post(`/api/v1/disputes/${disputeId}/claim`)
      .set('Authorization', `Bearer ${ctx.arbitrator.token}`)

    const missingSplit = await request(app)
      .post(`/api/v1/disputes/${disputeId}/decide`)
      .set('Authorization', `Bearer ${ctx.arbitrator.token}`)
      .send({
        decision: 'SPLIT',
        rationale: 'Half each',
      })
    expect(missingSplit.status).toBe(400)

    const overSplit = await request(app)
      .post(`/api/v1/disputes/${disputeId}/decide`)
      .set('Authorization', `Bearer ${ctx.arbitrator.token}`)
      .send({
        decision: 'SPLIT',
        rationale: 'Too much',
        splitReleaseToFreelancer: 999999,
      })
    expect(overSplit.status).toBe(409)

    const ok = await request(app)
      .post(`/api/v1/disputes/${disputeId}/decide`)
      .set('Authorization', `Bearer ${ctx.arbitrator.token}`)
      .send({
        decision: 'SPLIT',
        rationale: 'Half to freelancer',
        splitReleaseToFreelancer: 5000,
      })
    expect(ok.status).toBe(200)
    expect(ok.body.dispute.splitReleaseToFreelancer).toBe(5000)
    expect(ok.body.milestone.status).toBe('IN_REVIEW')
    expect(ok.body.dispute.fundsMovedByDecision).toBe(false)
  })
})
