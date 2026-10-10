import type { BadgeTone } from './milestoneStatus'
import type { AgreementStatus } from './api/agreements'

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  PROPOSED: 'Proposed',
  ACTIVE: 'Active',
  SUPERSEDED: 'Superseded',
  WITHDRAWN: 'Withdrawn',
}

export const AGREEMENT_STATUS_TONES: Record<AgreementStatus, BadgeTone> = {
  PROPOSED: 'warning',
  ACTIVE: 'success',
  SUPERSEDED: 'neutral',
  WITHDRAWN: 'neutral',
}

export function formatAmountBaseUnits(amount: number): string {
  // Display as major units assuming 2 decimal places (e.g. cents → dollars).
  const major = amount / 100
  return major.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
