import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import {
  executeVerifiedReleaseHandler,
  getMilestoneVerificationHandler,
  triggerSubmissionVerificationHandler,
  updateVerifierKeyHandler,
} from './verification.controller.js'

export const verificationRouter = Router()

verificationRouter.use(authenticate(true))

verificationRouter.get(
  '/milestones/:milestoneId/verifications',
  getMilestoneVerificationHandler,
)
verificationRouter.post(
  '/submissions/:submissionId/verify',
  triggerSubmissionVerificationHandler,
)
verificationRouter.post(
  '/milestones/:milestoneId/verified-release',
  executeVerifiedReleaseHandler,
)
verificationRouter.post(
  '/verifiers/keys',
  updateVerifierKeyHandler,
)
