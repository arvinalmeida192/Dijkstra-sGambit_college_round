import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRoles } from '../../middleware/authorize.js'
import { milestoneSubmissionsRouter } from '../submissions/submission.routes.js'
import { milestonePaymentsRouter } from '../payments/payment.routes.js'
import * as milestoneController from './milestone.controller.js'

/**
 * Milestones (Phase 12) + nested submissions (Phase 14) + payments (Phase 17)
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
