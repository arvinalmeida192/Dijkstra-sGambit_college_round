import { asyncHandler } from '../../utils/asyncHandler.js'
import * as milestoneService from './milestone.service.js'
import {
  assertUuid,
  createMilestoneSchema,
  parseBody,
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
