import { asyncHandler } from '../../utils/asyncHandler.js'
import * as aiService from './ai.service.js'
import {
  assertUuid,
  assessSubmissionSchema,
  benchmarkSchema,
  parseBody,
} from './ai.validation.js'

export const assessSubmission = asyncHandler(async (req, res) => {
  const submissionId = assertUuid(req.params.id, 'submission id')
  const body = parseBody(assessSubmissionSchema, req.body)
  const result = await aiService.assessSubmission(req.user, submissionId, body)
  res.status(201).json(result)
})

export const latestForSubmission = asyncHandler(async (req, res) => {
  const submissionId = assertUuid(req.params.id, 'submission id')
  const result = await aiService.getLatestForSubmission(req.user, submissionId)
  res.json(result)
})

export const listForSubmission = asyncHandler(async (req, res) => {
  const submissionId = assertUuid(req.params.id, 'submission id')
  const result = await aiService.listForSubmission(req.user, submissionId)
  res.json(result)
})

export const listForMilestone = asyncHandler(async (req, res) => {
  const milestoneId = assertUuid(req.params.id, 'milestone id')
  const result = await aiService.listForMilestone(req.user, milestoneId)
  res.json(result)
})

export const summarizeDispute = asyncHandler(async (req, res) => {
  const disputeId = assertUuid(req.params.id, 'dispute id')
  const result = await aiService.summarizeDispute(req.user, disputeId)
  res.status(201).json(result)
})

export const latestForDispute = asyncHandler(async (req, res) => {
  const disputeId = assertUuid(req.params.id, 'dispute id')
  const result = await aiService.getLatestForDispute(req.user, disputeId)
  res.json(result)
})

export const listForDispute = asyncHandler(async (req, res) => {
  const disputeId = assertUuid(req.params.id, 'dispute id')
  const result = await aiService.listForDispute(req.user, disputeId)
  res.json(result)
})

export const benchmark = asyncHandler(async (req, res) => {
  const body = parseBody(benchmarkSchema, req.body)
  const result = await aiService.benchmarkModels(req.user, body)
  res.json(result)
})
