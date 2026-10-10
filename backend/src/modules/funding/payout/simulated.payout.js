import { PayoutProvider } from './payout.provider.js'

/**
 * Default Simulated Payout Provider.
 * Generates a mock reference `SIM-PAYOUT-<fundId>`.
 * Records a simulated release only; transfers no real money.
 */
export class SimulatedPayoutProvider extends PayoutProvider {
  async createPayout({ fundId, milestoneId, amount, currency }) {
    const reference = `SIM-PAYOUT-${fundId}`
    return {
      provider: 'simulated',
      reference,
      status: 'PROCESSED',
      label: 'Sandbox payout',
      amount,
      currency: currency || 'INR',
      milestoneId,
      simulatedAt: new Date().toISOString(),
    }
  }
}

