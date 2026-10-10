import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRoles } from '../../middleware/authorize.js'
import { projectAgreementsRouter } from '../agreements/agreement.routes.js'
import * as projectController from './project.controller.js'

/**
 * Projects & invitations (Phase 08) + nested agreements (Phase 10)
 *
 * GET    /api/v1/projects
 * POST   /api/v1/projects                      (CLIENT)
 * GET    /api/v1/projects/:id
 * POST   /api/v1/projects/:id/invitations      (project client)
 * GET    /api/v1/projects/:id/agreements
 * POST   /api/v1/projects/:id/agreements       (CLIENT)
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

invitationsRouter.get('/:token', projectController.previewInvitation)
invitationsRouter.post(
  '/:token/accept',
  authenticate(true),
  requireRoles('FREELANCER'),
  projectController.acceptInvitation,
)
