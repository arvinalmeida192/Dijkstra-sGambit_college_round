import { asyncHandler } from '../../utils/asyncHandler.js'
import * as fundingService from './funding.service.js'
import {
  assertUuid,
  createOrderSchema,
  parseBody,
  releaseMilestoneSchema,
  verifyPaymentSchema,
} from './funding.validation.js'

export const getStatus = asyncHandler(async (req, res) => {
  const projectId = assertUuid(req.params.id || req.query.projectId, 'project id')
  const result = await fundingService.getFundingStatus(req.user, projectId)
  res.json(result)
})

export const createOrder = asyncHandler(async (req, res) => {
  const projectId = assertUuid(req.params.id, 'project id')
  const body = parseBody(createOrderSchema, req.body)
  const result = await fundingService.createOrder(req.user, projectId, body)
  res.status(201).json(result)
})

export const verifyPayment = asyncHandler(async (req, res) => {
  const projectId = assertUuid(req.params.id, 'project id')
  const body = parseBody(verifyPaymentSchema, req.body)
  const result = await fundingService.verifyPayment(req.user, projectId, body)
  res.json(result)
})

export const releaseMilestone = asyncHandler(async (req, res) => {
  const milestoneId = assertUuid(req.params.milestoneId, 'milestone id')
  const body = parseBody(releaseMilestoneSchema, req.body)
  const result = await fundingService.releaseMilestone(req.user, milestoneId, body)
  res.json(result)
})

export const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature']
  const rawBody = req.body // Express raw buffer or string
  let payload = {}
  try {
    payload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    payload = {}
  }
  const result = await fundingService.processWebhook({
    rawBody,
    signature,
    payload,
  })
  res.json(result)
})

