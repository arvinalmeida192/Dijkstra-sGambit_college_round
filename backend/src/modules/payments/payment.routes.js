import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import * as paymentController from './payment.controller.js'

/**
 * Payments & chain verification (Phase 17)
 *
 * Nested under projects (auth inherited):
 *   GET  /api/v1/projects/:id/payments
 *
 * Nested under milestones (auth inherited when mounted):
 *   GET  /api/v1/milestones/:id/payments
 *   POST /api/v1/milestones/:id/payments   { txHash } — report; status from chain only
 *
 * Standalone:
 *   GET  /api/v1/payments/:id
 *   POST /api/v1/payments/:id/sync        — re-verify receipt/events (idempotent)
 */

export const projectPaymentsRouter = Router({ mergeParams: true })
export const milestonePaymentsRouter = Router({ mergeParams: true })
export const paymentsRouter = Router()

projectPaymentsRouter.get('/', paymentController.listForProject)

milestonePaymentsRouter.get('/', paymentController.listForMilestone)
milestonePaymentsRouter.post('/', paymentController.reportForMilestone)

paymentsRouter.use(authenticate(true))
paymentsRouter.get('/:id', paymentController.getById)
paymentsRouter.post('/:id/sync', paymentController.syncById)
