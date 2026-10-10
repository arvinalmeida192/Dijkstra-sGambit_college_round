import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { pool } from '../../src/db/pool.js'
import { setDefaultVerifier } from '../../src/modules/blockchain/escrowVerifier.js'

const app = createApp()

const TX_A =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const TX_B =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const ESCROW = '0x5fbdb2315678afecb367f032d93f642f64180aa3'

function mockVerifier(impl) {
  setDefaultVerifier({
    config: {
      chainId: 31337,
      rpcUrl: 'http://127.0.0.1:8545',
      escrowAddress: ESCROW,
      tokenDecimals: 6,
      configured: true,
      isTestNetwork: true,
    },
    verifyTransaction: impl,
  })
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
  return { token: res.body.token, user: res.body.user }
}

async function createProjectWithMilestone() {
  const client = await register('CLIENT')
  const freelancer = await register('FREELANCER')

  const projectRes = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${client.token}`)
    .send({ title: 'Pay project', description: 'Escrow demo' })
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
      title: 'Design',
      deliverables: 'Figma',
      acceptanceCriteria: 'Approved',
      amount: 25000,
    })
  expect(mRes.status).toBe(201)

  return {
    client,
    freelancer,
    projectId,
    milestone: mRes.body.milestone,
  }
}

beforeAll(async () => {
  await pool.query('SELECT 1')
  // Ensure env looks configured for service requireEscrowConfig
  process.env.CHAIN_ID = '31337'
  process.env.RPC_URL = 'http://127.0.0.1:8545'
  process.env.ESCROW_CONTRACT_ADDRESS = ESCROW
  process.env.TOKEN_DECIMALS = '6'
})

beforeEach(async () => {
  await resetDb()
  mockVerifier(async () => ({
    ok: true,
    status: 'CONFIRMED',
    txHash: TX_A,
    failureReason: null,
    chainId: 31337,
    blockNumber: 10,
    escrowAddress: ESCROW,
    eventName: 'MilestoneFunded',
    amountTokenBase: '250000000',
    onChainAgreementId: '0',
    onChainMilestoneId: '0',
    reconciliation: { primaryEvent: 'MilestoneFunded' },
    isTestNetwork: true,
  }))
})

afterAll(async () => {
  setDefaultVerifier(null)
  await pool.end()
})

describe('Payments API', () => {
  it('reports a tx, verifies status from chain only, and lists payments', async () => {
    const { client, projectId, milestone } = await createProjectWithMilestone()

    const report = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/payments`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ txHash: TX_A, status: 'RELEASED' }) // client status must be ignored (strict schema rejects)
    expect(report.status).toBe(400)

    const ok = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/payments`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ txHash: TX_A })
    expect(ok.status).toBe(201)
    expect(ok.body.payment.status).toBe('CONFIRMED')
    expect(ok.body.payment.isTestNetwork).toBe(true)
    expect(ok.body.payment.txHash).toBe(TX_A)
    expect(ok.body.verification.ok).toBe(true)
    expect(ok.body.payment.eventName).toBe('MilestoneFunded')

    const list = await request(app)
      .get(`/api/v1/projects/${projectId}/payments`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(list.status).toBe(200)
    expect(list.body.payments).toHaveLength(1)

    const get = await request(app)
      .get(`/api/v1/payments/${ok.body.payment.id}`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(get.status).toBe(200)
    expect(get.body.payment.status).toBe('CONFIRMED')
  })

  it('keeps PENDING when receipt is missing and sync is idempotent', async () => {
    const { client, milestone } = await createProjectWithMilestone()

    mockVerifier(async (hash) => ({
      ok: false,
      pending: true,
      status: 'PENDING',
      txHash: hash,
      failureReason: null,
      chainId: 31337,
      escrowAddress: ESCROW,
      isTestNetwork: true,
    }))

    const report = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/payments`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ txHash: TX_A })
    expect([201, 202]).toContain(report.status)
    expect(report.body.payment.status).toBe('PENDING')

    mockVerifier(async (hash) => ({
      ok: true,
      status: 'CONFIRMED',
      txHash: hash,
      failureReason: null,
      chainId: 31337,
      blockNumber: 22,
      escrowAddress: ESCROW,
      eventName: 'MilestoneFunded',
      amountTokenBase: '250000000',
      onChainAgreementId: '0',
      onChainMilestoneId: '0',
      reconciliation: { primaryEvent: 'MilestoneFunded' },
      isTestNetwork: true,
    }))

    const sync1 = await request(app)
      .post(`/api/v1/payments/${report.body.payment.id}/sync`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(sync1.status).toBe(200)
    expect(sync1.body.payment.status).toBe('CONFIRMED')

    const sync2 = await request(app)
      .post(`/api/v1/payments/${report.body.payment.id}/sync`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(sync2.status).toBe(200)
    expect(sync2.body.payment.status).toBe('CONFIRMED')

    const list = await request(app)
      .get(`/api/v1/milestones/${milestone.id}/payments`)
      .set('Authorization', `Bearer ${client.token}`)
    expect(list.body.payments).toHaveLength(1)
  })

  it('records FAILED for reverted transactions', async () => {
    const { client, milestone } = await createProjectWithMilestone()

    mockVerifier(async (hash) => ({
      ok: false,
      status: 'FAILED',
      txHash: hash,
      failureReason: 'Transaction reverted or failed on-chain.',
      chainId: 31337,
      blockNumber: 5,
      escrowAddress: ESCROW,
      isTestNetwork: true,
    }))

    const report = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/payments`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ txHash: TX_B })
    expect(report.status).toBe(201)
    expect(report.body.payment.status).toBe('FAILED')
    expect(report.body.payment.failureReason).to.match(/reverted|failed/i)
  })

  it('rejects reporting when blockchain env is not configured', async () => {
    const { client, milestone } = await createProjectWithMilestone()
    const prev = {
      CHAIN_ID: process.env.CHAIN_ID,
      RPC_URL: process.env.RPC_URL,
      ESCROW_CONTRACT_ADDRESS: process.env.ESCROW_CONTRACT_ADDRESS,
    }
    process.env.CHAIN_ID = ''
    process.env.RPC_URL = ''
    process.env.ESCROW_CONTRACT_ADDRESS = ''

    const res = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/payments`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ txHash: TX_A })
    expect(res.status).toBe(409)
    expect(res.body.message).to.match(/not configured/i)

    process.env.CHAIN_ID = prev.CHAIN_ID
    process.env.RPC_URL = prev.RPC_URL
    process.env.ESCROW_CONTRACT_ADDRESS = prev.ESCROW_CONTRACT_ADDRESS
  })

  it('rejects outsiders and keeps authz on payment routes', async () => {
    const { client, milestone } = await createProjectWithMilestone()
    const outsider = await register('CLIENT')
    const denied = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/payments`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({ txHash: TX_A })
    expect(denied.status).toBe(403)
  })

  it('rejects duplicate tx hash on a different milestone for same participant project', async () => {
    const { client, projectId, milestone } = await createProjectWithMilestone()

    const m2 = await request(app)
      .post(`/api/v1/projects/${projectId}/milestones`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        title: 'Code',
        deliverables: 'Repo',
        acceptanceCriteria: 'Tests pass',
        amount: 25000,
      })
    expect(m2.status).toBe(201)

    const first = await request(app)
      .post(`/api/v1/milestones/${milestone.id}/payments`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ txHash: TX_A })
    expect(first.status).toBe(201)

    const clash = await request(app)
      .post(`/api/v1/milestones/${m2.body.milestone.id}/payments`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ txHash: TX_A })
    expect(clash.status).toBe(409)
  })
})
