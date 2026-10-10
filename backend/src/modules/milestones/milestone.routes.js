import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRoles } from '../../middleware/authorize.js'
import { milestoneSubmissionsRouter } from '../submissions/submission.routes.js'
import { milestonePaymentsRouter } from '../payments/payment.routes.js'
import { milestoneDisputesRouter } from '../disputes/dispute.routes.js'
import { milestoneAssessmentsRouter } from '../ai/ai.routes.js'
import * as milestoneController from './milestone.controller.js'

/**
 * Milestones (Phase 12) + nested submissions (Phase 14) + payments (Phase 17)
 * + disputes (Phase 18) + AI assessments list (Phase 19)
 *
 * Nested under projects (auth inherited from projectsRouter):
 *   GET    /api/v1/projects/:id/milestones
 *   POST   /api/v1/projects/:id/milestones          (CLIENT)
 *
 * Standalone:
 *   GET    /api/v1/milestones/:id
 *   PATCH  /api/v1/milestones/:id                   (CLIENT, PENDING only)
 *   DELETE /api/v1/milestones/:id                   (CLIENT, PENDING only)
 *   PATCH  /api/v1/milestones/:id/status
 *   GET|POST /api/v1/milestones/:id/submissions
 *   GET|POST /api/v1/milestones/:id/payments
 *   POST   /api/v1/milestones/:id/disputes
 *   GET    /api/v1/milestones/:id/assessments
 */

export const projectMilestonesRouter = Router({ mergeParams: true })
export const milestonesRouter = Router()

projectMilestonesRouter.get('/', milestoneController.listForProject)
projectMilestonesRouter.post(
  '/',
  requireRoles('CLIENT'),
  milestoneController.createForProject,
)

milestonesRouter.use(authenticate(true))

milestonesRouter.use('/:id/submissions', milestoneSubmissionsRouter)
milestonesRouter.use('/:id/payments', milestonePaymentsRouter)
milestonesRouter.use('/:id/disputes', milestoneDisputesRouter)
milestonesRouter.use('/:id/assessments', milestoneAssessmentsRouter)

milestonesRouter.get('/:id', milestoneController.getById)
milestonesRouter.patch(
  '/:id',
  requireRoles('CLIENT'),
  milestoneController.updateById,
)
milestonesRouter.delete(
  '/:id',
  requireRoles('CLIENT'),
  milestoneController.removeById,
)
milestonesRouter.patch('/:id/status', milestoneController.updateStatus)

milestonesRouter.get('/:id/extensions', milestoneController.listExtensions)
milestonesRouter.post('/:id/extensions', milestoneController.proposeExtension)
milestonesRouter.post(
  '/:id/extensions/:extId/respond',
  milestoneController.respondExtension,
)
milestonesRouter.post(
  '/:id/cancel-and-reclaim',
  requireRoles('CLIENT'),
  milestoneController.cancelAndReclaim,
)
milestonesRouter.post(
  '/:id/execute-auto-release',
  milestoneController.executeAutoRelease,
)
milestonesRouter.post(
  '/:id/execute-reclaim',
  requireRoles('CLIENT'),
  milestoneController.executeReclaim,
)
