import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRoles } from '../../middleware/authorize.js'
import * as fundingController from './funding.controller.js'

export const projectFundingRouter = Router({ mergeParams: true })
export const fundingRouter = Router()

// All project-nested funding endpoints require authentication
projectFundingRouter.use(authenticate(true))

projectFundingRouter.get('/status', fundingController.getStatus)
projectFundingRouter.get('/', fundingController.getStatus)
projectFundingRouter.post(
  '/order',
  requireRoles('CLIENT'),
  fundingController.createOrder,
)
projectFundingRouter.post(
  '/verify',
  requireRoles('CLIENT'),
  fundingController.verifyPayment,
)
projectFundingRouter.post(
  '/milestones/:milestoneId/release',
  requireRoles('CLIENT'),
  fundingController.releaseMilestone,
)
projectFundingRouter.post(
  '/milestones/:milestoneId/claim',
  requireRoles('FREELANCER'),
  fundingController.claimMilestone,
)

// Standalone funding router
fundingRouter.use(authenticate(true))
fundingRouter.get('/status', fundingController.getStatus)
fundingRouter.post(
  '/milestones/:milestoneId/release',
  requireRoles('CLIENT'),
  fundingController.releaseMilestone,
)
fundingRouter.post(
  '/milestones/:milestoneId/claim',
  requireRoles('FREELANCER'),
  fundingController.claimMilestone,
)

