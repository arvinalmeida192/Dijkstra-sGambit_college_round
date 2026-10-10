import { describe, expect, it } from 'vitest'
import {
  parseBody,
  registerSchema,
  loginSchema,
} from '../../src/modules/auth/auth.validation.js'
import { AppError } from '../../src/utils/errors.js'

describe('auth.validation', () => {
  it('accepts a valid registration payload', () => {
    const data = parseBody(registerSchema, {
      name: '  Casey  ',
      email: ' casey@example.com ',
      password: 'password123',
      role: 'FREELANCER',
    })
    expect(data).toEqual({
      name: 'Casey',
      email: 'casey@example.com',
      password: 'password123',
      role: 'FREELANCER',
    })
  })

  it('rejects login without password', () => {
    expect(() =>
      parseBody(loginSchema, { email: 'a@b.com', password: '' }),
    ).toThrow(AppError)
  })
})
