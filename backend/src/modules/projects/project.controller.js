import { asyncHandler } from '../../utils/asyncHandler.js'
import * as projectService from './project.service.js'
import {
  assertUuid,
  createInvitationSchema,
  createProjectSchema,
  listProjectsQuerySchema,
  parseBody,
  parseQuery,
} from './project.validation.js'

export const create = asyncHandler(async (req, res) => {
  const input = parseBody(createProjectSchema, req.body)
  const project = await projectService.createProject(req.user, input)
  res.status(201).json({ project })
})

export const list = asyncHandler(async (req, res) => {
  const query = parseQuery(listProjectsQuerySchema, req.query)
  const result = await projectService.listProjects(req.user, query)
  res.status(200).json(result)
})

export const getById = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'project id')
  const project = await projectService.getProject(req.user, req.params.id)
  res.status(200).json({ project })
})

export const createInvitation = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'project id')
  const input = parseBody(createInvitationSchema, req.body)
  const result = await projectService.createInvitation(
    req.user,
    req.params.id,
    input,
  )
  res.status(201).json(result)
})

export const previewInvitation = asyncHandler(async (req, res) => {
  const preview = await projectService.previewInvitation(req.params.token)
  res.status(200).json({ invitation: preview })
})

export const acceptInvitation = asyncHandler(async (req, res) => {
  const project = await projectService.acceptInvitation(
    req.user,
    req.params.token,
  )
  res.status(200).json({ project })
})

export const rejectInvitation = asyncHandler(async (req, res) => {
  const result = await projectService.rejectInvitation(
    req.user,
    req.params.token,
  )
  res.status(200).json(result)
})

export const withdrawInvitation = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'project id')
  assertUuid(req.params.invitationId, 'invitation id')
  const result = await projectService.withdrawInvitation(
    req.user,
    req.params.id,
    req.params.invitationId,
  )
  res.status(200).json(result)
})
