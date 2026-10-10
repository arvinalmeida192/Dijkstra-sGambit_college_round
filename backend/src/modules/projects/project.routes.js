import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRoles } from '../../middleware/authorize.js'
import { projectAgreementsRouter } from '../agreements/agreement.routes.js'
import { projectMilestonesRouter } from '../milestones/milestone.routes.js'
import { projectPaymentsRouter } from '../payments/payment.routes.js'
import { projectDisputesRouter } from '../disputes/dispute.routes.js'
import * as projectController from './project.controller.js'

/**
 * Projects & invitations (Phase 08) + nested agreements (Phase 10)
 * + nested milestones (Phase 12) + payments (Phase 17) + disputes (Phase 18)
 *
 * GET    /api/v1/projects
 * POST   /api/v1/projects                      (CLIENT)
 * GET    /api/v1/projects/:id
 * POST   /api/v1/projects/:id/invitations      (project client)
 * GET    /api/v1/projects/:id/agreements
 * POST   /api/v1/projects/:id/agreements       (CLIENT)
 * GET    /api/v1/projects/:id/milestones
 * POST   /api/v1/projects/:id/milestones       (CLIENT)
 * GET    /api/v1/projects/:id/payments
 * GET    /api/v1/projects/:id/disputes
 * GET    /api/v1/invitations/:token            (public preview)
 * POST   /api/v1/invitations/:token/accept     (FREELANCER)
 */

export const projectsRouter = Router()
export const invitationsRouter = Router()

projectsRouter.use(authenticate(true))

projectsRouter.get('/', projectController.list)
projectsRouter.post(
  '/',
  requireRoles('CLIENT'),
  projectController.create,
)
projectsRouter.get('/:id', projectController.getById)
projectsRouter.post(
  '/:id/invitations',
  requireRoles('CLIENT'),
  projectController.createInvitation,
)
projectsRouter.use('/:id/agreements', projectAgreementsRouter)
projectsRouter.use('/:id/milestones', projectMilestonesRouter)
projectsRouter.use('/:id/payments', projectPaymentsRouter)
projectsRouter.use('/:id/disputes', projectDisputesRouter)

invitationsRouter.get('/:token', projectController.previewInvitation)
invitationsRouter.post(
  '/:token/accept',
  authenticate(true),
  requireRoles('FREELANCER'),
  projectController.acceptInvitation,
)
