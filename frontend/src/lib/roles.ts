/** Roles that may self-register via the public auth UI. */
export const REGISTERABLE_ROLES = ['CLIENT', 'FREELANCER'] as const

/** All application roles returned by the API (includes seeded arbitrators). */
export const USER_ROLES = ['CLIENT', 'FREELANCER', 'ARBITRATOR'] as const

export type RegisterableRole = (typeof REGISTERABLE_ROLES)[number]
export type UserRole = (typeof USER_ROLES)[number]

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  CLIENT: 'Client',
  FREELANCER: 'Freelancer',
  ARBITRATOR: 'Arbitrator',
}
