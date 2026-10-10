import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import * as notificationController from './notification.controller.js'

/**
 * Notifications (Phase 19) — deterministic deadline/inactivity alerts.
 *
 *   GET  /api/v1/notifications
 *   POST /api/v1/notifications/:id/read
 *   POST /api/v1/notifications/read-all
 *   POST /api/v1/notifications/run-jobs
 */

export const notificationsRouter = Router()

notificationsRouter.use(authenticate(true))

notificationsRouter.get('/', notificationController.listMine)
notificationsRouter.post('/read-all', notificationController.markAllRead)
notificationsRouter.post('/run-jobs', notificationController.runJobs)
notificationsRouter.post('/:id/read', notificationController.markRead)
