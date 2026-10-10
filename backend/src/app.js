import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { agreementsRouter } from './modules/agreements/agreement.routes.js'
import { milestonesRouter } from './modules/milestones/milestone.routes.js'
import {
  invitationsRouter,
  projectsRouter,
} from './modules/projects/project.routes.js'
import { submissionsRouter } from './modules/submissions/submission.routes.js'
import { paymentsRouter } from './modules/payments/payment.routes.js'
import { disputesRouter } from './modules/disputes/dispute.routes.js'
import { aiRouter } from './modules/ai/ai.routes.js'
import { notificationsRouter } from './modules/notifications/notification.routes.js'
import { fundingRouter } from './modules/funding/funding.routes.js'
import { webhook as fundingWebhook } from './modules/funding/funding.controller.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    }),
  )

  // Razorpay webhook endpoint with raw body parsing for signature verification
  app.post(
    '/api/v1/funding/webhook',
    express.raw({ type: '*/*', limit: '1mb' }),
    fundingWebhook,
  )

  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'fairwork-api' })
  })

  app.use('/api/v1/auth', authRouter)
  app.use('/api/v1/projects', projectsRouter)
  app.use('/api/v1/invitations', invitationsRouter)
  app.use('/api/v1/agreements', agreementsRouter)
  app.use('/api/v1/milestones', milestonesRouter)
  app.use('/api/v1/submissions', submissionsRouter)
  app.use('/api/v1/payments', paymentsRouter)
  app.use('/api/v1/disputes', disputesRouter)
  app.use('/api/v1/funding', fundingRouter)
  app.use('/api/v1/ai', aiRouter)
  app.use('/api/v1/notifications', notificationsRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
