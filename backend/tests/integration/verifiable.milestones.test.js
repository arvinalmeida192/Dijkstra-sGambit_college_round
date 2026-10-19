import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createApp } from '../../src/app.js'
import { env } from '../../src/config/env.js'
import { pool } from '../../src/db/pool.js'
import { setDefaultVerifier } from '../../src/modules/blockchain/escrowVerifier.js'
import { runNotificationJobs } from '../../src/modules/notifications/notification.jobs.js'
import { sha256Hex } from '../../src/utils/hash.js'

const app = createApp()

const ESCROW = '0x5fbdb2315678afecb367f032d93f642f64180aa3'
const TX_FUND_M1 =
  '0x1111111111111111111111111111111111111111111111111111111111111111'
const TX_FUND_M2 =
  '0x2222222222222222222222222222222222222222222222222222222222222222'
const TX_FUND_M3 =
  '0x3333333333333333333333333333333333333333333333333333333333333333'

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
  await pool.query('TRUNCATE TABLE verifier_keys RESTART IDENTITY CASCADE')
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

async function createProjectWithParticipants() {
  const client = await register('CLIENT')
  const freelancer = await register('FREELANCER')
  const arbitrator = await createArbitrator()

  const projectRes = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${client.token}`)
    .send({
      title: 'Verifiable Milestone Project',
      description: 'Smart-contract-enforced milestone verification workflow',
    })
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

  return { client, freelancer, arbitrator, projectId }
}

async function fundMilestoneEscrow(clientToken, milestoneId, txHash) {
  const payRes = await request(app)
    .post(`/api/v1/milestones/${milestoneId}/payments`)
    .set('Authorization', `Bearer ${clientToken}`)
    .send({ txHash })
  expect(payRes.status).toBe(201)
  expect(payRes.body.payment.status).toBe('CONFIRMED')
  return payRes.body.payment
}

const verifiableTerms = {
  title: 'Verifiable SDK & Design Delivery',
  description: 'Multi-milestone agreement with automated, integrity, and human checks',
  finalDeliverable: 'Tested pricing calculation module, signed spec bundle, and UI design',
  completionCriteria: 'All milestone verification rules satisfied',
  totalPayment: 60000,
  finalDueDate: '2026-12-31',
  milestones: [
    {
      title: 'M1: Pricing Engine Module',
      description: 'Deterministic pricing engine with unit test suite',
      deliverables: 'JavaScript module exporting calculateTotal(items, taxRate)',
      deliverableDescription: 'JavaScript module exporting calculateTotal(items, taxRate)',
      acceptanceCriteria: 'Passes automated sandbox tests for subtotal and tax calculation',
      amount: 25000,
      dueDate: '2026-11-10',
      reviewWindowDays: 5,
      maxRevisions: 3,
      verificationMethod: 'AUTOMATED_CHECK',
      challengeWindowHours: 24,
      disputeEscalationDays: 7,
      verificationCriteria: {
        acceptanceCriteria: [
          'Exports calculateTotal(items, taxRate)',
          'Computes exact integer cents total with tax',
        ],
        requiredEvidence: {
          requireFile: true,
          requireUrl: false,
          minSizeBytes: 10,
        },
        automatedChecks: [
          {
            id: 'pricing-js-suite',
            name: 'Pricing calculation unit tests',
            type: 'SANDBOX_JS_TEST',
            config: {
              timeoutMs: 1500,
              assertions: [
                {
                  name: 'calculateTotal([1000, 2000], 0.1) === 3300',
                  fn: 'calculateTotal',
                  args: [[1000, 2000], 0.1],
                  expected: 3300,
                },
                {
                  name: 'calculateTotal([], 0.2) === 0',
                  fn: 'calculateTotal',
                  args: [[], 0.2],
                  expected: 0,
                },
              ],
            },
          },
        ],
        disputePolicy:
          'Client has 24h challenge window; unresolved disputes escalate after 7 days.',
      },
    },
    {
      title: 'M2: Cryptographic Release Manifest',
      description: 'Signed JSON release manifest matching agreed hash',
      deliverables: 'manifest.json',
      deliverableDescription: 'Release manifest artifact',
      acceptanceCriteria: 'SHA-256 integrity verified',
      amount: 15000,
      dueDate: '2026-11-25',
      reviewWindowDays: 3,
      maxRevisions: 2,
      verificationMethod: 'EVIDENCE_INTEGRITY_CHECK',
      challengeWindowHours: 0,
      disputeEscalationDays: 5,
      verificationCriteria: {
        acceptanceCriteria: ['Valid SHA-256 artifact integrity'],
        requiredEvidence: {
          requireFile: true,
          requireUrl: false,
          minSizeBytes: 5,
        },
        automatedChecks: [],
      },
    },
    {
      title: 'M3: Brand Visual Identity & UX Polish',
      description: 'Subjective visual design and typography review',
      deliverables: 'Figma design link and style guide',
      deliverableDescription: 'Visual design system',
      acceptanceCriteria: 'Meets subjective brand aesthetic guidelines',
      amount: 20000,
      dueDate: '2026-12-15',
      reviewWindowDays: 5,
      maxRevisions: 3,
      verificationMethod: 'HUMAN_REVIEWED',
      challengeWindowHours: 48,
      disputeEscalationDays: 7,
      verificationCriteria: {
        acceptanceCriteria: [
          'Typography hierarchy and contrast align with brand voice',
          'Interactive prototype covers mobile and desktop breakpoints',
        ],
        requiredEvidence: {
          requireFile: false,
          requireUrl: true,
        },
        automatedChecks: [],
      },
    },
  ],
  notes: 'All amounts in integer cents.',
}

beforeAll(async () => {
  await pool.query('SELECT 1')
  process.env.CHAIN_ID = '31337'
  process.env.RPC_URL = 'http://127.0.0.1:8545'
  process.env.ESCROW_CONTRACT_ADDRESS = ESCROW
  process.env.TOKEN_DECIMALS = '6'
})

beforeEach(async () => {
  await resetDb()
  mockVerifier(async (hash) => ({
    ok: true,
    status: 'CONFIRMED',
    txHash: hash,
    failureReason: null,
    chainId: 31337,
    blockNumber: 12,
    escrowAddress: ESCROW,
    eventName: 'MilestoneFunded',
    amountTokenBase: '250000000',
    onChainAgreementId: '1',
    onChainMilestoneId: '0',
    reconciliation: { primaryEvent: 'MilestoneFunded' },
    isTestNetwork: true,
  }))
})

afterAll(async () => {
  setDefaultVerifier(null)
  await pool.end()
})

describe('Verifiable Milestone Fulfilment & Smart-Contract Release Integration', () => {
  it('freezes verification criteria hashes on mutual agreement acceptance and preserves frozen criteria on amendments after submission', async () => {
    const { client, freelancer, projectId } = await createProjectWithParticipants()

    // 1. Propose agreement v1
    const createRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: verifiableTerms })
    expect(createRes.status).toBe(201)
    const agreementV1 = createRes.body.agreement

    // 2. Both parties accept v1 -> activates agreement and freezes milestone criteria
    await request(app)
      .post(`/api/v1/agreements/${agreementV1.id}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200)

    const acceptRes = await request(app)
      .post(`/api/v1/agreements/${agreementV1.id}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .expect(200)
    expect(acceptRes.body.agreement.status).toBe('ACTIVE')

    const milestonesRes = await request(app)
      .get(`/api/v1/projects/${projectId}/milestones`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200)

    const [m1, m2, m3] = milestonesRes.body.milestones
    expect(m1.verificationMethod).toBe('AUTOMATED_CHECK')
    expect(m1.frozenCriteriaHash).toMatch(/^0x[a-f0-9]{64}$/)
    expect(m1.frozenAgreementVersion).toBe(1)
    expect(m2.verificationMethod).toBe('EVIDENCE_INTEGRITY_CHECK')
    expect(m2.frozenCriteriaHash).toMatch(/^0x[a-f0-9]{64}$/)
    expect(m3.verificationMethod).toBe('HUMAN_REVIEWED')
    expect(m3.frozenCriteriaHash).toMatch(/^0x[a-f0-9]{64}$/)

    const originalM1Hash = m1.frozenCriteriaHash

    // 3. Fund M1 on-chain, start M1, and submit a passing deliverable
    await fundMilestoneEscrow(client.token, m1.id, TX_FUND_M1)

    await request(app)
      .patch(`/api/v1/milestones/${m1.id}/status`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200)

    const passingCode = Buffer.from(`
      module.exports = {
        calculateTotal(items, taxRate) {
          const sum = items.reduce((acc, v) => acc + v, 0);
          return Math.round(sum * (1 + taxRate));
        }
      };
    `)

    const subRes = await request(app)
      .post(`/api/v1/milestones/${m1.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .field('notes', 'Implemented pricing calculation module')
      .attach('file', passingCode, {
        filename: 'pricing.js',
        contentType: 'application/javascript',
      })
    expect(subRes.status).toBe(201)
    expect(subRes.body.verificationRun.outcome).toBe('PASSED')

    // 4. Client proposes an amendment (v2) attempting to change M1 and M2 criteria
    const amendedTerms = {
      ...verifiableTerms,
      milestones: [
        {
          ...verifiableTerms.milestones[0],
          acceptanceCriteria: 'Retroactively changed criteria after submission',
        },
        {
          ...verifiableTerms.milestones[1],
          acceptanceCriteria: 'Updated criteria for unsubmitted M2',
        },
        verifiableTerms.milestones[2],
      ],
    }

    const amendRes = await request(app)
      .post(`/api/v1/agreements/${agreementV1.id}/propose-change`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: amendedTerms })
    expect(amendRes.status).toBe(201)
    const agreementV2 = amendRes.body.agreement
    expect(agreementV2.version).toBe(2)

    await request(app)
      .post(`/api/v1/agreements/${agreementV2.id}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200)
    await request(app)
      .post(`/api/v1/agreements/${agreementV2.id}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .expect(200)

    // Verify M1 (already submitted) preserved its v1 frozen criteria hash and version,
    // while M2 (unsubmitted) updated to v2.
    const afterAmendMilestones = await request(app)
      .get(`/api/v1/projects/${projectId}/milestones`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200)

    const [m1After, m2After] = afterAmendMilestones.body.milestones
    expect(m1After.frozenAgreementVersion).toBe(1)
    expect(m1After.frozenCriteriaHash).toBe(originalM1Hash)
    expect(m2After.frozenAgreementVersion).toBe(2)
  })

  it('executes automated sandbox checks, issues EIP-712 attestations on PASSED, blocks arbitrary client revision requests, and releases after challenge window without client approval', async () => {
    const { client, freelancer, projectId } = await createProjectWithParticipants()

    // Create & activate agreement
    const createRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: verifiableTerms })
      .expect(201)
    const agreementId = createRes.body.agreement.id

    await request(app)
      .post(`/api/v1/agreements/${agreementId}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200)
    await request(app)
      .post(`/api/v1/agreements/${agreementId}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .expect(200)

    const milestonesRes = await request(app)
      .get(`/api/v1/projects/${projectId}/milestones`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200)
    const m1 = milestonesRes.body.milestones[0]

    // Record confirmed on-chain escrow funding for M1
    await fundMilestoneEscrow(client.token, m1.id, TX_FUND_M1)

    // Move M1 to IN_PROGRESS
    await request(app)
      .patch(`/api/v1/milestones/${m1.id}/status`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200)

    // 1. Submit buggy code -> automated check FAILS
    const buggyCode = Buffer.from(`
      module.exports = {
        calculateTotal(items, taxRate) {
          return -999; // wrong implementation
        }
      };
    `)

    const failSubRes = await request(app)
      .post(`/api/v1/milestones/${m1.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .field('notes', 'Initial buggy submission')
      .attach('file', buggyCode, {
        filename: 'pricing.js',
        contentType: 'application/javascript',
      })
    expect(failSubRes.status).toBe(201)
    expect(failSubRes.body.verificationRun.outcome).toBe('FAILED')
    expect(failSubRes.body.attestation).toBeNull()
    expect(failSubRes.body.milestone.verificationStatus).toBe('FAILED')

    // Verified release is rejected when verification FAILED
    const prematureRelease = await request(app)
      .post(`/api/v1/milestones/${m1.id}/verified-release`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({})
    expect(prematureRelease.status).toBe(409)
    expect(prematureRelease.body.message).toMatch(/PASSED verification result/i)

    // Client can request revision when verification FAILED
    const revRes = await request(app)
      .post(`/api/v1/submissions/${failSubRes.body.submission.id}/review`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        decision: 'REVISION_REQUESTED',
        feedback: 'Unit tests failed in sandbox',
        unmetCriteria: ['Computes exact integer cents total with tax'],
      })
    expect(revRes.status).toBe(200)
    expect(revRes.body.milestone.status).toBe('REVISION_REQUESTED')

    // 2. Freelancer resubmits fixed code -> automated check PASSES and issues signed EIP-712 attestation
    const fixedCode = Buffer.from(`
      module.exports = {
        calculateTotal(items, taxRate) {
          const sum = items.reduce((acc, v) => acc + v, 0);
          return Math.round(sum * (1 + taxRate));
        }
      };
    `)

    const passSubRes = await request(app)
      .post(`/api/v1/milestones/${m1.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .field('notes', 'Fixed tax calculation logic')
      .attach('file', fixedCode, {
        filename: 'pricing.js',
        contentType: 'application/javascript',
      })
    expect(passSubRes.status).toBe(201)
    expect(passSubRes.body.verificationRun.outcome).toBe('PASSED')
    expect(passSubRes.body.attestation).toBeTruthy()
    expect(passSubRes.body.attestation.signature).toMatch(/^0x[a-fA-F0-9]+$/)
    expect(passSubRes.body.attestation.artifactHash).toBe(
      `0x${sha256Hex(fixedCode)}`,
    )
    expect(passSubRes.body.milestone.verificationStatus).toBe('CHALLENGE_WINDOW')

    // 3. Stale submission revision (#1) cannot be re-verified once revision #2 exists
    const staleVerify = await request(app)
      .post(`/api/v1/submissions/${failSubRes.body.submission.id}/verify`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({})
    expect(staleVerify.status).toBe(409)
    expect(staleVerify.body.message).toMatch(/stale/i)

    // 4. Client CANNOT arbitrarily request revision once objective verification PASSED
    const blockedRev = await request(app)
      .post(`/api/v1/submissions/${passSubRes.body.submission.id}/review`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        decision: 'REVISION_REQUESTED',
        feedback: 'I want extra features not in the spec',
        unmetCriteria: ['Exports calculateTotal(items, taxRate)'],
      })
    expect(blockedRev.status).toBe(409)
    expect(blockedRev.body.message).toMatch(
      /passed independent objective verification/i,
    )

    // 5. Verified release is blocked while the 24h challenge window is still active
    const duringWindowRelease = await request(app)
      .post(`/api/v1/milestones/${m1.id}/verified-release`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({})
    expect(duringWindowRelease.status).toBe(409)
    expect(duringWindowRelease.body.message).toMatch(/Challenge window is active/i)

    // 6. Advance challenge_due_at into the past and execute verified release without client approval
    await pool.query(
      `UPDATE milestones SET challenge_due_at = NOW() - INTERVAL '1 hour' WHERE id = $1`,
      [m1.id],
    )

    const releaseRes = await request(app)
      .post(`/api/v1/milestones/${m1.id}/verified-release`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({})
    expect(releaseRes.status).toBe(200)
    expect(releaseRes.body.milestone.status).toBe('APPROVED')
    expect(releaseRes.body.milestone.verificationStatus).toBe('VERIFIED_ELIGIBLE')

    // Because no live operator private key was configured in env, payment status in PostgreSQL
    // remains CONFIRMED (never falsely marked RELEASED without an on-chain release receipt)
    expect(releaseRes.body.payment.status).toBe('CONFIRMED')
  })

  it('returns NEEDS_HUMAN_REVIEW for subjective milestones and supports bounded challenge disputes with escalation deadlines', async () => {
    const { client, freelancer, arbitrator, projectId } =
      await createProjectWithParticipants()

    const createRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agreements`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ terms: verifiableTerms })
      .expect(201)
    const agreementId = createRes.body.agreement.id

    await request(app)
      .post(`/api/v1/agreements/${agreementId}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200)
    await request(app)
      .post(`/api/v1/agreements/${agreementId}/accept`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .expect(200)

    const milestonesRes = await request(app)
      .get(`/api/v1/projects/${projectId}/milestones`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200)
    const [, m2, m3] = milestonesRes.body.milestones

    // Fund M2 and M3 on-chain so work can begin
    await fundMilestoneEscrow(client.token, m2.id, TX_FUND_M2)
    await fundMilestoneEscrow(client.token, m3.id, TX_FUND_M3)

    // M2: EVIDENCE_INTEGRITY_CHECK with 0h challenge window -> auto-approves immediately on valid file upload
    await request(app)
      .patch(`/api/v1/milestones/${m2.id}/status`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200)

    const manifestBytes = Buffer.from(JSON.stringify({ version: '1.0.0', ok: true }))
    const m2Sub = await request(app)
      .post(`/api/v1/milestones/${m2.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .attach('file', manifestBytes, {
        filename: 'manifest.json',
        contentType: 'application/json',
      })
    expect(m2Sub.status).toBe(201)
    expect(m2Sub.body.verificationRun.outcome).toBe('PASSED')
    expect(m2Sub.body.milestone.status).toBe('APPROVED')
    expect(m2Sub.body.milestone.verificationStatus).toBe('VERIFIED_ELIGIBLE')

    // M3: HUMAN_REVIEWED -> returns NEEDS_HUMAN_REVIEW and does NOT issue an objective pass attestation
    await request(app)
      .patch(`/api/v1/milestones/${m3.id}/status`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200)

    const m3Sub = await request(app)
      .post(`/api/v1/milestones/${m3.id}/submissions`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({
        externalUrl: 'https://figma.com/file/brand-identity',
        notes: 'Completed responsive design system and typography tokens',
      })
    expect(m3Sub.status).toBe(201)
    expect(m3Sub.body.verificationRun.outcome).toBe('NEEDS_HUMAN_REVIEW')
    expect(m3Sub.body.attestation).toBeNull()
    expect(m3Sub.body.milestone.verificationStatus).toBe('NEEDS_HUMAN_REVIEW')

    // Open a dispute on M3 referencing specific subjective criteria
    const disputeRes = await request(app)
      .post(`/api/v1/milestones/${m3.id}/disputes`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        reason: 'Typography contrast on mobile dark mode does not meet brand spec',
        claimSummary: 'See section 2 of design review notes',
        disputedCriteriaRefs: [
          'Typography hierarchy and contrast align with brand voice',
        ],
      })
    expect(disputeRes.status).toBe(201)
    expect(disputeRes.body.dispute.status).toBe('OPEN')
    expect(disputeRes.body.dispute.disputedCriteriaRefs).toEqual([
      'Typography hierarchy and contrast align with brand voice',
    ])
    expect(disputeRes.body.dispute.evidenceSubmissionId).toBe(m3Sub.body.submission.id)
    expect(disputeRes.body.dispute.verificationRunId).toBe(
      m3Sub.body.verificationRun.id,
    )
    expect(disputeRes.body.dispute.escalationDueAt).toBeTruthy()

    // Inspect dispute with full verification context
    const getDisputeRes = await request(app)
      .get(`/api/v1/disputes/${disputeRes.body.dispute.id}`)
      .set('Authorization', `Bearer ${arbitrator.token}`)
      .expect(200)
    expect(getDisputeRes.body.dispute.verificationContext).toBeTruthy()
    expect(
      getDisputeRes.body.dispute.verificationContext.verificationMethod,
    ).toBe('HUMAN_REVIEWED')
    expect(
      getDisputeRes.body.dispute.verificationContext.latestVerificationRun.id,
    ).toBe(m3Sub.body.verificationRun.id)

    // Test dispute escalation deadline scan via runNotificationJobs
    await pool.query(
      `UPDATE disputes SET escalation_due_at = NOW() - INTERVAL '1 hour' WHERE id = $1`,
      [disputeRes.body.dispute.id],
    )
    const jobRes = await runNotificationJobs({ now: new Date() })
    expect(jobRes.created).toBeGreaterThanOrEqual(2)

    // Arbitrator decides the dispute
    const decideRes = await request(app)
      .post(`/api/v1/disputes/${disputeRes.body.dispute.id}/decide`)
      .set('Authorization', `Bearer ${arbitrator.token}`)
      .send({
        decision: 'RELEASE_TO_FREELANCER',
        rationale: 'Design meets agreed brand typography and breakpoint criteria',
      })
    expect(decideRes.status).toBe(200)
    expect(decideRes.body.dispute.status).toBe('RESOLVED')
    expect(decideRes.body.milestone.status).toBe('APPROVED')
  })

  it('enforces verifier key rotation and revocation permissions', async () => {
    const { client, arbitrator } = await createProjectWithParticipants()
    const sampleVerifier = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

    // Non-arbitrator cannot manage verifier keys
    const forbiddenRes = await request(app)
      .post('/api/v1/verifiers/keys')
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        verifierAddress: sampleVerifier,
        status: 'ACTIVE',
        label: 'Secondary Verifier',
      })
    expect(forbiddenRes.status).toBe(403)

    // Arbitrator can register and revoke verifier keys
    const activeRes = await request(app)
      .post('/api/v1/verifiers/keys')
      .set('Authorization', `Bearer ${arbitrator.token}`)
      .send({
        verifierAddress: sampleVerifier,
        status: 'ACTIVE',
        label: 'Secondary Verifier',
      })
    expect(activeRes.status).toBe(200)
    expect(activeRes.body.verifierKey.status).toBe('ACTIVE')

    const revokeRes = await request(app)
      .post('/api/v1/verifiers/keys')
      .set('Authorization', `Bearer ${arbitrator.token}`)
      .send({
        verifierAddress: sampleVerifier,
        status: 'REVOKED',
        label: 'Revoked Verifier',
      })
    expect(revokeRes.status).toBe(200)
    expect(revokeRes.body.verifierKey.status).toBe('REVOKED')
  })
})
