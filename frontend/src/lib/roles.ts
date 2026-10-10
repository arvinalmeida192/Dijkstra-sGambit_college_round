export const USER_ROLES = ['CLIENT', 'FREELANCER'] as const

export type UserRole = (typeof USER_ROLES)[number]

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  CLIENT: 'Client',
  FREELANCER: 'Freelancer',
}
