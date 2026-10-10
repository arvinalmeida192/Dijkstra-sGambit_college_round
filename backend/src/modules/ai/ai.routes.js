import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRoles } from '../../middleware/authorize.js'
import * as aiController from './ai.controller.js'

/**
 * AI assessments (Phase 19) — advisory only.
 *
 *   POST /api/v1/submissions/:id/assessments
 *   GET  /api/v1/submissions/:id/assessments
 *   GET  /api/v1/submissions/:id/assessments/latest
 *   GET  /api/v1/milestones/:id/assessments
 *   POST /api/v1/disputes/:id/assessments
 *   GET  /api/v1/disputes/:id/assessments
 *   GET  /api/v1/disputes/:id/assessments/latest
 *   POST /api/v1/ai/benchmark
 */

export const submissionAssessmentsRouter = Router({ mergeParams: true })
export const milestoneAssessmentsRouter = Router({ mergeParams: true })
export const disputeAssessmentsRouter = Router({ mergeParams: true })
export const aiRouter = Router()

submissionAssessmentsRouter.post('/', aiController.assessSubmission)
submissionAssessmentsRouter.get('/latest', aiController.latestForSubmission)
submissionAssessmentsRouter.get('/', aiController.listForSubmission)

milestoneAssessmentsRouter.get('/', aiController.listForMilestone)

disputeAssessmentsRouter.post('/', aiController.summarizeDispute)
disputeAssessmentsRouter.get('/latest', aiController.latestForDispute)
disputeAssessmentsRouter.get('/', aiController.listForDispute)

aiRouter.use(authenticate(true))
aiRouter.post(
  '/benchmark',
  requireRoles('CLIENT', 'ARBITRATOR'),
  aiController.benchmark,
)
