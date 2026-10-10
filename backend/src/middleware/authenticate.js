import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { unauthorized } from '../utils/errors.js'
import { findUserById } from '../modules/auth/auth.repository.js'
import { asyncHandler } from '../utils/asyncHandler.js'

export function authenticate(required = true) {
  return asyncHandler(async (req, _res, next) => {
    const header = req.headers.authorization
    if (!header) {
      if (!required) {
        req.user = null
        return next()
      }
      throw unauthorized('Missing Authorization header.')
    }

    const [scheme, token] = header.split(' ')
    if (scheme !== 'Bearer' || !token) {
      throw unauthorized('Invalid Authorization header. Use Bearer <token>.')
    }

    let payload
    try {
      payload = jwt.verify(token, env.jwtSecret)
    } catch {
      throw unauthorized('Invalid or expired token.')
    }

    const userId = payload?.sub
    if (!userId || typeof userId !== 'string') {
      throw unauthorized('Invalid token payload.')
    }

    const user = await findUserById(userId)
    if (!user) {
      throw unauthorized('User no longer exists.')
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      walletAddress: user.wallet_address,
    }
    next()
  })
}
