import type { RegisterableRole } from './roles'
import { REGISTERABLE_ROLES } from './roles'

export type FieldErrors = Record<string, string>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email: string): string | undefined {
  const value = email.trim()
  if (!value) return 'Email is required.'
  if (!EMAIL_RE.test(value)) return 'Enter a valid email address.'
  return undefined
}

export function validatePassword(password: string): string | undefined {
  if (!password) return 'Password is required.'
  if (password.length < 8) return 'Password must be at least 8 characters.'
  return undefined
}

export function validateName(name: string): string | undefined {
  const value = name.trim()
  if (!value) return 'Name is required.'
  if (value.length < 2) return 'Name must be at least 2 characters.'
  return undefined
}

export function validateRole(role: string): string | undefined {
  if (!(REGISTERABLE_ROLES as readonly string[]).includes(role)) {
    return 'Select Client or Freelancer.'
  }
  return undefined
}

export function validateLoginForm(input: {
  email: string
  password: string
}): FieldErrors {
  const errors: FieldErrors = {}
  const emailError = validateEmail(input.email)
  const passwordError = validatePassword(input.password)
  if (emailError) errors.email = emailError
  if (passwordError) errors.password = passwordError
  return errors
}

export function validateRegisterForm(input: {
  name: string
  email: string
  password: string
  confirmPassword: string
  role: RegisterableRole | ''
}): FieldErrors {
  const errors: FieldErrors = {}
  const nameError = validateName(input.name)
  const emailError = validateEmail(input.email)
  const passwordError = validatePassword(input.password)
  const roleError = validateRole(input.role)

  if (nameError) errors.name = nameError
  if (emailError) errors.email = emailError
  if (passwordError) errors.password = passwordError
  if (roleError) errors.role = roleError
  if (!input.confirmPassword) {
    errors.confirmPassword = 'Confirm your password.'
  } else if (input.password !== input.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.'
  }
  return errors
}
