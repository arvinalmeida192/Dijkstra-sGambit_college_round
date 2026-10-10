import { AppError } from '../utils/errors.js'
import { env } from '../config/env.js'

export function notFoundHandler(_req, res) {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'Route not found.',
  })
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    })
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid JSON body.',
    })
  }

  console.error(err)
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: env.isTest || env.nodeEnv === 'production'
      ? 'Internal server error.'
      : err.message || 'Internal server error.',
  })
}
