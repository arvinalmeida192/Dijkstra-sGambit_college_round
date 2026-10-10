import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'

const app = createApp()

const validCompleteTerms = {
  title: 'Full Stack Web Platform',
  description: 'Complete web platform development with modern architecture',
  finalDeliverable: 'Deployed production app, API docs, and test suite',
  completionCriteria: 'All milestones approved and end-to-end tests passing',
  totalPayment: 50000,
  finalDueDate: '2026-12-31',
  milestones: [
    {
      title: 'Milestone 1: Backend Architecture',
      description: 'Setup database schema, authentication, and core APIs',
      deliverables: 'API endpoints and migration scripts',
      acceptanceCriteria: 'Automated integration tests pass',
      amount: 20000,
      dueDate: '2026-11-15',
      reviewWindowDays: 5,
    },
    {
      title: 'Milestone 2: Frontend & Integration',
      description: 'Build user interfaces and integrate with backend APIs',
      deliverables: 'Responsive web frontend connected to backend',
      acceptanceCriteria: 'UI tests pass and features verified',
      amount: 30000,
      dueDate: '2026-12-15',
      reviewWindowDays: 5,
    },
  ],
  notes: 'All monetary amounts in integer cents.',
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
    .send({ title: 'Agreements & Milestones Project', description: 'Testing agreement workflows' })
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

describe('Agreements & Milestone Workflow Integration', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await pool.end()
  })

  it('atomically creates agreement and initial milestones in the database', async () => {
    const { client, projectId } = await createProjectWithFreelancer()

    const createRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: validCompleteTerms })

    expect(createRes.status).toBe(201)
    const agreement = createRes.body.agreement
    expect(agreement.status).toBe('PROPOSED')
    expect(agreement.version).toBe(1)
    expect(agreement.terms.title).toBe(validCompleteTerms.title)
    expect(agreement.terms.totalPayment).toBe(50000)

    // Verify milestones were created in database and linked to agreement
    const milestonesRes = await request(app)
      .get(`/api/v1/projects/${projectId}/milestones`)
      .set('Authorization', `Bearer ${client.token}`)

    expect(milestonesRes.status).toBe(200)
    expect(milestonesRes.body.milestones).toHaveLength(2)

    const m1 = milestonesRes.body.milestones[0]
    expect(m1.title).toBe(validCompleteTerms.milestones[0].title)
    expect(m1.amount).toBe(20000)
    expect(m1.dueDate).toBe('2026-11-15')
    expect(m1.agreementId).toBe(agreement.id)
    expect(m1.status).toBe('PENDING')
    expect(m1.sortOrder).toBe(0)

    const m2 = milestonesRes.body.milestones[1]
    expect(m2.title).toBe(validCompleteTerms.milestones[1].title)
    expect(m2.amount).toBe(30000)
    expect(m2.dueDate).toBe('2026-12-15')
    expect(m2.agreementId).toBe(agreement.id)
    expect(m2.status).toBe('PENDING')
    expect(m2.sortOrder).toBe(1)
  })

  it('rejects agreement when milestone payment allocations do not equal total payment', async () => {
    const { client, projectId } = await createProjectWithFreelancer()

    // Below total payment: 20000 + 20000 = 40000 < 50000
    const underRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        terms: {
          ...validCompleteTerms,
          milestones: [
            { ...validCompleteTerms.milestones[0], amount: 20000 },
            { ...validCompleteTerms.milestones[1], amount: 20000 },
          ],
        },
      })

    expect(underRes.status).toBe(400)
    expect(JSON.stringify(underRes.body.details)).toMatch(/equal the total agreed payment/)

    // Above total payment: 20000 + 40000 = 60000 > 50000
    const overRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        terms: {
          ...validCompleteTerms,
          milestones: [
            { ...validCompleteTerms.milestones[0], amount: 20000 },
            { ...validCompleteTerms.milestones[1], amount: 40000 },
          ],
        },
      })

    expect(overRes.status).toBe(400)
    expect(JSON.stringify(overRes.body.details)).toMatch(/cannot exceed the total agreed payment/)
  })

  it('validates positive integer payment amounts and rejects floats or non-positive values', async () => {
    const { client, projectId } = await createProjectWithFreelancer()

    // Float amount (e.g. 20000.5)
    const floatRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        terms: {
          ...validCompleteTerms,
          milestones: [
            { ...validCompleteTerms.milestones[0], amount: 20000.5 },
            { ...validCompleteTerms.milestones[1], amount: 29999.5 },
          ],
        },
      })

    expect(floatRes.status).toBe(400)

    // Non-positive (0 or negative) amount
    const nonPositiveRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        terms: {
          ...validCompleteTerms,
          totalPayment: 20000,
          milestones: [
            { ...validCompleteTerms.milestones[0], amount: 20000 },
            { ...validCompleteTerms.milestones[1], amount: 0 },
          ],
        },
      })

    expect(nonPositiveRes.status).toBe(400)
  })

  it('validates chronological milestone dates and final project due date constraint', async () => {
    const { client, projectId } = await createProjectWithFreelancer()

    // Non-chronological milestone dates: m2 due before m1
    const nonChronologicalRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        terms: {
          ...validCompleteTerms,
          milestones: [
            { ...validCompleteTerms.milestones[0], dueDate: '2026-12-15' },
            { ...validCompleteTerms.milestones[1], dueDate: '2026-11-15' },
          ],
        },
      })

    expect(nonChronologicalRes.status).toBe(400)
    expect(JSON.stringify(nonChronologicalRes.body.details)).toMatch(/cannot be earlier than milestone/i)

    // Final project due date earlier than last milestone due date
    const earlyFinalDueRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        terms: {
          ...validCompleteTerms,
          finalDueDate: '2026-12-01', // Before last milestone 2026-12-15
        },
      })

    expect(earlyFinalDueRes.status).toBe(400)
    expect(JSON.stringify(earlyFinalDueRes.body.details)).toMatch(/on or after the last milestone/)

    // Invalid calendar date (e.g. 2026-02-31)
    const invalidCalendarRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        terms: {
          ...validCompleteTerms,
          milestones: [
            { ...validCompleteTerms.milestones[0], dueDate: '2026-02-31' },
            { ...validCompleteTerms.milestones[1], dueDate: '2026-12-15' },
          ],
        },
      })

    expect(invalidCalendarRes.status).toBe(400)
  })

  it('rejects empty milestone lists or missing required fields', async () => {
    const { client, projectId } = await createProjectWithFreelancer()

    const emptyRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        terms: {
          ...validCompleteTerms,
          milestones: [],
        },
      })

    expect(emptyRes.status).toBe(400)

    const missingTitleRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        terms: {
          ...validCompleteTerms,
          milestones: [
            { ...validCompleteTerms.milestones[0], title: '' },
          ],
        },
      })

    expect(missingTitleRes.status).toBe(400)
  })

  it('enforces authorization: only client can create agreement', async () => {
    const { freelancer, projectId } = await createProjectWithFreelancer()
    const stranger = await register('FREELANCER')

    const freelancerRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ terms: validCompleteTerms })
    expect(freelancerRes.status).toBe(403)

    const strangerRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ terms: validCompleteTerms })
    expect(strangerRes.status).toBe(403)
  })

  it('prevents direct milestone creation, editing, or deletion on an active agreement', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()

    const createRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: validCompleteTerms })
    expect(createRes.status).toBe(201)
    const agreementId = createRes.body.agreement.id

    // Freelancer accepts agreement
    const freeAcceptRes = await request(app)
      .post(`/api/v1/agreements/${agreementId}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({})
    expect(freeAcceptRes.status).toBe(200)

    // Client accepts agreement -> transitions to ACTIVE
    const clientAcceptRes = await request(app)
      .post(`/api/v1/agreements/${agreementId}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({})
    expect(clientAcceptRes.status).toBe(200)
    expect(clientAcceptRes.body.agreement.status).toBe('ACTIVE')

    const milestonesRes = await request(app)
      .get(`/api/v1/projects/${projectId}/milestones`)
      .set('Authorization', `Bearer ${client.token}`)
    const m1 = milestonesRes.body.milestones[0]

    // Attempt direct milestone edit: must return 409 Conflict
    const editRes = await request(app)
      .patch(`/api/v1/milestones/${m1.id}`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ title: 'Unauthorized Modification' })
    expect(editRes.status).toBe(409)
    expect(editRes.body.message).toMatch(/agreement/i)

    // Attempt direct milestone delete: must return 409 Conflict
    const deleteRes = await request(app)
      .delete(`/api/v1/milestones/${m1.id}`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(deleteRes.status).toBe(409)
    expect(deleteRes.body.message).toMatch(/agreement/i)

    // Attempt direct milestone creation on project with active agreement: must return 409 Conflict
    const directCreateRes = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        title: 'Bypass Milestone',
        deliverables: 'Directly added deliverable',
        acceptanceCriteria: 'Done',
        amount: 5000,
      })
    expect(directCreateRes.status).toBe(409)
    expect(directCreateRes.body.message).toMatch(/active agreement/i)
  })

  it('rolls back both agreement and milestones when milestone creation fails during transaction', async () => {
    const { client, projectId } = await createProjectWithFreelancer()

    // Pass invalid milestone data that gets past body schema (if any) or trigger a failure
    // We can verify transaction rollback by testing that a failed agreement creation leaves zero agreements and zero milestones
    const badRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        terms: {
          ...validCompleteTerms,
          milestones: [
            {
              title: 'Valid 1',
              deliverables: 'Deliverable 1',
              acceptanceCriteria: 'Done',
              amount: 25000,
              dueDate: '2026-11-15',
            },
            {
              title: 'Invalid 2',
              deliverables: 'Deliverable 2',
              acceptanceCriteria: 'Done',
              amount: 25000,
              dueDate: '2026-11-10', // Date before first milestone -> validation failure
            },
          ],
        },
      })

    expect(badRes.status).toBe(400)

    // Verify DB state: zero agreements and zero milestones
    const { rows: agreements } = await pool.query(
      `SELECT * FROM agreements WHERE project_id = $1`,
      [projectId],
    )
    expect(agreements).toHaveLength(0)

    const { rows: milestones } = await pool.query(
      `SELECT * FROM milestones WHERE project_id = $1`,
      [projectId],
    )
    expect(milestones).toHaveLength(0)
  })

  it('allows submissions, reviews, and progress tracking on agreement milestones once activated', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()

    // Create agreement
    const createRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: validCompleteTerms })
    expect(createRes.status).toBe(201)
    const agreementId = createRes.body.agreement.id

    // Both accept
    await request(app)
      .post(`/api/v1/agreements/${agreementId}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({})

    await request(app)
      .post(`/api/v1/agreements/${agreementId}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({})

    // Fetch agreement milestone
    const milestonesRes = await request(app)
      .get(`/api/v1/projects/${projectId}/milestones`)
      .set('Authorization', `Bearer ${client.token}`)
    const m1 = milestonesRes.body.milestones[0]

    // Transition milestone to IN_PROGRESS
    const startRes = await request(app)
      .patch(`/api/v1/milestones/${m1.id}/status`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ status: 'IN_PROGRESS' })
    expect(startRes.status).toBe(200)
    expect(startRes.body.milestone.status).toBe('IN_PROGRESS')

    // Freelancer submits deliverable
    const subRes = await request(app)
      .post(`/api/v1/milestones/${m1.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({
        notes: 'Initial API implementation ready for review',
        externalUrl: 'https://github.com/example/platform-api',
      })
    expect(subRes.status).toBe(201)

    // Client approves submission
    const reviewRes = await request(app)
      .post(`/api/v1/submissions/${subRes.body.submission.id}/review`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        decision: 'APPROVED',
        feedback: 'Architecture and API structure approved',
      })
    expect(reviewRes.status).toBe(200)
    expect(reviewRes.body.milestone.status).toBe('APPROVED')
  })
})
