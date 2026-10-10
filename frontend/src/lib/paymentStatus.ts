import type { BadgeTone } from './milestoneStatus'
import type { PaymentStatus } from './api/payments'

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Funded',
  RELEASED: 'Released',
  REFUNDED: 'Refunded',
  DISPUTED: 'Disputed',
  FAILED: 'Failed',
}

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, BadgeTone> = {
  PENDING: 'warning',
  CONFIRMED: 'accent',
  RELEASED: 'success',
  REFUNDED: 'neutral',
  DISPUTED: 'danger',
  FAILED: 'danger',
}
