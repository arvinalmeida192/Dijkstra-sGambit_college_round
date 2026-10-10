import { asyncHandler } from '../../utils/asyncHandler.js'
import { badRequest } from '../../utils/errors.js'
import * as notificationService from './notification.service.js'

export const listMine = asyncHandler(async (req, res) => {
  const unreadOnly =
    String(req.query.unreadOnly ?? '').toLowerCase() === 'true'
  const result = await notificationService.listMine(req.user, { unreadOnly })
  res.json(result)
})

export const markRead = asyncHandler(async (req, res) => {
  const id = req.params.id
  if (!id) throw badRequest('Notification id required.')
  const result = await notificationService.markRead(req.user, id)
  res.json(result)
})

export const markAllRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAll(req.user)
  res.json(result)
})

export const runJobs = asyncHandler(async (req, res) => {
  const result = await notificationService.runJobs(req.user)
  res.json(result)
})
