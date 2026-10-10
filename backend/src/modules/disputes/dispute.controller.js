import { asyncHandler } from '../../utils/asyncHandler.js'
import * as disputeService from './dispute.service.js'
import {
  assertUuid,
  decisionSchema,
  evidenceSchema,
  openDisputeSchema,
  parseBody,
} from './dispute.validation.js'

function parseMaybeJsonBody(body) {
  if (body == null) return {}
  if (typeof body === 'object' && !Buffer.isBuffer(body)) {
    const out = { ...body }
    if (out.externalUrl === '') out.externalUrl = null
    if (out.notes === '') out.notes = null
    if (out.claimSummary === '') out.claimSummary = null
    if (out.openPaymentId === '' || out.openPaymentId === 'null') {
      out.openPaymentId = null
    }
    if (out.resolvePaymentId === '' || out.resolvePaymentId === 'null') {
      out.resolvePaymentId = null
    }
    if (
      typeof out.splitReleaseToFreelancer === 'string' &&
      out.splitReleaseToFreelancer !== ''
    ) {
      out.splitReleaseToFreelancer = Number(out.splitReleaseToFreelancer)
    }
    return out
  }
  return {}
}

export const listForProject = asyncHandler(async (req, res) => {
  const projectId = assertUuid(req.params.id, 'project id')
  const result = await disputeService.listProjectDisputes(req.user, projectId)
  res.json(result)
})

export const openForMilestone = asyncHandler(async (req, res) => {
  const milestoneId = assertUuid(req.params.id, 'milestone id')
  const body = parseBody(openDisputeSchema, parseMaybeJsonBody(req.body))
  const result = await disputeService.openDispute(req.user, milestoneId, body)
  res.status(201).json(result)
})

export const getById = asyncHandler(async (req, res) => {
  const disputeId = assertUuid(req.params.id, 'dispute id')
  const dispute = await disputeService.getDispute(req.user, disputeId)
  res.json({ dispute })
})

export const claim = asyncHandler(async (req, res) => {
  const disputeId = assertUuid(req.params.id, 'dispute id')
  const result = await disputeService.claimForReview(req.user, disputeId)
  res.json(result)
})

export const decide = asyncHandler(async (req, res) => {
  const disputeId = assertUuid(req.params.id, 'dispute id')
  const body = parseBody(decisionSchema, parseMaybeJsonBody(req.body))
  const result = await disputeService.decideDispute(req.user, disputeId, body)
  res.json(result)
})

export const addEvidence = asyncHandler(async (req, res) => {
  const disputeId = assertUuid(req.params.id, 'dispute id')
  const input = parseBody(evidenceSchema, parseMaybeJsonBody(req.body))
  const file = req.file
    ? {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      }
    : null

  const result = await disputeService.addEvidence(
    req.user,
    disputeId,
    input,
    file,
  )
  res.status(201).json(result)
})

export const downloadEvidence = asyncHandler(async (req, res) => {
  const evidenceId = assertUuid(req.params.evidenceId, 'evidence id')
  const file = await disputeService.downloadEvidenceFile(
    req.user,
    evidenceId,
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
