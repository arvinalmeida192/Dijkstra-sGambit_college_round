import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'

const app = createApp()

const sampleTerms = {
  summary: 'Landing page agreement',
  milestones: [
    {
      title: 'Design',
      deliverables: 'Figma file',
      acceptanceCriteria: 'Approved mockups',
      amount: 25000,
      dueDate: '2026-11-15',
      reviewWindowDays: 5,
    },
  ],
  notes: 'Amounts in cents.',
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
    .send({ title: 'Agreement project', description: 'Terms test' })
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

beforeAll(async () => {
  await pool.query('SELECT 1')
})

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await pool.end()
})

describe('Agreements API', () => {
  it('creates v1, lists history, activates after both acceptances', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()

    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: sampleTerms })

    expect(created.status).toBe(201)
    expect(created.body.agreement).toMatchObject({
      projectId,
      version: 1,
      status: 'PROPOSED',
      createdBy: client.user.id,
    })
    expect(created.body.agreement.acceptances).toEqual([])
    expect(created.body.agreement.acceptanceNote).toMatch(/application level/i)

    const clientAccept = await request(app)
      .post(`/api/v1/agreements/${created.body.agreement.id}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({})

    expect(clientAccept.status).toBe(200)
    expect(clientAccept.body.agreement.status).toBe('PROPOSED')
    expect(clientAccept.body.agreement.acceptances).toHaveLength(1)

    const freelancerAccept = await request(app)
      .post(`/api/v1/agreements/${created.body.agreement.id}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({})

    expect(freelancerAccept.status).toBe(200)
    expect(freelancerAccept.body.agreement.status).toBe('ACTIVE')
    expect(freelancerAccept.body.agreement.acceptances).toHaveLength(2)
    expect(freelancerAccept.body.agreement.activatedAt).toBeTruthy()

    const listed = await request(app)
      .get(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)

    expect(listed.status).toBe(200)
    expect(listed.body.agreements).toHaveLength(1)
    expect(listed.body.activeAgreementId).toBe(created.body.agreement.id)
    expect(listed.body.proposedAgreementId).toBeNull()
  })

  it('rejects duplicate acceptance', async () => {
    const { client, projectId } = await createProjectWithFreelancer()

    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: sampleTerms })

    const first = await request(app)
      .post(`/api/v1/agreements/${created.body.agreement.id}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({})
    expect(first.status).toBe(200)

    const dup = await request(app)
      .post(`/api/v1/agreements/${created.body.agreement.id}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({})
    expect(dup.status).toBe(409)
    expect(dup.body.error).toBe('CONFLICT')
  })

  it('keeps ACTIVE unchanged while a proposed change awaits acceptance', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()

    const v1 = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: sampleTerms })
    await request(app)
      .post(`/api/v1/agreements/${v1.body.agreement.id}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({})
    await request(app)
      .post(`/api/v1/agreements/${v1.body.agreement.id}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({})

    const revisedTerms = {
      ...sampleTerms,
      summary: 'Revised scope',
      milestones: [
        {
          ...sampleTerms.milestones[0],
          amount: 40000,
          title: 'Design + revisions',
        },
      ],
    }

    const proposed = await request(app)
      .post(`/api/v1/agreements/${v1.body.agreement.id}/propose-change`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: revisedTerms })

    expect(proposed.status).toBe(201)
    expect(proposed.body.agreement).toMatchObject({
      version: 2,
      status: 'PROPOSED',
      supersedesId: v1.body.agreement.id,
    })

    const activeStill = await request(app)
      .get(`/api/v1/agreements/${v1.body.agreement.id}`)
      .set('Authorization', `Bearer ${freelancer.token}`)
    expect(activeStill.status).toBe(200)
    expect(activeStill.body.agreement.status).toBe('ACTIVE')

    await request(app)
      .post(`/api/v1/agreements/${proposed.body.agreement.id}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({})
    const activated = await request(app)
      .post(`/api/v1/agreements/${proposed.body.agreement.id}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({})

    expect(activated.status).toBe(200)
    expect(activated.body.agreement.status).toBe('ACTIVE')

    const old = await request(app)
      .get(`/api/v1/agreements/${v1.body.agreement.id}`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(old.body.agreement.status).toBe('SUPERSEDED')

    const history = await request(app)
      .get(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(history.body.agreements.map((a) => a.version)).toEqual([2, 1])
    expect(history.body.activeAgreementId).toBe(proposed.body.agreement.id)
  })

  it('withdraws a pending proposal when a newer change is proposed', async () => {
    const { client, freelancer, projectId } = await createProjectWithFreelancer()

    const v1 = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: sampleTerms })
    await request(app)
      .post(`/api/v1/agreements/${v1.body.agreement.id}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({})
    await request(app)
      .post(`/api/v1/agreements/${v1.body.agreement.id}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({})

    const firstProposal = await request(app)
      .post(`/api/v1/agreements/${v1.body.agreement.id}/propose-change`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({
        terms: {
          ...sampleTerms,
          summary: 'Freelancer tweak',
        },
      })
    expect(firstProposal.status).toBe(201)

    const secondProposal = await request(app)
      .post(`/api/v1/agreements/${v1.body.agreement.id}/propose-change`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        terms: {
          ...sampleTerms,
          summary: 'Client counter',
        },
      })
    expect(secondProposal.status).toBe(201)
    expect(secondProposal.body.agreement.version).toBe(3)

    const withdrawn = await request(app)
      .get(`/api/v1/agreements/${firstProposal.body.agreement.id}`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(withdrawn.body.agreement.status).toBe('WITHDRAWN')
  })

  it('rejects create by freelancers and access by strangers', async () => {
    const { client, projectId } = await createProjectWithFreelancer()
    const stranger = await register('CLIENT')
    const freelancerOnly = await register('FREELANCER')

    const byFreelancer = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${freelancerOnly.token}`)
      .send({ terms: sampleTerms })
    expect(byFreelancer.status).toBe(403)

    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: sampleTerms })
    expect(created.status).toBe(201)

    const strangerList = await request(app)
      .get(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${stranger.token}`)
    expect(strangerList.status).toBe(403)

    const strangerAccept = await request(app)
      .post(`/api/v1/agreements/${created.body.agreement.id}/accept`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({})
    expect(strangerAccept.status).toBe(403)
  })

  it('rejects a second create once versions exist', async () => {
    const { client, projectId } = await createProjectWithFreelancer()

    const first = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: sampleTerms })
    expect(first.status).toBe(201)

    const second = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: sampleTerms })
    expect(second.status).toBe(409)
  })

  it('does not activate until a freelancer is assigned', async () => {
    const client = await register('CLIENT')
    const projectRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${client.token}`)
      .send({ title: 'Solo draft', description: '' })
    const projectId = projectRes.body.project.id

    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: sampleTerms })
    expect(created.status).toBe(201)

    const accepted = await request(app)
      .post(`/api/v1/agreements/${created.body.agreement.id}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({})
    expect(accepted.status).toBe(200)
    expect(accepted.body.agreement.status).toBe('PROPOSED')
  })
})
