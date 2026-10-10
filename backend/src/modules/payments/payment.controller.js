import { asyncHandler } from '../../utils/asyncHandler.js'
import * as paymentService from './payment.service.js'
import {
  assertUuid,
  parseBody,
  reportPaymentSchema,
} from './payment.validation.js'

export const listForProject = asyncHandler(async (req, res) => {
  const projectId = assertUuid(req.params.id, 'project id')
  const result = await paymentService.listProjectPayments(req.user, projectId)
  res.json(result)
})

export const listForMilestone = asyncHandler(async (req, res) => {
  const milestoneId = assertUuid(req.params.id, 'milestone id')
  const result = await paymentService.listMilestonePayments(
    req.user,
    milestoneId,
  )
  res.json(result)
})

export const reportForMilestone = asyncHandler(async (req, res) => {
  const milestoneId = assertUuid(req.params.id, 'milestone id')
  const body = parseBody(reportPaymentSchema, req.body)
  const result = await paymentService.reportMilestonePayment(
    req.user,
    milestoneId,
    body,
  )
  const created = result.payment.status === 'PENDING' && !result.verification.ok
  res.status(created ? 202 : 201).json(result)
})

export const getById = asyncHandler(async (req, res) => {
  const paymentId = assertUuid(req.params.id, 'payment id')
  const payment = await paymentService.getPayment(req.user, paymentId)
  res.json({ payment })
})

export const syncById = asyncHandler(async (req, res) => {
  const paymentId = assertUuid(req.params.id, 'payment id')
  const result = await paymentService.syncPayment(req.user, paymentId)
  res.json(result)
})
