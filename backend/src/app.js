import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env.js'
import { authRouter } from './modules/auth/auth.routes.js'
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
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'fairwork-api' })
  })

  app.use('/api/v1/auth', authRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
