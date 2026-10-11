import crypto from 'node:crypto'
import { env } from '../../config/env.js'
import { withTransaction } from '../../db/pool.js'
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js'
import { findActiveAgreement } from '../agreements/agreement.repository.js'
import { findOpenDisputeForMilestone } from '../disputes/dispute.repository.js'
import { findMilestoneById } from '../milestones/milestone.repository.js'
import { insertNotificationIgnoreConflict } from '../notifications/notification.repository.js'
import { findProjectById } from '../projects/project.repository.js'
import { assertParticipant } from '../projects/project.service.js'
import { insertAuditLog } from '../submissions/submission.repository.js'
import {
  findFundingById,
  findFundingByOrderId,
  findLatestFundingForProject,
  findMilestoneFundByMilestoneId,
  findMilestoneFundForUpdate,
  findPaidFundingForAgreement,
  insertFunding,
  insertMilestoneFundsBatch,
  listMilestoneFundsForProject,
  markFundingFailed,
  markFundingPaid,
  markMilestoneFundFailed,
  recordGatewayEvent,
  releaseMilestoneFund,
  toPublicFunding,
  toPublicMilestoneFund,
  updateFundingOrderId,
} from './funding.repository.js'
import { SimulatedPayoutProvider } from './payout/simulated.payout.js'
import { RazorpayRoutePayoutProvider } from './payout/razorpay.stub.js'

function assertClientOwner(project, user) {
  assertParticipant(project, user)
  if (project.client_id !== user.id) {
    throw forbidden('Only the project client can perform this action.')
  }
}

/**
 * Currency conversion helpers.
 * Fairwork amounts are stored in integer app cents (where 100 = 1.00 major units).
 * For INR in Razorpay, 1 INR = 100 paise.
 * Therefore, 1 app cent = 1 paisa.
 */
export function appCentsToPaise(cents) {
  if (typeof cents !== 'number' || !Number.isInteger(cents) || cents <= 0) {
    throw badRequest('Invalid amount: must be a positive integer in cents.')
  }
  return cents
}

export function paiseToAppCents(paise) {
  if (typeof paise !== 'number' || !Number.isInteger(paise) || paise <= 0) {
    throw badRequest('Invalid paise: must be a positive integer.')
  }
  return paise
}

/**
 * Processing fee calculation helper.
 * Rate defaults to configured env.processingFeeRate (e.g. 0.02 = 2%).
 * Uses explicit integer rounding (Math.round) in smallest currency units.
 */
export function calculateProcessingFee(amountCents, rate = env.processingFeeRate) {
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    throw badRequest('Invalid amount: must be a positive integer in cents.')
  }
  const numericRate = typeof rate === 'number' && !isNaN(rate) && rate >= 0 ? rate : 0.02
  const feeAmountCents = Math.round(amountCents * numericRate)
  const totalPayableCents = amountCents + feeAmountCents
  return {
    feeRate: numericRate,
    feeAmountCents,
    totalPayableCents,
    feeAmountPaise: appCentsToPaise(feeAmountCents),
    totalPayablePaise: appCentsToPaise(totalPayableCents),
  }
}

/**
 * Signature verification helpers using timing-safe comparisons.
 */
export function verifyPaymentSignature({ orderId, paymentId, signature, secret }) {
  if (!orderId || !paymentId || !signature || !secret) return false
  const body = `${orderId}|${paymentId}`
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')
  const expectedBuf = Buffer.from(expected, 'utf8')
  const actualBuf = Buffer.from(signature, 'utf8')
  if (expectedBuf.length !== actualBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, actualBuf)
}

export function verifyWebhookSignature({ rawBody, signature, secret }) {
  if (!rawBody || !signature || !secret) return false
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8')
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  const expectedBuf = Buffer.from(expected, 'utf8')
  const actualBuf = Buffer.from(signature, 'utf8')
  if (expectedBuf.length !== actualBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, actualBuf)
}

/**
 * Factory for payout provider.
 */
export function getPayoutProvider(mode = env.payoutMode) {
  if (mode === 'failing_stub') {
    return {
      async createPayout() {
        throw new Error('Simulated upstream gateway provider timeout')
      },
    }
  }
  if (mode === 'razorpay_route') {
    return new RazorpayRoutePayoutProvider()
  }
  return new SimulatedPayoutProvider()
}

/**
 * Check if a project has verified funding for its active agreement.
 */
export async function isProjectFunded(projectId, client) {
  const activeAgreement = await findActiveAgreement(projectId, client)
  if (!activeAgreement) return false
  const paidFunding = await findPaidFundingForAgreement(activeAgreement.id, client)
  return Boolean(paidFunding)
}

/**
 * Razorpay HTTP order creator (allows test mock injection).
 */
export let orderGateway = {
  async createOrder({ amountPaise, currency, receipt, keyId, keySecret }) {
    // If in test environment or mock keys, generate a deterministic order id
    if (env.isTest || keyId.startsWith('mock_') || keyId === 'rzp_test_placeholder') {
      return {
        id: `order_test_${crypto.randomBytes(8).toString('hex')}`,
        amount: amountPaise,
        currency,
        receipt,
        status: 'created',
      }
    }

    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency,
        receipt,
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      throw conflict(`Razorpay order creation failed: ${errBody}`)
    }

    return response.json()
  },
}

export function setOrderGateway(gateway) {
  orderGateway = gateway
}

/**
 * GET /status: return feature availability, project funding status, and milestone fund states.
 */
export async function getFundingStatus(user, projectId) {
  const project = await findProjectById(projectId)
  assertParticipant(project, user)

  if (!env.gatewayPaymentsEnabled) {
    return {
      enabled: false,
      isFunded: false,
      funding: null,
      milestoneFunds: [],
    }
  }

  const activeAgreement = await findActiveAgreement(projectId)
  const isFunded = activeAgreement
    ? Boolean(await findPaidFundingForAgreement(activeAgreement.id))
    : false

  const latestFunding = await findLatestFundingForProject(projectId)
  const milestoneFunds = await listMilestoneFundsForProject(projectId)

  let feeEstimate = null
  if (activeAgreement && !isFunded) {
    const agreementMilestones = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM milestones WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC`,
        [projectId],
      )
      return rows
    })
    const projectAmountCents = agreementMilestones.reduce((sum, m) => sum + Number(m.amount), 0)
    if (projectAmountCents > 0) {
      feeEstimate = {
        projectAmountCents,
        ...calculateProcessingFee(projectAmountCents),
      }
    }
  }

  return {
    enabled: true,
    keyId: env.razorpayKeyId || 'rzp_test_placeholder',
    currency: 'INR',
    isFunded,
    funding: toPublicFunding(latestFunding),
    milestoneFunds: milestoneFunds.map(toPublicMilestoneFund),
    feeEstimate,
    activeAgreement: activeAgreement
      ? {
          id: activeAgreement.id,
          version: activeAgreement.version,
          status: activeAgreement.status,
          title: activeAgreement.title,
          totalPayment: activeAgreement.total_payment,
        }
      : null,
    payoutMode: env.payoutMode,
  }
}

/**
 * POST /order: client-only. Require active agreement with both acceptances.
 */
export async function createOrder(user, projectId, input = {}) {
  if (!env.gatewayPaymentsEnabled) {
    throw conflict('Gateway payments feature is disabled.')
  }

  // Reject unconfigured or placeholder credentials at runtime when not running unit tests
  if (
    !env.isTest &&
    (!env.razorpayKeyId ||
      !env.razorpayKeySecret ||
      env.razorpayKeyId.includes('REPLACE_WITH') ||
      env.razorpayKeySecret.includes('REPLACE_WITH'))
  ) {
    throw conflict('Payment gateway is not properly configured with valid API keys.')
  }

  const project = await findProjectById(projectId)
  assertClientOwner(project, user)

  const activeAgreement = await findActiveAgreement(projectId)
  if (!activeAgreement) {
    throw conflict('An active agreement with both acceptances is required before funding.')
  }

  const existingPaid = await findPaidFundingForAgreement(activeAgreement.id)
  if (existingPaid) {
    throw conflict('This agreement has already been funded.')
  }

  // Derive amount strictly server-side from active agreement milestones
  const milestoneFunds = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM milestones WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [projectId],
    )
    return rows
  })

  if (milestoneFunds.length === 0) {
    throw conflict('Cannot fund a project with no milestones.')
  }

  const totalAmountCents = milestoneFunds.reduce((sum, m) => sum + Number(m.amount), 0)
  if (totalAmountCents <= 0) {
    throw conflict('Milestone amounts must be greater than zero.')
  }

  const feeCalc = calculateProcessingFee(totalAmountCents)
  const currency = input.currency || 'INR'

  return withTransaction(async (client) => {
    const funding = await insertFunding(
      {
        projectId,
        agreementId: activeAgreement.id,
        clientId: user.id,
        amount: totalAmountCents,
        currency,
        gatewayProvider: 'razorpay',
        feeAmount: feeCalc.feeAmountCents,
        totalPayable: feeCalc.totalPayableCents,
        feeRate: feeCalc.feeRate,
        feeStatus: 'ESTIMATED',
        metadata: {
          agreementVersion: activeAgreement.version,
          milestoneCount: milestoneFunds.length,
          projectTitle: project.title,
        },
      },
      client,
    )

    const razorpayOrder = await orderGateway.createOrder({
      amountPaise: feeCalc.totalPayablePaise,
      currency,
      receipt: `rcpt_${funding.id.replace(/-/g, '').slice(0, 30)}`,
      keyId: env.razorpayKeyId || 'rzp_test_placeholder',
      keySecret: env.razorpayKeySecret || 'test_secret',
    })

    await updateFundingOrderId(funding.id, razorpayOrder.id, client)

    return {
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount, // in paise (total payable including fee)
      amountPaise: feeCalc.totalPayablePaise,
      amountCents: totalAmountCents,
      feeAmountCents: feeCalc.feeAmountCents,
      totalPayableCents: feeCalc.totalPayableCents,
      feeRate: feeCalc.feeRate,
      currency: razorpayOrder.currency,
      keyId: env.razorpayKeyId || 'rzp_test_placeholder',
      fundingId: funding.id,
      totalAmountCents,
      agreementVersion: activeAgreement.version,
      projectTitle: project.title,
      milestones: milestoneFunds.map((m) => ({
        id: m.id,
        title: m.title,
        amount: Number(m.amount),
      })),
    }
  })
}

/**
 * POST /verify: client-only. Validate signature, mark paid, create held milestone funds.
 */
export async function verifyPayment(user, projectId, input) {
  if (!env.gatewayPaymentsEnabled) {
    throw conflict('Gateway payments feature is disabled.')
  }

  const project = await findProjectById(projectId)
  assertClientOwner(project, user)

  const isValid = verifyPaymentSignature({
    orderId: input.orderId,
    paymentId: input.paymentId,
    signature: input.signature,
    secret: env.razorpayKeySecret || 'test_secret',
  })

  if (!isValid) {
    throw badRequest('Invalid payment signature.')
  }

  return withTransaction(async (client) => {
    const funding = await findFundingByOrderId(input.orderId, client)
    if (!funding) {
      throw notFound('Funding order not found.')
    }

    if (funding.project_id !== projectId) {
      throw conflict('Order does not match this project.')
    }

    // Idempotent retry: if already paid, return existing state
    if (funding.status === 'PAID') {
      const existingFunds = await listMilestoneFundsForProject(projectId, client)
      return {
        success: true,
        isFunded: true,
        funding: toPublicFunding(funding),
        milestoneFunds: existingFunds.map(toPublicMilestoneFund),
        notice: 'Funding is already verified.',
      }
    }

    const updatedFunding = await markFundingPaid(
      {
        id: funding.id,
        paymentId: input.paymentId,
        signature: input.signature,
      },
      client,
    )

    // Load active agreement milestones to allocate held funds
    const { rows: milestones } = await client.query(
      `SELECT * FROM milestones WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [projectId],
    )

    const fundItems = milestones.map((m) => ({
      projectId,
      milestoneId: m.id,
      fundingId: funding.id,
      amount: Number(m.amount),
    }))

    const createdFunds = await insertMilestoneFundsBatch(fundItems, client)

    await insertAuditLog(
      {
        actorId: user.id,
        projectId,
        action: 'PROJECT_FUNDED',
        metadata: {
          fundingId: funding.id,
          orderId: input.orderId,
          paymentId: input.paymentId,
          amount: funding.amount,
        },
      },
      client,
    )

    if (project.freelancer_id) {
      await insertNotificationIgnoreConflict(
        {
          userId: project.freelancer_id,
          projectId,
          kind: 'PROJECT_FUNDED',
          subjectKey: funding.id,
          title: 'Project Funded',
          body: `Project "${project.title}" has been funded. You may now start work on milestones.`,
        },
        client,
      )
    }

    return {
      success: true,
      isFunded: true,
      funding: toPublicFunding(updatedFunding),
      milestoneFunds: createdFunds.map(toPublicMilestoneFund),
      notice: 'Payment verified. Project funded in sandbox mode.',
    }
  })
}

/**
 * POST /milestones/:milestoneId/release: client-only.
 * Requires funding, milestone APPROVED, held funds, and no dispute.
 */
export async function releaseMilestone(user, milestoneId, input = {}) {
  if (!env.gatewayPaymentsEnabled) {
    throw conflict('Gateway payments feature is disabled.')
  }

  const milestone = await findMilestoneById(milestoneId)
  if (!milestone) throw notFound('Milestone not found.')

  const project = await findProjectById(milestone.project_id)
  assertClientOwner(project, user)

  const openDispute = await findOpenDisputeForMilestone(milestoneId)
  if (openDispute || milestone.status === 'DISPUTED') {
    throw conflict('Disputed milestones remain held and cannot be released.')
  }

  if (milestone.status !== 'APPROVED') {
    throw conflict('Milestone must be APPROVED before payment release.')
  }

  return withTransaction(async (client) => {
    // Row lock on milestone funds
    const fund = await findMilestoneFundForUpdate(milestoneId, client)
    if (!fund) {
      throw notFound('No held fund record found for this milestone.')
    }

    // Allow release if HELD, or retry if previously FAILED
    if (fund.status !== 'HELD' && fund.status !== 'FAILED') {
      throw conflict(`Milestone funds are already ${fund.status.toLowerCase()}.`)
    }

    const payoutProvider = getPayoutProvider(env.payoutMode)
    let payoutResult
    try {
      payoutResult = await payoutProvider.createPayout({
        fundId: fund.id,
        milestoneId,
        amount: Number(fund.amount),
        currency: 'INR',
      })
    } catch (err) {
      // Record recoverable payout failure state
      const failedFund = await markMilestoneFundFailed(
        {
          milestoneFundId: fund.id,
          failureReason: err.message || 'Payout provider failure',
          metadata: {
            error: err.message,
            notes: input.notes ?? null,
            attemptedAt: new Date().toISOString(),
          },
        },
        client,
      )
      return {
        success: false,
        milestoneFund: toPublicMilestoneFund(failedFund),
        notice: `Payout failed: ${err.message}. State recorded as FAILED for retry.`,
      }
    }

    const updatedFund = await releaseMilestoneFund(
      {
        milestoneFundId: fund.id,
        releasedBy: user.id,
        payoutReference: payoutResult.reference,
        metadata: {
          ...payoutResult,
          notes: input.notes ?? null,
        },
      },
      client,
    )

    await insertAuditLog(
      {
        actorId: user.id,
        projectId: project.id,
        milestoneId,
        action: 'MILESTONE_FUNDS_RELEASED',
        metadata: {
          fundId: fund.id,
          payoutReference: payoutResult.reference,
          amount: fund.amount,
        },
      },
      client,
    )

    if (project.freelancer_id) {
      await insertNotificationIgnoreConflict(
        {
          userId: project.freelancer_id,
          projectId: project.id,
          milestoneId,
          kind: 'MILESTONE_RELEASED',
          subjectKey: fund.id,
          title: 'Milestone Funds Released',
          body: `Payment release for milestone "${milestone.title}" has been recorded (${payoutResult.label || 'Sandbox payout'}).`,
        },
        client,
      )
    }

    return {
      success: true,
      milestoneFund: toPublicMilestoneFund(updatedFund),
      notice: 'Sandbox payout recorded. Ledger updated.',
    }
  })
}

/**
 * System/automatic release triggered by review-window expiry.
 * Idempotent: checks for HELD funds, open disputes, and funding configuration.
 * Disputed, cancelled, or unfunded milestones are safely bypassed without error.
 */
export async function tryAutoReleaseMilestoneFund(milestoneId) {
  if (!env.gatewayPaymentsEnabled) {
    return { released: false, reason: 'feature_disabled' }
  }

  const milestone = await findMilestoneById(milestoneId)
  if (!milestone || milestone.status !== 'APPROVED') {
    return { released: false, reason: 'not_approved' }
  }

  const openDispute = await findOpenDisputeForMilestone(milestoneId)
  if (openDispute || milestone.status === 'DISPUTED') {
    return { released: false, reason: 'disputed' }
  }

  const project = await findProjectById(milestone.project_id)
  if (!project || project.status === 'CANCELLED') {
    return { released: false, reason: 'project_cancelled' }
  }

  return withTransaction(async (client) => {
    const fund = await findMilestoneFundForUpdate(milestoneId, client)
    if (!fund) {
      return { released: false, reason: 'not_funded' }
    }

    if (fund.status !== 'HELD' && fund.status !== 'FAILED') {
      return { released: false, reason: `already_${fund.status.toLowerCase()}` }
    }

    const payoutProvider = getPayoutProvider(env.payoutMode)
    let payoutResult
    try {
      payoutResult = await payoutProvider.createPayout({
        fundId: fund.id,
        milestoneId,
        amount: Number(fund.amount),
        currency: 'INR',
      })
    } catch (err) {
      const failedFund = await markMilestoneFundFailed(
        {
          milestoneFundId: fund.id,
          failureReason: err.message || 'Auto-payout provider failure',
          metadata: {
            error: err.message,
            trigger: 'auto_approval_expiry',
            attemptedAt: new Date().toISOString(),
          },
        },
        client,
      )
      return {
        released: false,
        reason: 'payout_failed',
        milestoneFund: toPublicMilestoneFund(failedFund),
      }
    }

    const updatedFund = await releaseMilestoneFund(
      {
        milestoneFundId: fund.id,
        releasedBy: project.client_id,
        payoutReference: payoutResult.reference,
        metadata: {
          ...payoutResult,
          trigger: 'auto_approval_expiry',
        },
      },
      client,
    )

    await insertAuditLog(
      {
        actorId: null,
        projectId: project.id,
        milestoneId,
        action: 'MILESTONE_FUNDS_RELEASED',
        metadata: {
          fundId: fund.id,
          payoutReference: payoutResult.reference,
          amount: fund.amount,
          trigger: 'auto_approval_expiry',
        },
      },
      client,
    )

    if (project.freelancer_id) {
      await insertNotificationIgnoreConflict(
        {
          userId: project.freelancer_id,
          projectId: project.id,
          milestoneId,
          kind: 'MILESTONE_RELEASED',
          subjectKey: fund.id,
          title: 'Milestone Funds Released (Auto)',
          body: `Payment release for auto-approved milestone "${milestone.title}" has been recorded (${payoutResult.label || 'Sandbox payout'}).`,
        },
        client,
      )
    }

    return {
      released: true,
      milestoneFund: toPublicMilestoneFund(updatedFund),
    }
  })
}

/**
 * POST /webhook: public provider endpoint with raw-body signature verification.
 */
export async function processWebhook({ rawBody, signature, payload }) {
  if (!env.gatewayPaymentsEnabled) {
    return { status: 'ignored', reason: 'feature_disabled' }
  }

  const secret = env.razorpayWebhookSecret || ''
  if (!env.isTest && (!secret || secret.includes('REPLACE_WITH'))) {
    throw conflict('Webhook processing is disabled: webhook secret is not configured.')
  }

  const isValid = verifyWebhookSignature({
    rawBody,
    signature,
    secret: secret || 'placeholder_webhook_secret',
  })

  if (!isValid) {
    throw badRequest('Invalid webhook signature.')
  }

  const eventId =
    payload?.event_id ||
    payload?.id ||
    crypto.createHash('sha256').update(rawBody).digest('hex')
  const eventType = payload?.event || 'unknown'

  // Deduplicate event
  const recorded = await recordGatewayEvent({
    provider: 'razorpay',
    eventId,
    eventType,
    payload,
  })

  if (!recorded) {
    return { status: 'ignored', reason: 'duplicate' }
  }

  // Handle payment captured / order paid
  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    const paymentEntity = payload?.payload?.payment?.entity
    const orderId = paymentEntity?.order_id || payload?.payload?.order?.entity?.id
    const paymentId = paymentEntity?.id || 'pay_wh_' + eventId.slice(0, 10)

    if (orderId) {
      await withTransaction(async (client) => {
        const funding = await findFundingByOrderId(orderId, client)
        if (funding && funding.status === 'PENDING') {
          await markFundingPaid(
            {
              id: funding.id,
              paymentId,
              signature: signature || 'wh_verified',
            },
            client,
          )

          const { rows: milestones } = await client.query(
            `SELECT * FROM milestones WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC`,
            [funding.project_id],
          )

          const fundItems = milestones.map((m) => ({
            projectId: funding.project_id,
            milestoneId: m.id,
            fundingId: funding.id,
            amount: Number(m.amount),
          }))

          await insertMilestoneFundsBatch(fundItems, client)

          await insertAuditLog(
            {
              actorId: funding.client_id,
              projectId: funding.project_id,
              action: 'PROJECT_FUNDED_WEBHOOK',
              metadata: {
                fundingId: funding.id,
                orderId,
                paymentId,
                eventId,
              },
            },
            client,
          )
        }
      })
    }
  }

  if (eventType === 'payment.failed') {
    const orderId = payload?.payload?.payment?.entity?.order_id
    if (orderId) {
      await withTransaction(async (client) => {
        const funding = await findFundingByOrderId(orderId, client)
        if (funding && funding.status === 'PENDING') {
          await markFundingFailed({ id: funding.id, metadata: payload }, client)
        }
      })
    }
  }

  return { status: 'processed', eventId }
}
