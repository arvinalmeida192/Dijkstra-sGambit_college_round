import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRoles } from '../../middleware/authorize.js'
import { storageConfig } from '../../config/storage.js'
import { badRequest } from '../../utils/errors.js'
import * as submissionController from './submission.controller.js'

/**
 * Submissions & reviews (Phase 14)
 *
 * Nested under milestones (auth inherited when mounted under milestonesRouter):
 *   GET  /api/v1/milestones/:id/submissions
 *   POST /api/v1/milestones/:id/submissions   (FREELANCER, multipart or JSON)
 *
 * Standalone:
 *   GET  /api/v1/submissions/:id
 *   GET  /api/v1/submissions/:id/file         (authorized download; private storage)
 *   POST /api/v1/submissions/:id/review       (CLIENT)
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

export const milestoneSubmissionsRouter = Router({ mergeParams: true })
export const submissionsRouter = Router()

milestoneSubmissionsRouter.get('/', submissionController.listForMilestone)
milestoneSubmissionsRouter.post(
  '/',
  requireRoles('FREELANCER'),
  optionalUpload,
  submissionController.createForMilestone,
)

submissionsRouter.use(authenticate(true))

submissionsRouter.get('/:id', submissionController.getById)
submissionsRouter.get('/:id/file', submissionController.downloadFile)
submissionsRouter.post(
  '/:id/review',
  requireRoles('CLIENT'),
  submissionController.review,
)
