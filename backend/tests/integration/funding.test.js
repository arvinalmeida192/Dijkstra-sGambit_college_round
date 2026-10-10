import crypto from 'node:crypto'
import request from 'supertest'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { env } from '../../src/config/env.js'
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

async function setupActiveAgreementProject() {
  const client = await register('CLIENT')
  const freelancer = await register('FREELANCER')

  const projectRes = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${client.token}`)
    .send({ title: 'Funding Project', description: 'Testing funding' })
  expect(projectRes.status).toBe(201)
  const projectId = projectRes.body.project.id

  const inviteRes = await request(app)
    .post(`/api/v1/projects/${projectId}/invitations`)
    .set('Authorization', `Bearer ${client.token}`)
    .send({})
  expect(inviteRes.status).toBe(201)

  const acceptInviteRes = await request(app)
    .post(`/api/v1/invitations/${inviteRes.body.invitation.token}/accept`)
    .set('Authorization', `Bearer ${freelancer.token}`)
  expect(acceptInviteRes.status).toBe(200)

  // Create agreement with 2 milestones (total 15000 cents = ₹150.00)
  const agreementRes = await request(app)
    .post(`/api/v1/projects/${projectId}/agreements`)
    .set('Authorization', `Bearer ${client.token}`)
    .send({
      terms: {
        summary: 'Agreement for Funding Flow',
        totalPayment: 15000,
        milestones: [
          {
            title: 'Milestone 1',
            deliverables: 'Deliverable 1',
            acceptanceCriteria: 'Criteria 1',
            amount: 5000,
            dueDate: '2026-11-01',
          },
          {
            title: 'Milestone 2',
            deliverables: 'Deliverable 2',
            acceptanceCriteria: 'Criteria 2',
            amount: 10000,
            dueDate: '2026-11-15',
          },
        ],
      },
    })
  expect(agreementRes.status).toBe(201)
  const agreementId = agreementRes.body.agreement.id

  // Client accepts
  await request(app)
    .post(`/api/v1/agreements/${agreementId}/accept`)
    .set('Authorization', `Bearer ${client.token}`)
    .send({})

  // Freelancer accepts (activates agreement)
  const acceptRes = await request(app)
    .post(`/api/v1/agreements/${agreementId}/accept`)
    .set('Authorization', `Bearer ${freelancer.token}`)
    .send({})
  expect(acceptRes.body.agreement.status).toBe('ACTIVE')

  // Get milestones
  const mRes = await request(app)
    .get(`/api/v1/projects/${projectId}/milestones`)
    .set('Authorization', `Bearer ${client.token}`)
  expect(mRes.body.milestones).toHaveLength(2)

  return {
    client,
    freelancer,
    projectId,
    agreementId,
    milestones: mRes.body.milestones,
  }
}

function generateSignature(orderId, paymentId, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')
}

function generateWebhookSignature(body, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')
}

beforeAll(async () => {
  await pool.query('SELECT 1')
})

beforeEach(async () => {
  await resetDb()
})

describe('funding module', () => {
  it('returns disabled status and does not block start-work when flag is false', async () => {
    env.gatewayPaymentsEnabled = false

    const ctx = await setupActiveAgreementProject()
    const milestoneId = ctx.milestones[0].id

    // Status shows disabled
    const statusRes = await request(app)
      .get(`/api/v1/projects/${ctx.projectId}/funding/status`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
    expect(statusRes.status).toBe(200)
    expect(statusRes.body.enabled).toBe(false)
    expect(statusRes.body.isFunded).toBe(false)

    // Order returns 409
    const orderRes = await request(app)
      .post(`/api/v1/projects/${ctx.projectId}/funding/order`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({})
    expect(orderRes.status).toBe(409)

    // Freelancer can start work directly because feature flag is false
    const startRes = await request(app)
      .patch(`/api/v1/milestones/${milestoneId}/status`)
      .set('Authorization', `Bearer ${ctx.freelancer.token}`)
      .send({ status: 'IN_PROGRESS' })
    expect(startRes.status).toBe(200)
    expect(startRes.body.milestone.status).toBe('IN_PROGRESS')
  })

  it('enforces funding before start-work when flag is true, creates order server-side, verifies, and releases funds', async () => {
    env.gatewayPaymentsEnabled = true
    env.razorpayKeySecret = 'test_secret_123'
    env.razorpayKeyId = 'rzp_test_placeholder'

    const ctx = await setupActiveAgreementProject()
    const milestone1 = ctx.milestones[0]
    const milestone2 = ctx.milestones[1]

    // 1. Attempting to start work before funding is rejected with 409
    const startBlocked = await request(app)
      .patch(`/api/v1/milestones/${milestone1.id}/status`)
      .set('Authorization', `Bearer ${ctx.freelancer.token}`)
      .send({ status: 'IN_PROGRESS' })
    expect(startBlocked.status).toBe(409)
    expect(startBlocked.body.message).toMatch(/funding required/i)

    // 2. Client creates funding order (server-side amount = 15000)
    const orderRes = await request(app)
      .post(`/api/v1/projects/${ctx.projectId}/funding/order`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({})
    expect(orderRes.status).toBe(201)
    expect(orderRes.body.orderId).toBeDefined()
    expect(orderRes.body.amount).toBe(15000)
    expect(orderRes.body.currency).toBe('INR')
    const orderId = orderRes.body.orderId

    // 3. Verification with invalid signature fails
    const badVerify = await request(app)
      .post(`/api/v1/projects/${ctx.projectId}/funding/verify`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({
        orderId,
        paymentId: 'pay_test_123',
        signature: 'invalid_signature_hex',
      })
    expect(badVerify.status).toBe(400)

    // 4. Verification with valid signature succeeds
    const paymentId = 'pay_test_' + Math.random().toString(16).slice(2)
    const validSignature = generateSignature(orderId, paymentId, env.razorpayKeySecret)

    const goodVerify = await request(app)
      .post(`/api/v1/projects/${ctx.projectId}/funding/verify`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({
        orderId,
        paymentId,
        signature: validSignature,
      })
    expect(goodVerify.status).toBe(200)
    expect(goodVerify.body.isFunded).toBe(true)
    expect(goodVerify.body.funding.status).toBe('PAID')
    expect(goodVerify.body.milestoneFunds).toHaveLength(2)
    expect(goodVerify.body.milestoneFunds[0].status).toBe('HELD')
    expect(goodVerify.body.milestoneFunds[0].amount).toBe(5000)
    expect(goodVerify.body.milestoneFunds[1].status).toBe('HELD')
    expect(goodVerify.body.milestoneFunds[1].amount).toBe(10000)

    // 5. Repeated verification is idempotent
    const repeatVerify = await request(app)
      .post(`/api/v1/projects/${ctx.projectId}/funding/verify`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({
        orderId,
        paymentId,
        signature: validSignature,
      })
    expect(repeatVerify.status).toBe(200)
    expect(repeatVerify.body.isFunded).toBe(true)

    // 6. Attempt to fund already-funded agreement is rejected
    const dupOrder = await request(app)
      .post(`/api/v1/projects/${ctx.projectId}/funding/order`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({})
    expect(dupOrder.status).toBe(409)

    // 7. Freelancer can now start work on milestone 1
    const startOk = await request(app)
      .patch(`/api/v1/milestones/${milestone1.id}/status`)
      .set('Authorization', `Bearer ${ctx.freelancer.token}`)
      .send({ status: 'IN_PROGRESS' })
    expect(startOk.status).toBe(200)
    expect(startOk.body.milestone.status).toBe('IN_PROGRESS')

    // 8. Attempting to release unapproved milestone is rejected
    const earlyRelease = await request(app)
      .post(`/api/v1/projects/${ctx.projectId}/funding/milestones/${milestone1.id}/release`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({})
    expect(earlyRelease.status).toBe(409)
    expect(earlyRelease.body.message).toMatch(/APPROVED/i)

    // 9. Milestone progression: Freelancer submits, client approves
    const subRes = await request(app)
      .post(`/api/v1/milestones/${milestone1.id}/submissions`)
      .set('Authorization', `Bearer ${ctx.freelancer.token}`)
      .field('notes', 'Submission deliverable')
      .attach('file', Buffer.from('deliverable-bytes'), {
        filename: 'work.zip',
        contentType: 'application/zip',
      })
    expect(subRes.status).toBe(201)

    const reviewRes = await request(app)
      .post(`/api/v1/submissions/${subRes.body.submission.id}/review`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({ decision: 'APPROVED' })
    expect(reviewRes.status).toBe(200)
    expect(reviewRes.body.milestone.status).toBe('APPROVED')

    // 10. Release approved milestone payment (Sandbox simulated payout)
    const releaseRes = await request(app)
      .post(`/api/v1/projects/${ctx.projectId}/funding/milestones/${milestone1.id}/release`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({ notes: 'Great work' })
    expect(releaseRes.status).toBe(200)
    expect(releaseRes.body.milestoneFund.status).toBe('RELEASED')
    expect(releaseRes.body.milestoneFund.payoutReference).toMatch(/^SIM-PAYOUT-/)
    expect(releaseRes.body.notice).toMatch(/Sandbox payout/i)

    // 11. Duplicate release is rejected
    const dupRelease = await request(app)
      .post(`/api/v1/projects/${ctx.projectId}/funding/milestones/${milestone1.id}/release`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({})
    expect(dupRelease.status).toBe(409)

    // Reset flag
    env.gatewayPaymentsEnabled = false
  })

  it('rejects release on disputed milestone', async () => {
    env.gatewayPaymentsEnabled = true
    env.razorpayKeySecret = 'test_secret_123'

    const ctx = await setupActiveAgreementProject()
    const milestone1 = ctx.milestones[0]

    // Create & verify funding
    const orderRes = await request(app)
      .post(`/api/v1/projects/${ctx.projectId}/funding/order`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({})
    const orderId = orderRes.body.orderId
    const paymentId = 'pay_test_' + Math.random().toString(16).slice(2)
    const signature = generateSignature(orderId, paymentId, env.razorpayKeySecret)

    await request(app)
      .post(`/api/v1/projects/${ctx.projectId}/funding/verify`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({ orderId, paymentId, signature })

    // Start work & submit
    await request(app)
      .patch(`/api/v1/milestones/${milestone1.id}/status`)
      .set('Authorization', `Bearer ${ctx.freelancer.token}`)
      .send({ status: 'IN_PROGRESS' })

    // Open dispute on milestone
    const disputeRes = await request(app)
      .post(`/api/v1/milestones/${milestone1.id}/disputes`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({ reason: 'Dispute opened during funding test' })
    expect(disputeRes.status).toBe(201)

    // Releasing disputed milestone is rejected
    const disputeRelease = await request(app)
      .post(`/api/v1/projects/${ctx.projectId}/funding/milestones/${milestone1.id}/release`)
      .set('Authorization', `Bearer ${ctx.client.token}`)
      .send({})
    expect(disputeRelease.status).toBe(409)
    expect(disputeRelease.body.message).toMatch(/dispute/i)

    env.gatewayPaymentsEnabled = false
  })

  it('processes webhook with raw-body signature verification and event deduplication', async () => {
    env.gatewayPaymentsEnabled = true
    env.razorpayWebhookSecret = 'test_wh_secret'

    const eventId = 'evt_test_' + Math.random().toString(16).slice(2)
    const rawPayload = JSON.stringify({
      event: 'payment.captured',
      event_id: eventId,
      payload: {
        payment: {
          entity: {
            id: 'pay_123',
            order_id: 'order_wh_123',
            amount: 5000,
          },
        },
      },
    })
    const validSignature = generateWebhookSignature(rawPayload, env.razorpayWebhookSecret)

    // Bad signature rejected
    const badSigRes = await request(app)
      .post('/api/v1/funding/webhook')
      .set('x-razorpay-signature', 'wrong_signature')
      .set('Content-Type', 'application/json')
      .send(rawPayload)
    expect(badSigRes.status).toBe(400)

    // Valid webhook processed
    const goodRes = await request(app)
      .post('/api/v1/funding/webhook')
      .set('x-razorpay-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(rawPayload)
    expect(goodRes.status).toBe(200)
    expect(goodRes.body.status).toBe('processed')

    // Duplicate webhook is ignored idempotently
    const dupRes = await request(app)
      .post('/api/v1/funding/webhook')
      .set('x-razorpay-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(rawPayload)
    expect(dupRes.status).toBe(200)
    expect(dupRes.body.status).toBe('ignored')
    expect(dupRes.body.reason).toBe('duplicate')

    env.gatewayPaymentsEnabled = false
  })
})
