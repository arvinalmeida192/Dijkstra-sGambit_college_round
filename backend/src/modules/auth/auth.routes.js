import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { authenticate } from '../../middleware/authenticate.js'
import * as authController from './auth.controller.js'

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many authentication attempts. Try again later.',
  },
})

export const authRouter = Router()

authRouter.post('/register', authLimiter, authController.register)
authRouter.post('/login', authLimiter, authController.login)
authRouter.get('/me', authenticate(true), authController.me)
