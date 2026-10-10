import { apiRequest } from './client'

export type FeeCalculation = {
  projectAmountCents: number
  feeRate: number
  feeAmountCents: number
  totalPayableCents: number
  feeAmountPaise: number
  totalPayablePaise: number
}

export type FundingStatusResponse = {
  enabled: boolean
  keyId?: string
  currency?: string
  isFunded: boolean
  totalAmountPaise?: number
  totalAmountCents?: number
  feeEstimate?: FeeCalculation | null
  activeAgreement?: {
    id: string
    version: number
    title: string
    totalPayment: number
    status: string
  } | null
  funding: {
    id: string
    projectId: string
    agreementId: string
    clientId: string
    amount: number
    currency: string
    status: string
    feeAmount?: number
    totalPayable?: number
    feeRate?: number
    feeStatus?: string
    gatewayProvider: string
    gatewayOrderId: string | null
    gatewayPaymentId: string | null
    paidAt: string | null
    createdAt: string
  } | null
  milestoneFunds: Array<{
    id: string
    projectId: string
    milestoneId: string
    fundingId: string
    milestoneTitle: string | null
    milestoneStatus: string | null
    sortOrder: number
    amount: number
    status: 'HELD' | 'RELEASED' | 'FAILED' | 'REFUNDED'
    failureReason?: string | null
    payoutReference: string | null
    releasedAt: string | null
    createdAt: string
  }>
  notice?: string
}

export type CreateFundingOrderResponse = {
  orderId: string
  amount: number
  amountPaise: number
  amountCents: number
  feeAmountCents: number
  totalPayableCents: number
  feeRate: number
  currency: string
  keyId: string
  agreementVersion: number
  fundingId: string
  projectTitle: string
}

export type VerifyFundingPaymentResponse = {
  success: boolean
  fundingId: string
  isFunded: boolean
  notice: string
}

export type ReleaseMilestonePaymentResponse = {
  success: boolean
  milestoneFund: {
    id: string
    milestoneId: string
    amount: number
    status: string
    failureReason?: string | null
    payoutReference: string | null
    releasedAt: string | null
  }
  notice: string
}

export function getFundingStatus(token: string, projectId: string) {
  return apiRequest<FundingStatusResponse>(
    `/api/v1/projects/${projectId}/funding/status`,
    {
      token,
      method: 'GET',
    },
  )
}

export function createFundingOrder(
  token: string,
  projectId: string,
  notes?: Record<string, unknown>,
) {
  return apiRequest<CreateFundingOrderResponse>(
    `/api/v1/projects/${projectId}/funding/order`,
    {
      token,
      method: 'POST',
      body: notes ? { notes } : {},
    },
  )
}

export function verifyFundingPayment(
  token: string,
  projectId: string,
  payload: {
    orderId: string
    paymentId: string
    signature: string
  },
) {
  return apiRequest<VerifyFundingPaymentResponse>(
    `/api/v1/projects/${projectId}/funding/verify`,
    {
      token,
      method: 'POST',
      body: payload,
    },
  )
}

export function releaseMilestonePayment(
  token: string,
  projectId: string,
  milestoneId: string,
  notes?: string,
) {
  return apiRequest<ReleaseMilestonePaymentResponse>(
    `/api/v1/projects/${projectId}/funding/milestones/${milestoneId}/release`,
    {
      token,
      method: 'POST',
      body: notes ? { notes } : {},
    },
  )
}

