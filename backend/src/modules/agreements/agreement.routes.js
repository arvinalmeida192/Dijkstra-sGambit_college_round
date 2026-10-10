import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRoles } from '../../middleware/authorize.js'
import * as agreementController from './agreement.controller.js'

/**
 * Agreements (Phase 10)
 *
 * Nested under projects (auth inherited from projectsRouter):
 *   GET  /api/v1/projects/:id/agreements
 *   POST /api/v1/projects/:id/agreements          (CLIENT)
 *
 * Standalone:
 *   GET  /api/v1/agreements/:id
 *   POST /api/v1/agreements/:id/accept
 *   POST /api/v1/agreements/:id/propose-change
 */

export const projectAgreementsRouter = Router({ mergeParams: true })
export const agreementsRouter = Router()

projectAgreementsRouter.get('/', agreementController.listForProject)
projectAgreementsRouter.post(
  '/',
  requireRoles('CLIENT'),
  agreementController.createForProject,
)

agreementsRouter.use(authenticate(true))

agreementsRouter.get('/:id', agreementController.getById)
agreementsRouter.post('/:id/accept', agreementController.accept)
agreementsRouter.post('/:id/propose-change', agreementController.proposeChange)
