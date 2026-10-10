import { asyncHandler } from '../../utils/asyncHandler.js'
import * as milestoneService from './milestone.service.js'
import {
  assertUuid,
  cancelAndReclaimSchema,
  createMilestoneSchema,
  listAuditLogsQuerySchema,
  parseBody,
  parseQuery,
  proposeExtensionSchema,
  respondExtensionSchema,
  updateMilestoneSchema,
  updateStatusSchema,
} from './milestone.validation.js'

export const listForProject = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'project id')
  const result = await milestoneService.listMilestones(req.user, req.params.id)
  res.status(200).json(result)
})

export const createForProject = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'project id')
  const input = parseBody(createMilestoneSchema, req.body)
  const milestone = await milestoneService.createMilestone(
    req.user,
    req.params.id,
    input,
  )
  res.status(201).json({ milestone })
})

export const getById = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'milestone id')
  const milestone = await milestoneService.getMilestone(req.user, req.params.id)
  res.status(200).json({ milestone })
})

export const updateById = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'milestone id')
  const input = parseBody(updateMilestoneSchema, req.body)
  const milestone = await milestoneService.updateMilestone(
    req.user,
    req.params.id,
    input,
  )
  res.status(200).json({ milestone })
})

export const removeById = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'milestone id')
  const result = await milestoneService.removeMilestone(req.user, req.params.id)
  res.status(200).json(result)
})

export const updateStatus = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'milestone id')
  const input = parseBody(updateStatusSchema, req.body)
  const milestone = await milestoneService.changeMilestoneStatus(
    req.user,
    req.params.id,
    input,
  )
  res.status(200).json({ milestone })
})

export const listExtensions = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'milestone id')
  const result = await milestoneService.listExtensions(req.user, req.params.id)
  res.status(200).json(result)
})

export const proposeExtension = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'milestone id')
  const input = parseBody(proposeExtensionSchema, req.body)
  const extension = await milestoneService.proposeExtension(
    req.user,
    req.params.id,
    input,
  )
  res.status(201).json({ extension })
})

export const respondExtension = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'milestone id')
  assertUuid(req.params.extId, 'extension id')
  const input = parseBody(respondExtensionSchema, req.body)
  const result = await milestoneService.respondExtension(
    req.user,
    req.params.id,
    req.params.extId,
    input,
  )
  res.status(200).json(result)
})

export const cancelAndReclaim = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'milestone id')
  const input = parseBody(cancelAndReclaimSchema, req.body)
  const result = await milestoneService.cancelAndReclaimMilestone(
    req.user,
    req.params.id,
    input,
  )
  res.status(200).json(result)
})

export const executeAutoRelease = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'milestone id')
  const result = await milestoneService.executeMilestoneAutoRelease(
    req.user,
    req.params.id,
  )
  res.status(200).json(result)
})

export const executeReclaim = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'milestone id')
  const result = await milestoneService.executeMilestoneReclaim(
    req.user,
    req.params.id,
  )
  res.status(200).json(result)
})

export const listAuditLogsForProject = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'project id')
  const query = parseQuery(listAuditLogsQuerySchema, req.query)
  const result = await milestoneService.listProjectAuditLogs(
    req.user,
    req.params.id,
    query,
  )
  res.status(200).json(result)
})
