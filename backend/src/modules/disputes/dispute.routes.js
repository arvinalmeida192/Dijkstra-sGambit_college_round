import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRoles } from '../../middleware/authorize.js'
import { storageConfig } from '../../config/storage.js'
import { badRequest } from '../../utils/errors.js'
import { disputeAssessmentsRouter } from '../ai/ai.routes.js'
import * as disputeController from './dispute.controller.js'

/**
 * Disputes (Phase 18) + AI evidence summaries (Phase 19)
 *
 * Nested under projects (auth inherited):
 *   GET  /api/v1/projects/:id/disputes
 *
 * Nested under milestones (auth inherited when mounted):
 *   POST /api/v1/milestones/:id/disputes   — client/freelancer open
 *
 * Standalone:
 *   GET  /api/v1/disputes/:id
 *   POST /api/v1/disputes/:id/claim       — ARBITRATOR
 *   POST /api/v1/disputes/:id/decide      — ARBITRATOR (records decision only)
 *   POST /api/v1/disputes/:id/evidence    — multipart or JSON
 *   GET  /api/v1/disputes/evidence/:evidenceId/file
 *   GET|POST /api/v1/disputes/:id/assessments
 */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: storageConfig.maxUploadBytes, files: 1 },
  fileFilter(_req, file, cb) {
    if (
      file.mimetype &&
      !storageConfig.allowedMimeTypes.includes(file.mimetype)
    ) {
      cb(badRequest(`Unsupported content type: ${file.mimetype}`))
      return
    }
    cb(null, true)
  },
})

function optionalUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next()
    if (err instanceof multer.MulterError) {
      return next(
        badRequest(
          err.code === 'LIMIT_FILE_SIZE'
            ? `File exceeds maximum size of ${storageConfig.maxUploadBytes} bytes.`
            : err.message,
        ),
      )
    }
    return next(err)
  })
}

export const projectDisputesRouter = Router({ mergeParams: true })
export const milestoneDisputesRouter = Router({ mergeParams: true })
export const disputesRouter = Router()

projectDisputesRouter.get('/', disputeController.listForProject)

milestoneDisputesRouter.post(
  '/',
  requireRoles('CLIENT', 'FREELANCER'),
  disputeController.openForMilestone,
)

disputesRouter.use(authenticate(true))

disputesRouter.get(
  '/evidence/:evidenceId/file',
  disputeController.downloadEvidence,
)
disputesRouter.use('/:id/assessments', disputeAssessmentsRouter)
disputesRouter.get('/:id', disputeController.getById)
disputesRouter.post(
  '/:id/claim',
  requireRoles('ARBITRATOR'),
  disputeController.claim,
)
disputesRouter.post(
  '/:id/decide',
  requireRoles('ARBITRATOR'),
  disputeController.decide,
)
disputesRouter.post(
  '/:id/resolve',
  requireRoles('ARBITRATOR'),
  disputeController.resolve,
)
disputesRouter.post(
  '/:id/propose-resolution',
  requireRoles('CLIENT', 'FREELANCER'),
  disputeController.proposeResolution,
)
disputesRouter.post(
  '/:id/accept-resolution',
  requireRoles('CLIENT', 'FREELANCER'),
  disputeController.acceptResolution,
)
disputesRouter.post(
  '/:id/evidence',
  optionalUpload,
  disputeController.addEvidence,
)
