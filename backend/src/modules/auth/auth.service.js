import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
import { conflict, unauthorized } from '../../utils/errors.js'
import {
  createUser,
  findUserByEmail,
  findUserById,
  toPublicUser,
} from './auth.repository.js'

const BCRYPT_ROUNDS = 12

export async function registerUser(input) {
  const existing = await findUserByEmail(input.email)
  if (existing) {
    throw conflict('An account with this email already exists.')
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)
  const user = await createUser({
    name: input.name,
    email: input.email,
    passwordHash,
    role: input.role,
  })

  return issueSession(user)
}

export async function loginUser(input) {
  const user = await findUserByEmail(input.email)
  if (!user) {
    throw unauthorized('Invalid email or password.')
  }

  const ok = await bcrypt.compare(input.password, user.password_hash)
  if (!ok) {
    throw unauthorized('Invalid email or password.')
  }

  return issueSession(user)
}

export async function getCurrentUser(userId) {
  const user = await findUserById(userId)
  if (!user) {
    throw unauthorized('User no longer exists.')
  }
  return toPublicUser(user)
}

function issueSession(userRow) {
  const user = toPublicUser(userRow)
  const token = jwt.sign(
    { role: user.role },
    env.jwtSecret,
    {
      subject: user.id,
      expiresIn: env.jwtExpiresIn,
    },
  )
  return { token, user }
}
