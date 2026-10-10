import { asyncHandler } from '../../utils/asyncHandler.js'
import { parseBody, registerSchema, loginSchema } from './auth.validation.js'
import * as authService from './auth.service.js'

export const register = asyncHandler(async (req, res) => {
  const input = parseBody(registerSchema, req.body)
  const session = await authService.registerUser(input)
  res.status(201).json(session)
})

export const login = asyncHandler(async (req, res) => {
  const input = parseBody(loginSchema, req.body)
  const session = await authService.loginUser(input)
  res.status(200).json(session)
})

export const me = asyncHandler(async (req, res) => {
  const user = await authService.getCurrentUser(req.user.id)
  res.status(200).json({ user })
})
