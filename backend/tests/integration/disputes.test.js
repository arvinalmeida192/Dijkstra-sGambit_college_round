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

  it('resolves dispute with RESUME_EXISTING and allows work and submissions to resume', async () => {
    const ctx = await setupProject()

    // 1. Open dispute
    const openRes = await request(app)
      .post(`/api/v1/milestones/${ctx.milestone.id}/disputes`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({ reason: 'Scope alignment needed' })
    expect(openRes.status).toBe(201)
    const disputeId = openRes.body.dispute.id
    expect(openRes.body.milestone.status).toBe('DISPUTED')

    // 2. Client cannot change milestone status directly while DISPUTED
    const directChange = await request(app)
      .patch(`/api/v1/milestones/${ctx.milestone.id}/status`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({ status: 'IN_PROGRESS' })
    expect(directChange.status).toBe(409)

    // 3. Non-arbitrator cannot resolve via arbitrator endpoint
    const clientResolve = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({
        outcome: 'RESUME_EXISTING',
        summary: 'Try resolving',
      })
    expect(clientResolve.status).toBe(403)

    // 4. Arbitrator resolves dispute with RESUME_EXISTING
    const resolveRes = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${ctx.arbitrator.token}`)
      .send({
        outcome: 'RESUME_EXISTING',
        summary: 'Both parties agree on scope; work may resume.',
      })
    expect(resolveRes.status).toBe(200)
    expect(resolveRes.body.dispute.status).toBe('RESOLVED')
    expect(resolveRes.body.dispute.resolutionOutcome).toBe('RESUME_EXISTING')
    expect(resolveRes.body.dispute.resolutionType).toBe('ARBITRATOR_DECISION')
    expect(resolveRes.body.dispute.resolutionSummary).toBe(
      'Both parties agree on scope; work may resume.',
    )
    expect(resolveRes.body.dispute.resolvedBy).toBe(ctx.arbitrator.user.id)
    expect(resolveRes.body.dispute.resolvedAt).toBeDefined()
    expect(resolveRes.body.dispute.fundsMovedByDecision).toBe(false)
    expect(resolveRes.body.milestone.status).toBe('IN_PROGRESS')

    // 5. Duplicate resolution rejected
    const dupResolve = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${ctx.arbitrator.token}`)
      .send({
        outcome: 'RESUME_EXISTING',
        summary: 'Duplicate call',
      })
    expect(dupResolve.status).toBe(409)

    // 6. Resumed submission workflow: Freelancer submits deliverable
    const subRes = await request(app)
      .post(`/api/v1/milestones/${ctx.milestone.id}/submissions`)
      .set('Authorization', `Bearer ${ctx.freelancer.token}`)
      .field('notes', 'Completed feature after dispute')
      .attach('file', Buffer.from('deliverable-content'), {
        filename: 'feature.zip',
        contentType: 'application/zip',
      })
    expect(subRes.status).toBe(201)
    expect(subRes.body.submission.revision).toBe(1)
    expect(subRes.body.milestone.status).toBe('SUBMITTED')

    // 7. Client reviews and approves resumed submission
    const reviewRes = await request(app)
      .post(`/api/v1/submissions/${subRes.body.submission.id}/review`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({
        decision: 'APPROVED',
        feedback: 'Looks good!',
      })
    expect(reviewRes.status).toBe(200)
    expect(reviewRes.body.milestone.status).toBe('APPROVED')
  })

  it('supports mutual resolution: propose, reject self-accept, accept by counterparty', async () => {
    const ctx = await setupProject()

    const openRes = await request(app)
      .post(`/api/v1/milestones/${ctx.milestone.id}/disputes`)
      .set('Authorization', `Bearer ${ctx.freelancer.token}`)
      .send({ reason: 'Disagreement on acceptance test' })
    expect(openRes.status).toBe(201)
    const disputeId = openRes.body.dispute.id

    // Outsider cannot propose resolution
    const outsiderPropose = await request(app)
      .post(`/api/v1/disputes/${disputeId}/propose-resolution`)
      .set('Authorization', `Bearer ${ctx.outsider.token}`)
      .send({
        outcome: 'RESUME_EXISTING',
        summary: 'Outsider proposal',
      })
    expect(outsiderPropose.status).toBe(403)

    // Client proposes mutual resolution
    const proposeRes = await request(app)
      .post(`/api/v1/disputes/${disputeId}/propose-resolution`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({
        outcome: 'RESUME_WITH_CHANGES',
        summary: 'Mutually agreed to revise criteria and resume.',
      })
    expect(proposeRes.status).toBe(200)
    expect(proposeRes.body.dispute.resolutionProposal.outcome).toBe(
      'RESUME_WITH_CHANGES',
    )
    expect(proposeRes.body.dispute.resolutionProposal.proposedBy).toBe(
      ctx.client.user.id,
    )

    // Proposer cannot accept their own proposal
    const selfAccept = await request(app)
      .post(`/api/v1/disputes/${disputeId}/accept-resolution`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
    expect(selfAccept.status).toBe(403)

    // Counterparty (freelancer) accepts proposal
    const acceptRes = await request(app)
      .post(`/api/v1/disputes/${disputeId}/accept-resolution`)
      .set('Authorization', `Bearer ${ctx.freelancer.token}`)
    expect(acceptRes.status).toBe(200)
    expect(acceptRes.body.dispute.status).toBe('RESOLVED')
    expect(acceptRes.body.dispute.resolutionType).toBe('MUTUAL_AGREEMENT')
    expect(acceptRes.body.dispute.resolutionOutcome).toBe('RESUME_WITH_CHANGES')
    expect(acceptRes.body.dispute.resolutionProposal).toBeNull()
    expect(acceptRes.body.milestone.status).toBe('IN_PROGRESS')
  })

  it('resolves dispute with TERMINATE_WORK and blocks further submissions', async () => {
    const ctx = await setupProject()

    const openRes = await request(app)
      .post(`/api/v1/milestones/${ctx.milestone.id}/disputes`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({ reason: 'Irreconcilable differences' })
    expect(openRes.status).toBe(201)
    const disputeId = openRes.body.dispute.id

    // Upload evidence before resolution
    const evRes = await request(app)
      .post(`/api/v1/disputes/${disputeId}/evidence`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({ notes: 'Initial evidence before termination' })
    expect(evRes.status).toBe(201)

    // Arbitrator resolves with TERMINATE_WORK
    const resolveRes = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${ctx.arbitrator.token}`)
      .send({
        outcome: 'TERMINATE_WORK',
        summary: 'Parties agree to terminate work on this milestone.',
      })
    expect(resolveRes.status).toBe(200)
    expect(resolveRes.body.dispute.status).toBe('RESOLVED')
    expect(resolveRes.body.dispute.resolutionOutcome).toBe('TERMINATE_WORK')
    expect(resolveRes.body.milestone.status).toBe('CANCELLED')

    // Further submissions on CANCELLED milestone must be blocked
    const subFail = await request(app)
      .post(`/api/v1/milestones/${ctx.milestone.id}/submissions`)
      .set('Authorization', `Bearer ${ctx.freelancer.token}`)
      .send({ notes: 'Attempting to submit after termination' })
    expect(subFail.status).toBe(409)

    // Dispute history and evidence remain accessible
    const getRes = await request(app)
      .get(`/api/v1/disputes/${disputeId}`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
    expect(getRes.status).toBe(200)
    expect(getRes.body.dispute.status).toBe('RESOLVED')
    expect(getRes.body.dispute.resolutionOutcome).toBe('TERMINATE_WORK')
    expect(getRes.body.dispute.evidence).toHaveLength(1)
  })
})
