import { asyncHandler } from '../../utils/asyncHandler.js'
import * as submissionService from './submission.service.js'
import {
  assertUuid,
  createSubmissionSchema,
  parseBody,
  reviewSubmissionSchema,
} from './submission.validation.js'

function parseMaybeJsonBody(body) {
  // Multipart fields arrive as strings; JSON route sends objects.
  if (body == null) return {}
  if (typeof body === 'object' && !Buffer.isBuffer(body)) {
    const out = { ...body }
    if (out.sha256Hash === '' || out.sha256Hash === 'null') {
      out.sha256Hash = null
    }
    if (out.agreementId === '' || out.agreementId === 'null') {
      out.agreementId = null
    }
    if (out.externalUrl === '') out.externalUrl = null
    if (out.notes === '') out.notes = null
    return out
  }
  return {}
}

export const listForMilestone = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'milestone id')
  const result = await submissionService.listSubmissions(req.user, req.params.id)
  res.json(result)
})

export const createForMilestone = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'milestone id')
  const input = parseBody(createSubmissionSchema, parseMaybeJsonBody(req.body))
  const file = req.file
    ? {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      }
    : null

  const result = await submissionService.createSubmission(
    req.user,
    req.params.id,
    input,
    file,
  )
  res.status(201).json(result)
})

export const getById = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'submission id')
  const result = await submissionService.getSubmission(req.user, req.params.id)
  res.json(result)
})

export const review = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'submission id')
  const input = parseBody(reviewSubmissionSchema, req.body)
  const result = await submissionService.reviewSubmission(
    req.user,
    req.params.id,
    input,
  )
  res.json(result)
})

export const downloadFile = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'submission id')
  const file = await submissionService.downloadSubmissionFile(
    req.user,
    req.params.id,
  )

  res.setHeader('Content-Type', file.contentType)
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(file.filename)}"`,
  )
  res.setHeader('X-Content-SHA256', file.sha256Hash || '')
  res.setHeader('Cache-Control', 'private, no-store')
  res.status(200).send(file.buffer)
})
