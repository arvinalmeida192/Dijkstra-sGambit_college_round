import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'
import { env } from '../../src/config/env.js'
import { setDefaultAdapter } from '../../src/modules/ai/ai.adapter.js'

const app = createApp()

function mockAdapter({
  available = true,
  models = ['qwen3:1.7b', 'gemma3:1b', 'qwen2.5-coder:1.5b'],
  responses = {},
} = {}) {
  return {
    async isAvailable() {
      return available
    },
    async listModels() {
      return models
    },
    async hasModel(name) {
      return models.includes(name)
    },
    async generate({ model }) {
      if (!available) {
        return {
          ok: false,
          error: 'unreachable',
          code: 'MODEL_UNAVAILABLE',
        }
      }
      if (!models.includes(model)) {
        return {
          ok: false,
          error: `missing ${model}`,
          code: 'MODEL_UNAVAILABLE',
        }
      }
      const text =
        responses[model] ??
        JSON.stringify({
          criteria: [
            {
              criterion: 'Demo criterion',
              status: 'UNVERIFIED',
              evidenceRefs: [],
              notes: 'Insufficient evidence',
            },
          ],
          outstandingWork: ['Provide screenshots'],
          uncertainty: ['No automated tests attached'],
          evidenceReferences: [],
          summary: 'Advisory draft only',
          confidence: 0.3,
        })
      return { ok: true, text, model, raw: {} }
    },
  }
}

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

async function setupSubmission() {
  const client = await register('CLIENT')
  const freelancer = await register('FREELANCER')
  const outsider = await register('CLIENT')

  const projectRes = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${client.token}`)
    .send({ title: 'AI project', description: 'Assess' })
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
      title: 'Build',
      deliverables: 'Feature',
      acceptanceCriteria: 'Works in demo',
      amount: 5000,
    })
  const milestoneId = mRes.body.milestone.id
  await request(app)
    .patch(`/api/v1/milestones/${milestoneId}/status`)
    .set('Authorization', `Bearer ${freelancer.token}`)
    .send({ status: 'IN_PROGRESS' })

  const sub = await request(app)
    .post(`/api/v1/milestones/${milestoneId}/submissions`)
    .set('Authorization', `Bearer ${freelancer.token}`)
    .field('notes', 'Implemented login screen')
    .field('externalUrl', 'https://example.com/demo')
  expect(sub.status).toBe(201)

  return {
    client,
    freelancer,
    outsider,
    projectId,
    milestoneId,
    submissionId: sub.body.submission.id,
  }
}

beforeAll(async () => {
  await pool.query('SELECT 1')
})

beforeEach(async () => {
  await resetDb()
  env.aiEnabled = true
  setDefaultAdapter(mockAdapter())
})

afterAll(async () => {
  setDefaultAdapter(null)
  await pool.end()
})

describe('AI assessments API', () => {
  it('creates an advisory assessment and blocks outsiders', async () => {
    const ctx = await setupSubmission()

    const res = await request(app)
      .post(`/api/v1/submissions/${ctx.submissionId}/assessments`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({ deliverableType: 'TEXT' })

    expect(res.status).toBe(201)
    expect(res.body.assessment.advisoryOnly).toBe(true)
    expect(res.body.assessment.canApproveMilestone).toBe(false)
    expect(res.body.assessment.canDecideDispute).toBe(false)
    expect(res.body.assessment.canAuthorizePayment).toBe(false)
    expect(res.body.assessment.status).toMatch(
      /COMPLETED|NEEDS_HUMAN_REVIEW|MODEL_DISAGREEMENT/,
    )
    expect(res.body.assessment.deliverableType).toBe('TEXT')
    expect(res.body.notice).toMatch(/advisory/i)

    const blocked = await request(app)
      .post(`/api/v1/submissions/${ctx.submissionId}/assessments`)
      .set('Authorization', `Bearer ${ctx.outsider.token}`)
      .send({})
    expect(blocked.status).toBe(403)

    const latest = await request(app)
      .get(`/api/v1/submissions/${ctx.submissionId}/assessments/latest`)
      .set('Authorization', `Bearer ${ctx.freelancer.token}`)
    expect(latest.status).toBe(200)
    expect(latest.body.assessment.id).toBe(res.body.assessment.id)
  })

  it('records MODEL_UNAVAILABLE without fabricating success', async () => {
    setDefaultAdapter(mockAdapter({ available: false }))
    const ctx = await setupSubmission()

    const res = await request(app)
      .post(`/api/v1/submissions/${ctx.submissionId}/assessments`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({})

    expect(res.status).toBe(201)
    expect(res.body.assessment.status).toBe('MODEL_UNAVAILABLE')
    expect(res.body.assessment.errorMessage).toBeTruthy()
    expect(res.body.assessment.result?.assessment).toBeUndefined()
  })

  it('summarizes disputes without recommending a decision', async () => {
    const ctx = await setupSubmission()
    const open = await request(app)
      .post(`/api/v1/milestones/${ctx.milestoneId}/disputes`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({ reason: 'Acceptance criteria not met in demo.' })
    expect(open.status).toBe(201)
    const disputeId = open.body.dispute.id

    setDefaultAdapter(
      mockAdapter({
        responses: {
          'qwen3:1.7b': JSON.stringify({
            claims: [
              {
                party: 'client',
                claim: 'Missing criteria',
                supportingEvidence: [],
              },
            ],
            contradictions: [],
            missingInformation: ['No screenshots'],
            evidenceReferences: [],
            summary: 'Human review needed',
            confidence: 0.5,
            recommendedDecision: null,
          }),
        },
      }),
    )

    const res = await request(app)
      .post(`/api/v1/disputes/${disputeId}/assessments`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({})
    expect(res.status).toBe(201)
    expect(res.body.assessment.kind).toBe('DISPUTE_EVIDENCE_SUMMARY')
    expect(res.body.assessment.canDecideDispute).toBe(false)
    expect(
      res.body.assessment.result?.summary?.recommendedDecision ?? null,
    ).toBeNull()
  })
})
