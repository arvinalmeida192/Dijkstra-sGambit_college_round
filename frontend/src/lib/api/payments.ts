import { apiRequest } from './client'

export type PaymentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'RELEASED'
  | 'REFUNDED'
  | 'DISPUTED'
  | 'FAILED'

export type Payment = {
  id: string
  projectId: string
  milestoneId: string
  agreementId: string | null
  amount: number
  amountTokenBase: string | null
  escrowAddress: string | null
  tokenAddress: string | null
  chainId: number
  onChainAgreementId: string | null
  onChainMilestoneId: string | null
  txHash: string | null
  eventName: string | null
  blockNumber: number | null
  status: PaymentStatus
  failureReason: string | null
  reconciliation: Record<string, unknown>
  reportedBy: string | null
  verifiedAt: string | null
  createdAt: string
  updatedAt: string
  isTestNetwork: boolean
}

export type PaymentVerification = {
  ok: boolean
  pending: boolean
  status: PaymentStatus
  eventName: string | null
  failureReason: string | null
  chainId: number
  blockNumber: number | null
  isTestNetwork: boolean
}

function auth(token: string) {
  return { token }
}

export function listProjectPayments(token: string, projectId: string) {
  return apiRequest<{ payments: Payment[] }>(
    `/api/v1/projects/${projectId}/payments`,
    {
      ...auth(token),
      method: 'GET',
    },
  )
}

export function listMilestonePayments(token: string, milestoneId: string) {
  return apiRequest<{ payments: Payment[] }>(
    `/api/v1/milestones/${milestoneId}/payments`,
    {
      ...auth(token),
      method: 'GET',
    },
  )
}

export function reportMilestonePayment(
  token: string,
  milestoneId: string,
  txHash: string,
) {
  return apiRequest<{ payment: Payment; verification: PaymentVerification }>(
    `/api/v1/milestones/${milestoneId}/payments`,
    {
      ...auth(token),
      method: 'POST',
      body: { txHash },
    },
  )
}

export function syncPayment(token: string, paymentId: string) {
  return apiRequest<{ payment: Payment; verification: PaymentVerification }>(
    `/api/v1/payments/${paymentId}/sync`,
    {
      ...auth(token),
      method: 'POST',
    },
  )
}
